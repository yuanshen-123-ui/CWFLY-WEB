import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import prisma, { findUserWithCredentials } from '../utils/prisma.js'
import { verifyCode } from '../utils/mailer.js'
import { getClientIp, getDeviceFp, getUserAgent } from '../utils/client.js'
import { isDeviceBanned } from '../services/deviceBan.js'
import { signToken, verifyTokenForRefresh } from '../utils/token.js'
import { trackRequestIp } from '../services/ipHopping.js'
import { authenticate } from '../middleware/auth.js'
import { loginLimiter, registerLimiter, sensitiveLimiter } from './security.js'
import { verifyTurnstile } from '../utils/turnstile.js'

const router = Router()

// ===== 登录失败锁定（数据库 LoginAttempt 表共享，跨 PM2 集群实例生效） =====
// 内存计数在 cluster×4 下每实例独立（nginx 轮询分发，无法真正限 5 次），
// 改用数据库共享计数：同一账号 15 分钟内失败 5 次 → 锁定 15 分钟；成功登录即清空。
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000   // 窗口 15 分钟
const LOGIN_LOCK_MAX_FAILS = 5                 // 最多 5 次失败

async function checkLoginLock(cid) {
  if (!cid) return null
  const cutoff = new Date(Date.now() - LOGIN_LOCK_WINDOW_MS)
  // 顺带清理该账号已过期的失败记录（保持计数窗口准确）
  await prisma.loginAttempt.deleteMany({ where: { userId: cid, createdAt: { lt: cutoff } } }).catch(() => {})
  const count = await prisma.loginAttempt.count({ where: { userId: cid, createdAt: { gte: cutoff } } })
  return count >= LOGIN_LOCK_MAX_FAILS ? '登录失败次数过多，账号已临时锁定 15 分钟' : null
}

async function recordLoginFailure(cid, ip) {
  if (!cid) return
  await prisma.loginAttempt.create({ data: { userId: cid, ip } }).catch(() => {})
}

async function clearLoginFailures(cid) {
  if (!cid) return
  await prisma.loginAttempt.deleteMany({ where: { userId: cid } }).catch(() => {})
}

// ========== 密码加密：直接 bcrypt（符合行业标准） ==========
// 审计发现：原四层加密（SHA-256→AES→bcrypt）存在设计缺陷
// - AES 使用固定 IV，不提供安全增益
// - AES 密钥默认由 JWT 密钥派生，存在密钥复用风险
// - SHA-256 是高速哈希，不适合密码存储
// 修复方案：直接使用 bcrypt（内置独立随机盐，抗暴力破解）

/**
 * bcrypt 哈希密码（自动生成独立随机盐）
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}

/**
 * bcrypt 验证密码
 */
async function verifyPassword(password, storedHash) {
  return bcrypt.compare(password, storedHash)
}

/**
 * SHA-256 六进制（供 FSD 挑战-响应认证使用）
 */
function sha256Hex(password) {
  return createHash('sha256').update(password, 'utf8').digest('hex')
}

// ========== 系统初始化 ==========
// 审计发现：原代码硬编码管理员密码并在每次启动时重置
// 修复方案：管理员密码必须通过环境变量 ADMIN_PASSWORD 设置
// 首次启动时创建管理员，之后不再重置密码

async function initAdmin() {
  try {
    // 如果旧管理员 000000 存在但 0000 已存在，删除旧的
    const oldAdmin = await prisma.user.findUnique({ where: { cid: '000000' } })
    if (oldAdmin) {
      const newExists = await prisma.user.findUnique({ where: { cid: '0000' } })
      if (newExists) {
        await prisma.user.delete({ where: { cid: '000000' } })
        console.log('[Init] 旧管理员 000000 已删除（0000 已存在）')
      } else {
        await prisma.user.update({ where: { cid: '000000' }, data: { cid: '0000' } })
        console.log('[Init] 旧管理员 CID 000000 已迁移到 0000')
      }
    }

    const exists = await prisma.user.findUnique({ where: { cid: '0000' } })
    if (!exists) {
      // 首次启动：从环境变量读取管理员密码，没有则生成随机密码
      const adminPassword = process.env.ADMIN_PASSWORD
      if (!adminPassword) {
        console.error('\n  ╔═══════════════════════════════════════════════╗')
        console.error('  ║  安全错误: ADMIN_PASSWORD 环境变量未设置       ║')
        console.error('  ║  请在 .env 中设置管理员初始密码               ║')
        console.error('  ╚═══════════════════════════════════════════════╝\n')
        process.exit(1)
      }
      const hash = await hashPassword(adminPassword)
      await prisma.user.create({
        data: { cid: '0000', username: '管理员', password: hash, rating: 12, permissions: 'user,flightplan,event,controller,staff,ticket,online', fsdLevel: 12, fsdPasswordHash: sha256Hex(adminPassword) }
      })
      console.log('')
      console.log('╔═══════════════════════════════════════════╗')
      console.log('║         默认管理员已创建                  ║')
      console.log('╠═══════════════════════════════════════════╣')
      console.log('║  CID:         0000                       ║')
      console.log('║  密码:        (环境变量 ADMIN_PASSWORD)    ║')
      console.log('║  FSD Level:   12 (ADM)                   ║')
      console.log('║  请立即登录并修改密码！                   ║')
      console.log('╚═══════════════════════════════════════════╝')
      console.log('')
    } else {
      // 管理员已存在，不重置密码
      console.log('[Init] 管理员已存在，跳过初始化')
    }
  } catch (e) {
    console.error('[Init] 管理员初始化失败:', e.message)
  }
}

// 确保在服务器就绪前完成初始化
export const initPromise = initAdmin()

/** 生成 16 位强密码（用于一次性初始密码） */
function generateStrongPassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[crypto.randomInt(chars.length)]
  }
  return result
}
import crypto from 'crypto'

// 检查管理员是否存在（仅返回 exists，不泄露任何元数据）
router.get('/check-admin', async (req, res) => {
  try {
    const count = await prisma.user.count({ where: { rating: { gte: 11 } } })
    res.json({ success: true, exists: count > 0 })
  } catch {
    res.json({ success: true, exists: false })
  }
})

// 检查 CID 是否已注册
router.get('/check-cid', async (req, res) => {
  try {
    const { cid } = req.query
    if (!cid) return res.status(400).json({ success: false, message: '缺少 CID' })
    const user = await prisma.user.findUnique({ where: { cid } })
    res.json({ success: true, exists: !!user })
  } catch {
    res.status(500).json({ success: false, message: '查询失败' })
  }
})

// 注册
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { cid, username, password, email, emailCode } = req.body
    // ===== 永久限制：同一设备/网络只能注册一次（数据库持久化，重启/跨实例均生效） =====
    const registerFp = getDeviceFp(req)
    const registerIp = getClientIp(req)
    // 设备指纹黑名单：被封禁的设备不允许注册新账号（防换小号绕过）
    if (registerFp && isDeviceBanned(registerFp)) {
      return res.status(403).json({ success: false, code: 'DEVICE_BANNED', message: '该设备已被封禁，无法注册新账号' })
    }
    if (registerFp) {
      const dupFp = await prisma.user.findFirst({ where: { registerFp } })
      if (dupFp) return res.status(429).json({ success: false, message: '该设备已注册过账号，请更换设备或联系管理员' })
    }
    if (registerIp) {
      const dupIp = await prisma.user.findFirst({ where: { registerIp } })
      if (dupIp) return res.status(429).json({ success: false, message: '该设备已注册过账号，请更换设备或联系管理员' })
    }
    if (!cid || !username || !password || !email || !emailCode) {
      return res.status(400).json({ success: false, message: '请填写完整信息（邮箱及验证码必填）' })
    }
    // L-3 修复：密码策略前置校验（在 CID/邮箱/验证码等重活之前，快速失败且外部可验证）
    const pwErr = validatePassword(password)
    if (pwErr) return res.status(400).json({ success: false, message: pwErr })
    if (cid.length !== 4 || !/^\d{4}$/.test(cid)) {
      return res.status(400).json({ success: false, message: 'CID 必须为4位数字' })
    }
    const exist = await prisma.user.findUnique({ where: { cid } })
    if (exist) {
      return res.status(409).json({ success: false, message: '该 CID 已被注册' })
    }
    // 检查邮箱是否已注册
    const emailExist = await prisma.user.findFirst({ where: { email } })
    if (emailExist) {
      return res.status(409).json({ success: false, message: '该邮箱已被注册' })
    }
    // 服务端强制校验邮箱验证码（一次性，校验通过后立即失效，防批量刷号）
    const codeOk = await verifyCode(email, emailCode)
    if (!codeOk) {
      return res.status(400).json({ success: false, message: '邮箱验证码错误或已过期' })
    }
    // ===== Turnstile 人机验证（H-2 修复：所有环境统一强制 siteverify，fail-closed）=====
    // 旧实现仅 production 校验、其余环境只看 token 非空 → 伪造 token 可直接注册。
    const ts = await verifyTurnstile(req, req.body.turnstileToken)
    if (!ts.ok) {
      return res.status(ts.status).json({ success: false, message: ts.message })
    }
    // ===== 证据链：捕获注册来源（真实 IP / 设备指纹 / UA）=====
    const registerUserAgent = getUserAgent(req)

    const hash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        cid, username, password: hash, rating: 0, permissions: '', fsdLevel: 0,
        email: email || '', fsdPasswordHash: sha256Hex(password),
        registerIp, registerFp, registerUserAgent
      }
    })
    // 注册即写登录日志（证据链：注册时间线的 IP/设备/浏览器三字段铁证）
    // await 保证注册响应返回前证据已落库（失败不阻塞注册，仅吞错并输出）
    await prisma.loginLog.create({
      data: { userId: cid, ip: registerIp, userAgent: registerUserAgent, deviceFp: registerFp, success: true, type: 'register' }
    }).catch(err => {
      console.error('[auth.js] 注册日志写入失败:', err?.message)
    })
    const token = signToken(user)
    // 发送注册欢迎邮件
    if (user.email) {
      const { sendNotification } = await import('../utils/mailer.js')
      sendNotification(user.email, {
        subject: '欢迎加入 CW 模拟飞行',
        intro: `欢迎您，${user.username}！`,
        body: '您的账号已成功注册。您可以使用 CID 登录平台，开始您的模拟飞行之旅。',
        action: '开始体验',
        actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`,
        _cid: user.cid
      }).catch(() => {})
    }
    res.json({
      success: true,
      data: { token, user: { cid: user.cid, username: user.username, rating: user.rating ?? 0, permissions: user.permissions || '', fsdLevel: user.fsdLevel ?? 0, createdAt: user.createdAt } }
    })
  } catch (e) {
    console.error('[auth.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 登录
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { cid, password } = req.body
    const ip = getClientIp(req)
    const userAgent = getUserAgent(req)
    const deviceFp = getDeviceFp(req)

    // 设备指纹黑名单：被封禁的设备不允许登录（即使换账号）
    if (deviceFp && isDeviceBanned(deviceFp)) {
      await prisma.loginLog.create({
        data: { userId: cid || 'unknown', ip, userAgent, deviceFp, success: false, type: 'login', failReason: 'device_banned' }
      }).catch(() => {})
      return res.status(403).json({ success: false, code: 'DEVICE_BANNED', message: '该设备已被封禁，请联系管理员' })
    }

    // 登录失败锁定检查（数据库共享，跨集群实例）
    const lockMsg = await checkLoginLock(cid)
    if (lockMsg) {
      return res.status(429).json({ success: false, message: lockMsg })
    }

    // 使用原始 SQL 查询获取密码字段（避免 Prisma omit 干扰）
    const userWithCreds = await findUserWithCredentials(cid)
    if (!userWithCreds) {
      await recordLoginFailure(cid, ip)
      await prisma.loginLog.create({
        data: { userId: cid || 'unknown', ip, userAgent, deviceFp, success: false, type: 'login', failReason: 'notfound' }
      }).catch(() => {})
      return res.status(401).json({ success: false, message: 'CID 或密码错误' })
    }
    const valid = await verifyPassword(password, userWithCreds.password)
    if (!valid) {
      await recordLoginFailure(cid, ip)
      await prisma.loginLog.create({
        data: { userId: cid, ip, userAgent, deviceFp, success: false, type: 'login', failReason: 'password' }
      }).catch(() => {})
      return res.status(401).json({ success: false, message: 'CID 或密码错误' })
    }
    // 登录成功，清除失败记录
    await clearLoginFailures(cid)

    // 登录时同步 FSD 密码哈希（兼容已有用户；与 IP 校验无关，密码已验证即同步）
    if (!userWithCreds.fsdPasswordHash || userWithCreds.fsdPasswordHash.length !== 64) {
      const fsdHash = sha256Hex(password)
      prisma.user.update({
        where: { cid },
        data: { fsdPasswordHash: fsdHash }
      }).catch(() => {})
    }

    // ===== 可信 IP 匹配（新设备/新 IP 保护）：密码正确但 IP 未匹配 → 需邮箱验证码二次验证 =====
    // 可信 IP = 注册 IP + 历史成功登录 IP；未命中 → 不签发 JWT、不写成功登录日志
    // （避免把新 IP 提前标记为可信），待邮箱验证码通过后由 /auth/login-verify 正式登录。
    const trustedIps = await getTrustedIps(userWithCreds)
    if (!trustedIps.has(ip)) {
      return res.json({
        success: true,
        needVerify: true,
        data: {
          email: userWithCreds.email || '',
          message: '检测到新设备/IP 登录，请通过邮箱验证码确认身份'
        }
      })
    }

    // IP 跳变检测：登录成功即上报活跃（配合 authenticate 中间件的请求级上报，可捕捉登录即换 IP）
    trackRequestIp(req, cid)
    // 记录成功登录（含设备指纹，确认同一设备）
    await prisma.loginLog.create({
      data: { userId: cid, ip, userAgent, deviceFp, success: true, type: 'login' }
    }).catch(() => {})
    
    const token = signToken(userWithCreds)
    res.json({
      success: true,
      data: { token, user: { cid: userWithCreds.cid, username: userWithCreds.username, rating: userWithCreds.rating ?? 0, permissions: userWithCreds.permissions || '', fsdLevel: userWithCreds.fsdLevel ?? 0, createdAt: userWithCreds.createdAt } }
    })
  } catch (e) {
    console.error('[Login Error]', e?.message || e)
    res.status(500).json({ success: false, message: '登录失败' })
  }
})

/**
 * getTrustedIps(user)
 * 作用：收集该账号的可信 IP 集合（注册 IP + 历史成功登录 IP），用于登录时新 IP 判定。
 * 调用时机：登录密码验证通过后调用；当前 IP 未命中 → 要求邮箱验证码二次验证。
 */
async function getTrustedIps(user) {
  const ips = new Set()
  if (user.registerIp) ips.add(user.registerIp)
  const logs = await prisma.loginLog.findMany({
    where: { userId: user.cid, success: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { ip: true }
  }).catch(() => [])
  for (const l of logs) if (l.ip) ips.add(l.ip)
  return ips
}

// ===== 登录二次验证：新 IP 登录 + 邮箱验证码通过后签发 JWT =====
// 场景：密码正确 + 登录 IP 不在可信集合（注册 IP / 历史成功登录 IP）→ 前端弹邮箱验证码 →
//       本端点校验验证码通过后正式登录并签发 JWT，该新 IP 从此成为可信。
router.post('/login-verify', loginLimiter, async (req, res) => {
  try {
    const { cid, emailCode } = req.body
    const ip = getClientIp(req)
    const userAgent = getUserAgent(req)
    const deviceFp = getDeviceFp(req)
    if (!cid || !emailCode) return res.status(400).json({ success: false, message: '缺少参数' })

    const user = await findUserWithCredentials(String(cid))
    if (!user) return res.status(401).json({ success: false, message: '账号不存在' })
    if (!user.email) return res.status(400).json({ success: false, message: '该账号未绑定邮箱，请联系管理员' })

    // 安全(2026-10-25 审计 P1-5): login-verify 与 /login 同等约束——
    // 登录锁定 + 设备封禁检查(此前可绕过锁定直接凭验证码签发 JWT)
    const lockMsg = await checkLoginLock(user.cid)
    if (lockMsg) return res.status(429).json({ success: false, message: lockMsg })
    const { isDeviceBanned } = await import('../services/deviceBan.js')
    if (isDeviceBanned(deviceFp)) {
      return res.status(403).json({ success: false, code: 'DEVICE_BANNED', message: '设备已被封禁' })
    }

    // 校验邮箱验证码（一次性，通过即失效）
    const ok = await verifyCode(user.email, emailCode)
    if (!ok) {
      await recordLoginFailure(user.cid, ip)
      return res.status(400).json({ success: false, message: '邮箱验证码错误或已过期' })
    }

    // 验证通过：记录成功登录（该新 IP 从此成为可信）
    await prisma.loginLog.create({
      data: { userId: user.cid, ip, userAgent, deviceFp, success: true, type: 'login' }
    }).catch(() => {})

    const token = signToken(user)
    res.json({
      success: true,
      data: { token, user: { cid: user.cid, username: user.username, rating: user.rating ?? 0, permissions: user.permissions || '', fsdLevel: user.fsdLevel ?? 0, createdAt: user.createdAt } }
    })
  } catch (e) {
    console.error('[login-verify]', e?.message || e)
    res.status(500).json({ success: false, message: '验证失败' })
  }
})

// ===== 会话续签（前端主动判定：10 分钟内活跃则续签，否则前端跳登录页）=====
// 服务器仅接受「未过期或过期不超过 10 分钟宽限」的 token；
// 过期超宽限 → 401，前端将清 token 跳转 /login 重新登录。
router.post('/refresh', async (req, res) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '请先登录' })
  }
  const token = header.replace('Bearer ', '')
  try {
    const decoded = verifyTokenForRefresh(token)
    // 安全(2026-10-25 审计 P1-2/P3-6): 续签必须查库; 用户不存在(已删号)一律拒绝,
    // 不再回退用旧 claims 重签
    const fresh = await prisma.user.findUnique({
      where: { cid: decoded.cid },
      select: { cid: true, username: true, rating: true, permissions: true, fsdLevel: true, createdAt: true }
    }).catch(() => null)
    if (!fresh) {
      return res.status(401).json({ success: false, message: '账号不存在或已注销' })
    }
    return res.json({ success: true, data: { token: signToken(fresh), user: fresh } })
  } catch (err) {
    console.error('[auth.js] refresh 失败:', err?.message)
    res.status(401).json({
      success: false,
      message: err?.expired ? '登录已过期，请重新登录' : '登录无效，请重新登录'
    })
  }
})

// 更新密码（走 authenticate 中间件：滑动续签 + IP 跳变上报统一在此生效）
router.put('/password', sensitiveLimiter, authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    const decoded = req.user
    const user = await prisma.user.findUnique({ where: { cid: decoded.cid } })
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    
    const userWithCreds = await findUserWithCredentials(decoded.cid)
    const valid = await verifyPassword(oldPassword, userWithCreds.password)
    if (!valid) return res.status(401).json({ success: false, message: '原密码错误' })
    
    const hash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { cid: decoded.cid },
      data: { password: hash, fsdPasswordHash: sha256Hex(newPassword) }
    })
    // 发送密码修改安全通知
    if (user.email) {
      const { sendSecurityAlert } = await import('../utils/mailer.js')
      const ip = getClientIp(req)
      sendSecurityAlert(user.email, {
        action: '密码修改',
        detail: '您的登录密码已被成功修改。',
        time: new Date().toLocaleString('zh-CN'),
        ip,
        _cid: decoded.cid
      }).catch(() => {})
    }
    res.json({ success: true, message: '密码已更新' })
  } catch {
    res.status(500).json({ success: false, message: '密码更新失败' })
  }
})

// 获取当前用户（走 authenticate 中间件：滑动续签 + IP 跳变上报统一在此生效）
router.get('/me', authenticate, async (req, res) => {
  try {
    // password 已被全局 omit 自动排除
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    res.json({ success: true, data: { cid: user.cid, username: user.username, rating: user.rating ?? 0, permissions: user.permissions || '', fsdLevel: user.fsdLevel ?? 0, createdAt: user.createdAt } })
  } catch {
    return res.status(401).json({ success: false, message: '登录已过期' })
  }
})

// ===== L-3 修复：服务端密码策略 =====
// 旧版无复杂度校验（纯数字 8 位可注册）。策略：8-64 位，须同时包含字母和数字，拒绝常见弱口令。
const WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwerty123', 'qwertyuiop', '11111111', '00000000', '66666666', '88888888',
  '12341234', '11223344', 'abcd1234', 'a1234567', 'abc12345', '1q2w3e4r',
  'iloveyou', 'sunshine', 'letmein1', 'cwfly123', 'cwfly1234'
])

/** 校验密码策略；通过返回空串，不通过返回错误文案 */
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 64) return '密码长度需为 8-64 位'
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '密码需同时包含字母和数字'
  if (WEAK_PASSWORDS.has(pw.toLowerCase())) return '密码过于常见，请更换'
  return ''
}

// 忘记密码 - 发送验证码（使用 mailer）
router.post('/forgot-password', sensitiveLimiter, async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ success: false, message: '请输入邮箱' })
    // H-3 修复①：不再区分「已注册/未注册」——仅在用户存在时真正发信，响应恒为统一文案，
    // 消除账号枚举预言机（同时保证发信目标只能是已注册邮箱，堵死借助本接口轰炸任意邮箱）。
    const user = await prisma.user.findFirst({ where: { email } })
    if (user) {
      const { generateCode, sendVerifyCode, storeCode } = await import('../utils/mailer.js')
      const code = generateCode()
      try {
        await sendVerifyCode(email, code, '找回密码')
        storeCode(email, code)
      } catch (mailErr) {
        console.error('[forgot-password] 邮件发送失败:', mailErr?.message)
      }
    }
    res.json({ success: true, message: '如果该邮箱已注册，验证码已发送到邮箱' })
  } catch { res.status(500).json({ success: false, message: '发送失败' }) }
})

// 重置密码（使用 mailer 验证）
router.post('/reset-password', sensitiveLimiter, async (req, res) => {
  try {
    const { email, code, password } = req.body
    if (!email || !code || !password) return res.status(400).json({ success: false, message: '请填写完整' })
    const { verifyCode } = await import('../utils/mailer.js')
    if (!(await verifyCode(email, code))) return res.status(400).json({ success: false, message: '验证码错误或已过期' })
    // H-3 修复②：用户不存在时返回与「验证码错误」一致的文案，不再泄露邮箱是否注册
    const user = await prisma.user.findFirst({ where: { email } })
    if (!user) return res.status(400).json({ success: false, message: '验证码错误或已过期' })
    // L-3 修复：重置密码同样执行密码策略
    const pwErr = validatePassword(password)
    if (pwErr) return res.status(400).json({ success: false, message: pwErr })
    const hash = await hashPassword(password)
    await prisma.user.update({ where: { cid: user.cid }, data: { password: hash, fsdPasswordHash: sha256Hex(password) } })
    res.json({ success: true, message: '密码已重置' })
  } catch { res.status(500).json({ success: false, message: '重置失败' }) }
})

export { hashPassword, verifyPassword, sha256Hex }

export default router
