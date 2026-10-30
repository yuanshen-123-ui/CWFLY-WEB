import 'dotenv/config'
import path from 'path'
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
import { startFsdTracker } from './src/services/fsdTracker.js'
import prisma from './src/utils/prisma.js'
import rateLimit from 'express-rate-limit'

// 全局捕获未处理的 Promise 拒绝，防止进程崩溃
process.on('unhandledRejection', (reason) => {
  console.error('[未捕获的 Promise 拒绝]', reason)
  process.exit(1)  // 安全退出，由 PM2 重启
})
process.on('uncaughtException', (err) => {
  console.error('[未捕获的异常]', err.message)
  process.exit(1)  // 安全退出，由 PM2 重启
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const httpServer = createServer(app)

// 获取真实 IP 的辅助函数（受信任的反代）
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || ''
}

// Socket.IO 实时通信（带 JWT 认证）
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, credentials: true }
})

// 在线用户跟踪
global.__online_users__ = new Map()

// 定期清理僵尸连接（2 分钟无心跳）
setInterval(() => {
  const now = Date.now()
  for (const [cid, info] of global.__online_users__) {
    if (now - info.lastSeen > 120000) {
      global.__online_users__.delete(cid)
    }
  }
  io.emit('online:count', global.__online_users__.size)
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
  socket.on('user:online', () => {
    const user = socket.data.user
    if (user?.cid) {
      global.__online_users__.set(user.cid, { socketId: socket.id, username: user.username, cid: user.cid, lastSeen: Date.now() })
      io.emit('online:count', global.__online_users__.size)
      io.emit('online:list', Array.from(global.__online_users__.values()))
    }
  })

  // 用户心跳（防止僵尸连接）
  socket.on('user:heartbeat', () => {
    const user = socket.data.user
    if (user?.cid && global.__online_users__.has(user.cid)) {
      global.__online_users__.get(user.cid).lastSeen = Date.now()
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
    for (const [cid, info] of global.__online_users__) {
      if (info.socketId === socket.id) {
        global.__online_users__.delete(cid)
        break
      }
    }
    io.emit('online:count', global.__online_users__.size)
    io.emit('online:list', Array.from(global.__online_users__.values()))
  })
})

app.use(helmet({
  contentSecurityPolicy: false,  // 由后面的自定义 CSP 处理
  crossOriginOpenerPolicy: false, // 避免 Chrome 连接问题
  crossOriginResourcePolicy: false,
}))
app.use(cors({ origin: CORS_ORIGIN, credentials: true }))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ========== 反爬虫/防扫描安全中间件 ==========

// 1. 全局 API 速率限制（每 IP 每分钟最多 60 次请求）
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 分钟窗口
  max: 60,                     // 最多 60 次
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown'
  }
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
  // 公开接口放行
  const publicPrefixes2 = ['/auth/login', '/auth/register', '/auth/check-cid', '/events', '/dashboard', '/flightplans/fsd']
  if (publicPrefixes2.some(p => req.path.startsWith(p))) return next()
  // 允许真实浏览器（包含 Mozilla）
  if (ua.includes('mozilla') && ua.includes('like gecko')) return next()
  // 检查是否匹配爬虫特征
  for (const agent of BLOCKED_AGENTS) {
    if (ua.includes(agent)) {
      return res.status(403).json({ success: false, message: '拒绝非浏览器访问' })
    }
  }
  // 无 User-Agent 也拦截
  if (!ua.trim()) {
    return res.status(403).json({ success: false, message: '缺少 User-Agent' })
  }
  next()
})

// 3. 安全响应头
app.use((req, res, next) => {

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
app.use('/uploads/avatars', express.static(path.resolve(__dirname, 'uploads/avatars')))
app.use('/uploads/posters', express.static(path.resolve(__dirname, 'uploads/posters')))
// 会议文档通过 API 鉴权后访问
app.use('/uploads', (req, res, next) => {
  // 仅允许公开的子目录，其余返回 404
  if (req.path.startsWith('/avatars') || req.path.startsWith('/posters')) return next()
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

// ========== 安全事件自动清理（每1小时，删除超过24小时的记录） ==========
const SECURITY_CLEANUP_INTERVAL = 60 * 60 * 1000  // 1 小时
const SECURITY_RETENTION_MS = 24 * 60 * 60 * 1000 // 24 小时

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

// 数据库定期备份（每 6 小时）
const { backupDatabase, cleanOldBackups } = await import('./src/services/keyRotation.js')
cleanOldBackups()  // 启动时先清理旧备份
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000  // 6 小时
setInterval(() => {
  backupDatabase()
  cleanOldBackups()
}, BACKUP_INTERVAL)

httpServer.listen(PORT, () => {
  // 启动 whazzup.json 自动更新
  startWhazzupUpdater()
  // 启动 FSD9 直连轨迹追踪
  startFsdTracker(io)

  console.log(`\n  ╔══════════════════════════════╗`)
  console.log(`  ║   CWFLY API Server v2       ║`)
  console.log(`  ║   http://localhost:${PORT}       ║`)
  console.log(`  ║   Whazzup: /whazzup.json      ║`)
  console.log(`  ║   Socket.IO 实时通信已启动    ║`)
  console.log(`  ╚══════════════════════════════╝\n`)

  // 首次备份延迟 60 秒（等数据库就绪）
  setTimeout(backupDatabase, 60000)
})

export { app, httpServer, io }
