import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { PORT, CORS_ORIGIN, getVerifyingKeys } from './src/config/index.js'
import apiRoutes from './src/routes/index.js'
import { initPromise } from './src/routes/auth.js'
import { startWhazzupUpdater, getCachedWhazzup } from './src/services/whazzup.js'
import { ipBanMiddleware, ensureBansLoaded } from './src/services/ipBan.js'
import { ensureDeviceBansLoaded } from './src/services/deviceBan.js'
import { trackSocketIp } from './src/services/ipHopping.js'
import { backupDeviceFingerprints } from './src/services/deviceFpBackup.js'
import prisma from './src/utils/prisma.js'
import { SECURITY_RETENTION_HOURS } from './src/routes/security.js'
import rateLimit from 'express-rate-limit'
import { getClientIp } from './src/utils/client.js'
import { recordIp, startIpTracker } from './src/middleware/ipTracker.js'

// 判断是否运行在 PM2 下（生产环境由 PM2 守护）
const underPm2 = process.env.pm_id !== undefined || !!process.env.PM2_HOME

// 全局捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason) => {
  console.error('[未捕获的 Promise 拒绝]', reason)
  // 生产（PM2）下退出以触发自动重启；本地开发保持存活便于排查，避免服务静默挂掉
  if (underPm2) process.exit(1)
})
process.on('uncaughtException', (err) => {
  console.error('[未捕获的异常]', err.message)
  if (err.stack) console.error(err.stack)
  if (underPm2) process.exit(1)
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const httpServer = createServer(app)

// 真实 IP 提取统一使用 src/utils/client.js 导出的 getClientIp（安全加固版）
// 注意: 本文件不得再声明同名函数, 否则 ESM 会报
// "Identifier 'getClientIp' has already been declared" 导致启动崩溃

// Socket.IO 实时通信（带 JWT 认证）
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, credentials: true }
})

// 在线用户跟踪：改用数据库表 OnlineUser（PM2 cluster ×4 跨实例共享, 保证计数准确）
// 表结构: OnlineUser(cid PK, username, lastSeen)；lastSeen 2 分钟内视为在线
async function onlineCount() {
  try {
    const rows = await prisma.$queryRaw`SELECT COUNT(*) AS n FROM OnlineUser WHERE lastSeen >= DATE_SUB(NOW(3), INTERVAL 2 MINUTE)`
    return Number(rows[0]?.n || 0)
  } catch { return 0 }
}
async function onlineList() {
  try {
    return await prisma.$queryRaw`SELECT cid, username, lastSeen FROM OnlineUser WHERE lastSeen >= DATE_SUB(NOW(3), INTERVAL 2 MINUTE) ORDER BY lastSeen DESC`
  } catch { return [] }
}
async function broadcastOnline() {
  const [count, list] = await Promise.all([onlineCount(), onlineList()])
  io.emit('online:count', count)
  io.emit('online:list', list)
}

// 定期清理僵尸连接（2 分钟无心跳）
setInterval(async () => {
  try {
    await prisma.$executeRaw`DELETE FROM OnlineUser WHERE lastSeen < DATE_SUB(NOW(3), INTERVAL 2 MINUTE)`
    await broadcastOnline()
  } catch (e) { console.error('[OnlineUser 清理失败]', e?.message) }
}, 60000)

io.use((socket, next) => {
  // 允许无 token 的连接（只读功能）
  // 但 user:online 事件会从 socket.data.user 取身份
  const token = socket.handshake.auth?.token || socket.handshake.query?.token
  if (token) {
    const keys = getVerifyingKeys()
    for (const key of keys) {
      try {
        const decoded = jwt.verify(token, key)
        socket.data.user = decoded
        break
      } catch {
        // 继续用下一个密钥尝试
      }
    }
  }
  next()
})

io.on('connection', (socket) => {
  console.log('[Socket.IO] 用户连接:', socket.id)

  // 用户上线（从 JWT 取身份，不信任客户端输入）
  socket.on('user:online', async () => {
    const user = socket.data.user
    if (user?.cid) {
      // IP 跳变检测：Socket.IO 上线上报（经 nginx 需 X-Forwarded-For，见 deploy/nginx-cwfly-v6.conf socket.io location）
      trackSocketIp(socket, user.cid)
      try {
        await prisma.$executeRaw`
          INSERT INTO OnlineUser (cid, username, lastSeen) VALUES (${String(user.cid)}, ${user.username || ''}, NOW(3))
          ON DUPLICATE KEY UPDATE username = VALUES(username), lastSeen = NOW(3)
        `
        await broadcastOnline()
      } catch (e) { console.error('[OnlineUser 上线失败]', e?.message) }
    }
  })

  // 用户心跳（防止僵尸连接）
  socket.on('user:heartbeat', async () => {
    const user = socket.data.user
    if (user?.cid) {
      try {
        await prisma.$executeRaw`UPDATE OnlineUser SET lastSeen = NOW(3) WHERE cid = ${String(user.cid)}`
      } catch (e) { console.error('[OnlineUser 心跳失败]', e?.message) }
    }
  })

  // 加入活动房间
  socket.on('event:join', (eventId) => {
    socket.join(`event:${eventId}`)
    socket.to(`event:${eventId}`).emit('event:user-joined', { socketId: socket.id })
  })

  // 离开活动房间
  socket.on('event:leave', (eventId) => {
    socket.leave(`event:${eventId}`)
  })

  // 活动实时消息
  socket.on('event:message', (data) => {
    const user = socket.data.user
    if (!user) return
    const text = String(data.text || '').slice(0, 500)
    io.to(`event:${data.eventId}`).emit('event:message', {
      socketId: socket.id,
      username: user.username,
      text,
      time: new Date().toLocaleString('zh-CN')
    })
  })

  // 断开连接
  socket.on('disconnect', () => {
    console.log('[Socket.IO] 用户断开:', socket.id)
    // 不立即删除在线记录（同用户可能多标签/多连接/分布多实例），由 60s 清理兜底
    broadcastOnline()
  })
})

app.use(helmet({
  contentSecurityPolicy: false,  // 由后面的自定义 CSP 处理
  crossOriginOpenerPolicy: false, // 避免 Chrome 连接问题
  crossOriginResourcePolicy: false,
}))
app.use(cors({ origin: CORS_ORIGIN, credentials: true, exposedHeaders: ['X-Renewed-Token'] }))

// ========== 请求级访问日志（证据链：还原页面浏览时间线） ==========
// 2026-08-05 新增：除 PM2 控制台 morgan('dev') 外，落盘到 backend/logs/access-YYYY-MM-DD.log，
// 记录真实客户端 IP（反代后 req.ip=127.0.0.1，须取 X-Forwarded-For 首段）、设备指纹、Cookie、UA、Referer。
// 与 nginx access_log（deploy/nginx-cwfly-v6.conf）互为双保险。
const REQUEST_LOG_DIR = path.resolve(__dirname, 'logs')
try { fs.mkdirSync(REQUEST_LOG_DIR, { recursive: true }) } catch { /* ignore */ }

let requestLogStream = createRequestLogStream()
function createRequestLogStream() {
  const date = new Date().toISOString().slice(0, 10)
  return fs.createWriteStream(path.join(REQUEST_LOG_DIR, `access-${date}.log`), { flags: 'a' })
}
// 每日 00:00 切换日志文件（日切，便于按天固证）
setInterval(() => {
  const now = new Date()
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    try {
      requestLogStream.end()
      requestLogStream = createRequestLogStream()
    } catch { /* ignore */ }
  }
}, 60 * 1000)

// morgan 自定义 token：真实 IP 与设备指纹
morgan.token('real-ip', (req) => getClientIp(req) || '-')
morgan.token('device-fp', (req) => req.headers['x-device-fp'] || '-')
morgan.token('cookies', (req) => (req.headers.cookie || '').slice(0, 500))
app.use(morgan(':date[iso] :real-ip ":method :url HTTP/:http-version" :status :response-time ms :res[content-length] ":referrer" ":user-agent" fp=:device-fp cookie=":cookies"', { stream: requestLogStream }))
// 控制台仍保留简洁 dev 输出
app.use(morgan('dev'))

// ========== IP 封禁（全局，最优先拦截被封禁 IP） ==========
// 置于 body parser 之前，被封禁 IP 的所有请求直接 403
try {
  app.use(ipBanMiddleware)
} catch (err) {
  console.error('[IpBan] 中间件加载失败:', err.message)
}

// ========== 安全响应头（防 XSS/点击劫持/MIME 嗅探/信息泄露） ==========
// 页面级 CSP/HSTS 由 nginx 统一设置（覆盖静态资源）；此处覆盖 API 响应
app.use((req, res, next) => {
  // MIME 嗅探防护
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // 点击劫持防护：仅允许同源 iframe
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  // 来源策略：跨域仅传源，降低 Referer 泄露
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  // 权限策略：禁用摄像头/麦克风/定位/支付/USB
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  // HSTS：强制 HTTPS（仅在已启用 HTTPS 时生效）
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})
// 注意: body parser 会干扰 multer 解析 multipart/form-data
// multipart 请求必须跳过所有 body parser，让 multer 单独处理
const urlencodedParser = express.urlencoded({ extended: true })
const jsonParser = express.json({ limit: '10mb' })
app.use((req, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase()
  if (ct.startsWith('multipart/form-data')) return next()
  urlencodedParser(req, res, next)
})
app.use((req, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase()
  if (ct.startsWith('multipart/form-data')) return next()
  jsonParser(req, res, next)
})

// ========== 网络日志: 记录每个访问后端的客户端 IP ==========
app.use(recordIp)

// ========== 反爬虫/防扫描安全中间件 ==========

// 1. 全局 API 速率限制（每 IP 每分钟最多 60 次请求）
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 分钟窗口
  max: 60,                     // 最多 60 次
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  // 与各路由级限流器同按 IP 计数属预期设计
  validate: { singleCount: false },
  keyGenerator: (req) => getClientIp(req)
})
app.use('/api', globalLimiter)

// 2. 可疑爬虫/非浏览器 User-Agent 拦截
const BLOCKED_AGENTS = [
  'curl', 'wget', 'python-requests', 'python-httpx', 'go-http-client',
  'axios', 'aiohttp', 'scrapy', 'java/', 'okhttp', 'libwww',
  'perl', 'ruby', 'php', 'net/http', 'http_client', 'httpclient',
  'Apache-HttpClient', 'Java', 'urllib', 'WWW-Mechanize',
]
app.use('/api', (req, res, next) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase()
  // 公开接口放行（含追踪像素与网络上报：由浏览器 <img>/fetch 发起，须避免被非浏览器拦截逻辑误伤）
  const publicPrefixes2 = ['/auth/login', '/auth/register', '/auth/check-cid', '/events', '/dashboard', '/flightplans/fsd', '/profile', '/security/pixel', '/security/network-info']
  if (publicPrefixes2.some(p => req.path.startsWith(p))) return next()
  // 第一方桌面客户端（my-flight-sim C++ 客户端）放行
  if (ua.startsWith('my-flight-sim/')) return next()
  // 允许真实浏览器（包含 Mozilla）
  if (ua.includes('mozilla') && ua.includes('like gecko')) return next()
  // L-1 修复：统一拒绝文案——缺失 UA 与命中黑名单返回同一响应，不向攻击者逐项反馈校验逻辑
  for (const agent of BLOCKED_AGENTS) {
    if (ua.includes(agent)) {
      return res.status(403).json({ success: false, message: '请求被拒绝' })
    }
  }
  if (!ua.trim()) {
    return res.status(403).json({ success: false, message: '请求被拒绝' })
  }
  next()
})

// 3. 安全响应头
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('X-XSS-Protection', '1; mode=block')
  res.set('Referrer-Policy', 'same-origin')
  // 宽松 CSP（兼容 WebSocket 和第三方资源）
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://webapi.amap.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https:; connect-src 'self' https://cwflysim.cn https://www.cwflysim.cn wss://cwflysim.cn wss://www.cwflysim.cn; font-src 'self' data:; frame-src 'none'; object-src 'none'")
  next()
})

// 静态文件服务
// 安全(2026-10-25 审计 P0-1): 上传内容一律以沙箱响应头提供——
// CSP sandbox + nosniff 确保任何漏网的 HTML/SVG 都不能同源执行脚本
const uploadsSandbox = (req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'none'; sandbox")
  res.set('X-Content-Type-Options', 'nosniff')
  next()
}
app.use('/uploads/avatars', uploadsSandbox, express.static(path.resolve(__dirname, 'uploads/avatars')))
app.use('/uploads/posters', uploadsSandbox, express.static(path.resolve(__dirname, 'uploads/posters')))
app.use('/uploads/backgrounds', uploadsSandbox, express.static(path.resolve(__dirname, 'uploads/backgrounds')))
// 会议文档通过 API 鉴权后访问
app.use('/uploads', (req, res, next) => {
  // 仅允许公开的子目录，其余返回 404
  if (req.path.startsWith('/avatars') || req.path.startsWith('/posters') || req.path.startsWith('/backgrounds')) return next()
  res.status(404).end()
})

// Whazzup 在线状态 JSON（供前端/第三方直接拉取）
app.get('/whazzup.json', (req, res) => {
  const data = getCachedWhazzup()
  if (data) {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', 'max-age=15')
    res.json(data)
  } else {
    res.status(503).json({ error: 'whazzup data not ready' })
  }
})

app.use('/api', apiRoutes)

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'CWFLY 服务运行正常', timestamp: new Date().toISOString() })
})

app.use((req, res) => {
  res.status(404).json({ success: false, message: '资源不存在' })
})

app.use((err, req, res, next) => {
  console.error('[Error]', err.message)
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.expose ? err.message : '服务器内部错误'
  })
})

// 等待管理员初始化完成再启动服务
await initPromise

// IP 封禁列表缓存预热
await ensureBansLoaded()

// ========== 安全事件自动清理（每1小时；保留期由 SECURITY_RETENTION_HOURS 控制，默认 30 天） ==========
// 2026-08-05 证据链改造：旧值固定 24h 会让跨天行为轨迹无法回溯，改为可配置（见 src/routes/security.js）
const SECURITY_CLEANUP_INTERVAL = 60 * 60 * 1000  // 1 小时
const SECURITY_RETENTION_MS = SECURITY_RETENTION_HOURS * 60 * 60 * 1000

async function cleanupSecurityEvents() {
  try {
    const cutoff = new Date(Date.now() - SECURITY_RETENTION_MS)
    const result = await prisma.securityEvent.deleteMany({
      where: { createdAt: { lt: cutoff } }
    })
    if (result.count > 0) {
      console.log(`[Security] 已清理 ${result.count} 条过期安全事件记录`)
    }
  } catch (err) {
    console.error('[Security] 清理失败:', err.message)
  }
}

// 立即执行一次清理，然后定时执行
cleanupSecurityEvents()
setInterval(cleanupSecurityEvents, SECURITY_CLEANUP_INTERVAL)

// ========== 登录失败记录清理（每1小时，删除超过24小时的失败计数，控制表体积） ==========
const LOGIN_ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000

async function cleanupLoginAttempts() {
  try {
    const cutoff = new Date(Date.now() - LOGIN_ATTEMPT_RETENTION_MS)
    const result = await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: cutoff } }
    })
    if (result.count > 0) {
      console.log(`[LoginLock] 已清理 ${result.count} 条过期登录失败记录`)
    }
  } catch (err) {
    console.error('[LoginLock] 清理失败:', err.message)
  }
}
cleanupLoginAttempts()
setInterval(cleanupLoginAttempts, SECURITY_CLEANUP_INTERVAL)

// 数据库定期备份（每 6 小时）
const { backupDatabase, cleanOldBackups } = await import('./src/services/keyRotation.js')
cleanOldBackups()  // 启动时先清理旧备份
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000  // 6 小时
setInterval(() => {
  backupDatabase()
  cleanOldBackups()
  // 设备指纹证据备份（LoginLog/SecurityEvent/User 指纹导出 + SHA-256 固证），
  // 防止 SecurityEvent 自动清理（默认30天）导致设备指纹证据丢失
  backupDeviceFingerprints()
}, BACKUP_INTERVAL)

httpServer.listen(PORT, () => {
  // 启动 whazzup.json 自动更新
  startWhazzupUpdater()
  // 预热设备指纹封禁缓存
  ensureDeviceBansLoaded().catch(e => console.error('[DeviceBan] 预热失败:', e?.message))
  // 启动网络日志 IP 追踪（每 60s 落库）
  startIpTracker()

  console.log(`\n  ╔══════════════════════════════╗`)
  console.log(`  ║   CWFLY API Server v2       ║`)
  console.log(`  ║   http://localhost:${PORT}       ║`)
  console.log(`  ║   Whazzup: /whazzup.json      ║`)
  console.log(`  ║   Socket.IO 实时通信已启动    ║`)
  console.log(`  ╚══════════════════════════════╝\n`)

  // 首次备份延迟 60 秒（等数据库就绪）
  setTimeout(() => {
    backupDatabase()
    backupDeviceFingerprints()
  }, 60000)
})

export { app, httpServer, io }
