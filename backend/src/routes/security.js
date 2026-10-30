/**
 * 安全监控路由
 *
 * 提供：
 * 1. 追踪像素端点（1×1 透明 GIF），用于 IP 安全监控
 * 2. 登录/注册限流（express-rate-limit）
 *
 * 数据保留策略：24 小时自动清理
 * 合规说明：仅用于安全防刷，符合《个人信息保护法》合法利益原则
 */

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import prisma from '../utils/prisma.js'
import { authenticate, requireRating } from '../middleware/auth.js'
import { getClientIp, getDeviceFp, getUserAgent, getReferrer, getUserId } from '../utils/client.js'

const router = Router()

/**
 * SecurityEvent 数据保留期（小时）。
 * 2026-08-05 证据链改造：由固定 24h 改为可配置（默认 30 天），
 * 保证页面浏览时间线 / 用户行为轨迹可跨天回溯（旧值 24h 会让第二天查不到昨天的证据）。
 * 合规：仅用于安全防刷与取证，符合《个人信息保护法》合法利益原则。
 */
export const SECURITY_RETENTION_HOURS = Math.max(
  1,
  parseInt(process.env.SECURITY_RETENTION_HOURS || '720', 10) // 默认 30 天
)

// ──────────────────────────────────────────────
// 1. 追踪像素：1×1 透明 GIF
//    GET /api/security/pixel.gif
// ──────────────────────────────────────────────

// 1×1 透明 GIF（极简，仅 43 字节）
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

// 追踪像素限流: 每 IP 每分钟最多 120 次（防止被用来刷写安全事件数据库）
const pixelLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
  // 全局 /api 限流器与本路由限流器同按 IP 计数属预期设计，关闭 singleCount 误报校验
  validate: { singleCount: false },
  keyGenerator: (req) => {
    return getClientIp(req)
  }
})

router.get('/pixel.gif', pixelLimiter, async (req, res) => {
  // 证据链：客户端 IP + 设备指纹 + UA + 来源页 + 登录用户 + 网络信息
  const ip = getClientIp(req)
  const deviceFp = getDeviceFp(req)
  const userAgent = getUserAgent(req)
  const referrer = getReferrer(req)
  const path = req.query._ref ? String(req.query._ref).slice(0, 500) : ''   // 来源页面标识
  const userId = getUserId(req)                                            // _uid 查询参数（登录 CID）
  const network = req.query._net ? String(req.query._net).slice(0, 200) : '' // effectiveType|downlink|rtt|saveData

  // 非阻塞写入数据库（不阻塞响应）
  prisma.securityEvent.create({
    data: { ip, userAgent, referrer, path, deviceFp, userId, network }
  }).catch(err => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SecurityEvent] 写入失败:', err.message)
    }
  })

  // 返回 1×1 透明 GIF
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': TRANSPARENT_GIF.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*'
  })
  res.status(200).end(TRANSPARENT_GIF)
})

// ──────────────────────────────────────────────
// 1.5 网络信息上报（可选，弥补浏览器无法读取 SSID 的缺口）
//    POST /api/security/network-info
//    浏览器无标准 Web API 读取 WiFi SSID/BSSID。
//    此端点供原生客户端 / 浏览器扩展 / 本机 Agent 等可信来源，
//    在获取到 SSID/BSSID 后按设备指纹（X-Device-Fp）回填证据链。
//    请求体: { ssid?, bssid? }
// ──────────────────────────────────────────────
const networkInfoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { singleCount: false },
  keyGenerator: (req) => {
    return getClientIp(req)
  }
})

router.post('/network-info', networkInfoLimiter, async (req, res) => {
  try {
    const ip = getClientIp(req)
    const deviceFp = getDeviceFp(req)
    const userAgent = getUserAgent(req)
    const { ssid = '', bssid = '' } = req.body || {}

    // 至少有设备指纹或 SSID 之一才记录，避免垃圾数据
    if (!deviceFp && !ssid) {
      return res.status(400).json({ success: false, message: '缺少设备指纹或网络信息' })
    }

    const network = JSON.stringify({
      ssid: String(ssid).slice(0, 100),
      bssid: String(bssid).slice(0, 100)
    })

    prisma.securityEvent.create({
      data: { ip, userAgent, deviceFp, network, path: 'network-probe' }
    }).catch(err => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[NetworkInfo] 写入失败:', err.message)
      }
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: '上报失败' })
  }
})

// ──────────────────────────────────────────────
// 2. 安全事件查询（管理员用）
//    GET /api/security/events?hours=24&page=1&ip=xxx&fp=xxx
// ──────────────────────────────────────────────

router.get('/events', authenticate, requireRating(11), async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours) || SECURITY_RETENTION_HOURS, 1), 24 * 90) // 默认全部保留期，最多 90 天
    const page = Math.max(parseInt(req.query.page) || 1, 1)
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 50, 10), 200)
    const ipFilter = req.query.ip || ''
    const fpFilter = req.query.fp || ''
    const uidFilter = req.query.uid || ''
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)

    const where = {
      createdAt: { gte: cutoff },
      ...(ipFilter ? { ip: { contains: ipFilter } } : {}),
      ...(fpFilter ? { deviceFp: { contains: fpFilter } } : {}),
      ...(uidFilter ? { userId: { contains: uidFilter } } : {})
    }

    const [total, events] = await Promise.all([
      prisma.securityEvent.count({ where }),
      prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])

    // 统计：按 IP 分组
    const topIps = await prisma.securityEvent.groupBy({
      by: ['ip'],
      where: { createdAt: { gte: cutoff } },
      _count: { ip: true },
      orderBy: { _count: { ip: 'desc' } },
      take: 20
    })

    res.json({
      success: true,
      data: { events, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      topIps: topIps.map(i => ({ ip: i.ip, count: i._count.ip }))
    })
  } catch (err) {
    console.error('[Security] 查询失败:', err.message)
    res.status(500).json({ success: false, message: '查询失败' })
  }
})

// ──────────────────────────────────────────────
// 3. 登录/注册限流中间件
// ──────────────────────────────────────────────

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,    // 15 分钟窗口
  max: 5,                        // 同一 IP 15 分钟内最多 5 次登录尝试（2026-08-05 由 10 收紧为 5）
  message: { success: false, message: '登录尝试过于频繁，请 15 分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { singleCount: false },
  keyGenerator: (req) => {
    return getClientIp(req)
  }
})

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,     // 1 小时窗口
  max: 2,                        // 同一 IP 每小时最多 2 次注册
  message: { success: false, message: '注册过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { singleCount: false },
  keyGenerator: (req) => {
    return getClientIp(req)
  }
})

// 注册指纹永久限制：已由 auth.js /register 的数据库持久化检查替代
// （同一设备指纹/同一注册 IP 永久只能注册一次，重启/跨 PM2 实例均生效）
// 原 24h 内存限流器 registerFpLimiter 已移除。

export const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,     // 15 分钟
  max: 5,                        // 最多 5 次验证码请求
  message: { success: false, message: '验证码请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { singleCount: false },
  keyGenerator: (req) => {
    return getClientIp(req)
  }
})

// 验证码发送指纹限流: 同一设备指纹 24 小时内最多 10 次（防邮件轰炸）
export const codeFpLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: '验证码发送过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { singleCount: false },
  keyGenerator: (req) => {
    const fp = req.headers['x-device-fp']
    if (fp) return `fp:${fp}`
    return getClientIp(req)
  }
})

// 管理后台限流: 每 IP 每分钟最多 30 次请求
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { singleCount: false },
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    return getClientIp(req)
  }
})

// 密码修改/敏感操作限流: 每 IP 每小时最多 5 次
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: '敏感操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { singleCount: false },
  keyGenerator: (req) => {
    return getClientIp(req)
  }
})

export default router
