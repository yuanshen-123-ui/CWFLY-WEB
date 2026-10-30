/**
 * 设备风控评分 + 异常检测（L3，2026-08-06）
 *
 * 签名指纹证明"指纹是服务端签发的、没被乱改"；本模块负责判断"这个指纹是否可信"。
 * 组合多路信号打分（0-100），输出 allow / challenge / block：
 * - 代理/机房特征（header 提示 + 可选 CIDR 文件 PROXY_IP_FILE）
 * - 同一 fp 关联的 IP 数与 UA 抖动（LoginLog 近 7 天，跨实例落库）
 * - Device 表历史：历史 IP 集合外的新 IP、历史 tampered 标记
 *
 * 生产建议：接入 MaxMind/IP2Location 等 IP 库判断机房/代理（在 PROXY_IP_FILE 里
 * 提供 CIDR 白名单即可启用，未配置则该项不扣分，不误伤）。
 */

import { readFileSync } from 'node:fs'
import prisma from '../utils/prisma.js'
import { getClientIp } from '../utils/client.js'

/** 风控统计窗口（天） */
const RISK_WINDOW_DAYS = Number(process.env.RISK_WINDOW_DAYS || 7)
/** >= 该分数拒绝（注册场景默认启用） */
export const RISK_BLOCK_THRESHOLD = Number(process.env.RISK_BLOCK_THRESHOLD || 80)
/** >= 该分数要求额外验证（如 PoW/验证码） */
export const RISK_CHALLENGE_THRESHOLD = Number(process.env.RISK_CHALLENGE_THRESHOLD || 50)

/**
 * 收集代理特征提示（源自请求头与可选 IP 库）。
 * 注意：X-TLS-* / Via 等头仅信任由 nginx 覆写的值（见 deploy/nginx-tls-signal.conf）。
 */
export function collectProxyHints(req) {
  const fwd = req.headers['x-forwarded-for'] || ''
  const multiHop = fwd.split(',').length > 1
  const via = !!(req.headers['via'] || req.headers['forwarded'])
  const datacenter = looksLikeDatacenter(getClientIp(req))
  return { multiHop, via, datacenter }
}

/** 评估设备风险（不抛错，异常时保守返回 challenge 等级） */
export async function evaluateDeviceRisk({ fp, ip, ua, proxyHints = {} }) {
  try {
    if (!fp) return { score: 40, flags: ['no-fp'], decision: 'challenge' }
    let score = 0
    const flags = []
    const cutoff = new Date(Date.now() - RISK_WINDOW_DAYS * 24 * 3600 * 1000)

    // 1) 代理/机房特征
    if (proxyHints.multiHop) { score += 30; flags.push('proxy-hop') }
    if (proxyHints.datacenter) { score += 35; flags.push('datacenter') }
    if (proxyHints.via) { score += 15; flags.push('via') }

    // 2) 同一 fp 关联的 IP 数与 UA 抖动（LoginLog 近窗口）
    try {
      const [distinctIps, distinctUas] = await Promise.all([
        prisma.loginLog.groupBy({ by: ['ip'], where: { deviceFp: fp, createdAt: { gte: cutoff } }, _count: { ip: true } }),
        prisma.loginLog.groupBy({ by: ['userAgent'], where: { deviceFp: fp, createdAt: { gte: cutoff } }, _count: { userAgent: true } })
      ])
      const ipCount = distinctIps.length
      if (ipCount >= 6) { score += 35; flags.push('many-ips') }
      else if (ipCount >= 3) { score += 20; flags.push('ip-change') }
      const uaCount = distinctUas.length
      if (uaCount >= 4) { score += 20; flags.push('ua-change') }
      else if (uaCount >= 2) { score += 10 }
    } catch { /* 统计失败不阻断 */ }

    // 3) Device 表历史（跨天记忆）
    try {
      const dev = await prisma.device.findUnique({ where: { fp } })
      if (dev) {
        if (dev.riskScore > score) score = dev.riskScore
        if (dev.flags.includes('tampered')) { score = Math.max(score, 90); flags.push('tampered') }
        let ipSet = []
        try { ipSet = JSON.parse(dev.ipSet || '[]') } catch { ipSet = [] }
        if (ip && ipSet.length && !ipSet.includes(ip)) { score += 15; flags.push('new-ip') }
      }
    } catch { /* ignore */ }

    score = Math.min(score, 100)
    const decision = score >= RISK_BLOCK_THRESHOLD ? 'block'
      : score >= RISK_CHALLENGE_THRESHOLD ? 'challenge' : 'allow'
    return { score, flags, decision }
  } catch (err) {
    return { score: RISK_CHALLENGE_THRESHOLD, flags: ['error'], decision: 'challenge' }
  }
}

/** 记录一次设备活动（签发 / 登录成功），维护 Device 表的 IP 集合与计数 */
export async function recordDeviceActivity({ fp, ip, ua, riskEvent }) {
  if (!fp) return
  const now = new Date()
  try {
    const existing = await prisma.device.findUnique({ where: { fp } })
    if (existing) {
      let ipSet = []
      try { ipSet = JSON.parse(existing.ipSet || '[]') } catch { ipSet = [] }
      if (ip && !ipSet.includes(ip)) {
        ipSet.push(ip)
        if (ipSet.length > 20) ipSet = ipSet.slice(-20)
      }
      await prisma.device.update({
        where: { fp },
        data: {
          lastIp: ip || existing.lastIp,
          userAgent: ua || existing.userAgent,
          ipSet: JSON.stringify(ipSet),
          loginCount: { increment: riskEvent === 'login' ? 1 : 0 },
          lastSeen: now
        }
      })
    } else {
      await prisma.device.create({
        data: {
          fp,
          firstIp: ip || '', lastIp: ip || '',
          userAgent: ua || '',
          ipSet: JSON.stringify(ip ? [ip] : []),
          loginCount: riskEvent === 'login' ? 1 : 0,
          lastSeen: now
        }
      })
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[Device] 记录失败:', err.message)
  }
}

/** 标记指纹被篡改（验签失败时调用，累积到 90 分以上直接拒绝） */
export async function flagDeviceTampered(fp) {
  if (!fp) return
  try {
    const existing = await prisma.device.findUnique({ where: { fp } })
    if (existing) {
      await prisma.device.update({
        where: { fp },
        data: {
          riskScore: Math.max(existing.riskScore, 90),
          flags: existing.flags.includes('tampered') ? existing.flags : `${existing.flags},tampered`.replace(/^,/, '')
        }
      })
    } else {
      await prisma.device.create({ data: { fp, riskScore: 90, flags: 'tampered' } })
    }
  } catch { /* ignore */ }
}

// ──────────────────────────────────────────────
// 代理/机房检测（可选 CIDR 文件）
// ──────────────────────────────────────────────
let cachedCidrs = null

function loadCidrs() {
  const p = process.env.PROXY_IP_FILE
  if (!p) return []
  if (cachedCidrs) return cachedCidrs
  try {
    cachedCidrs = readFileSync(p, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
  } catch {
    cachedCidrs = []
    console.warn('[DeviceRisk] 无法读取 PROXY_IP_FILE，代理/机房检测已降级为仅 header 提示')
  }
  return cachedCidrs
}

function ipInCidr(ip, cidr) {
  const [range, bits] = String(cidr || '').split('/')
  if (!range || !range.includes('.')) return false
  const toInt = (s) => s.split('.').reduce((acc, o) => ((acc << 8) + parseInt(o, 10)) >>> 0, 0) >>> 0
  const ipInt = toInt(ip)
  const rangeInt = toInt(range)
  const b = bits ? parseInt(bits, 10) : 32
  const mask = b === 0 ? 0 : (~0 << (32 - b)) >>> 0
  return (ipInt & mask) === (rangeInt & mask)
}

function looksLikeDatacenter(ip) {
  if (!ip || !ip.includes('.') || ip.includes(':')) return false // IPv6 暂不检测
  for (const cidr of loadCidrs()) {
    try { if (ipInCidr(ip, cidr)) return true } catch { /* skip bad cidr */ }
  }
  return false
}
