/**
 * IP 封禁服务
 *
 * - 从数据库加载有效封禁（自动忽略已过期记录）
 * - 内存缓存 + 启动加载 + 变更即时刷新 + 定时兜底刷新（5 分钟）
 * - 支持精确 IP（1.2.3.4）与 CIDR 网段（1.2.3.0/24）
 *
 * 合规说明：仅用于安全防护（防刷/防滥用），符合《个人信息保护法》合法利益原则。
 */

import prisma from '../utils/prisma.js'
import { getClientIp } from '../utils/client.js'

// 内存缓存：[{ type:'v4'|'v6'|'cidr', ip, int?, mask?, network?, expiresAt }]
let banCache = []          // 封禁管理（IpBan）
let listWhiteCache = []    // 网络管理（IpList）白名单
let listBlackCache = []    // 网络管理（IpList）黑名单
let lastRefresh = 0
const REFRESH_INTERVAL = 60 * 1000 // 1 分钟兜底刷新

/** 归一化 IP：去空格、小写、去掉 ::ffff: 前缀 */
export function normalizeIp(raw) {
  let ip = String(raw || '').trim()
  if (!ip) return ''
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7)
  return ip.toLowerCase()
}

/** IPv4 字符串 → 32 位无符号整数（非 IPv4 返回 null） */
function ipv4ToInt(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

/** 解析封禁条目：支持 "1.2.3.4" 或 "1.2.3.0/24" */
function parseBan(ip) {
  ip = normalizeIp(ip)
  if (!ip) return null
  const slash = ip.indexOf('/')
  if (slash !== -1) {
    const base = ip.slice(0, slash)
    const prefix = Number(ip.slice(slash + 1))
    const int = ipv4ToInt(base)
    if (int === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    return { type: 'cidr', ip, network: int & mask, mask, prefix }
  }
  const int = ipv4ToInt(ip)
  if (int !== null) return { type: 'v4', ip, int }
  return { type: 'v6', ip } // IPv6 仅做字符串精确匹配
}

/** 判断 IP 是否命中封禁列表 */
function isIpBanned(rawIp) {
  const ip = normalizeIp(rawIp)
  if (!ip) return false
  const int = ipv4ToInt(ip)
  const now = Date.now()
  for (const b of banCache) {
    if (b.expiresAt && new Date(b.expiresAt).getTime() < now) continue
    if (b.type === 'v4' && int !== null && b.int === int) return true
    if (b.type === 'cidr' && int !== null && (int & b.mask) === b.network) return true
    if (b.type === 'v6' && ip === b.ip) return true
  }
  return false
}

/** 从数据库重新加载封禁列表 */
export async function refreshBans() {
  try {
    const rows = await prisma.ipBan.findMany({
      where: { active: true },
      select: { ip: true, expiresAt: true }
    })
    banCache = rows
      .map(r => ({ ...parseBan(r.ip), expiresAt: r.expiresAt }))
      .filter(Boolean)
    lastRefresh = Date.now()
    return banCache.length
  } catch (err) {
    console.error('[IpBan] 刷新封禁列表失败:', err.message)
    return banCache.length
  }
}

/** 从数据库重新加载网络管理（IP 集合成员）白/黑名单 */
export async function refreshIpList() {
  try {
    const rows = await prisma.ipGroupMember.findMany({
      where: { group: { active: true } },
      select: { ip: true, group: { select: { type: true } } }
    })
    const white = []
    const black = []
    for (const r of rows) {
      const parsed = parseBan(r.ip)
      if (!parsed) continue
      if (r.group.type === 'white') white.push(parsed)
      else black.push(parsed)
    }
    listWhiteCache = white
    listBlackCache = black
    return { white: white.length, black: black.length }
  } catch (err) {
    console.error('[IpBan] 刷新网络管理名单失败:', err.message)
    return { white: 0, black: 0 }
  }
}

/** 判断 IP 是否命中名单缓存（白/黑名单通用匹配） */
function isIpInList(rawIp, cache) {
  const ip = normalizeIp(rawIp)
  if (!ip) return false
  const int = ipv4ToInt(ip)
  for (const b of cache) {
    if (b.type === 'v4' && int !== null && b.int === int) return true
    if (b.type === 'cidr' && int !== null && (int & b.mask) === b.network) return true
    if (b.type === 'v6' && ip === b.ip) return true
  }
  return false
}

/** 是否命中网络管理白名单 */
export function isWhitelisted(rawIp) {
  return isIpInList(rawIp, listWhiteCache)
}

/** 是否命中网络管理黑名单 */
export function isIpListBanned(rawIp) {
  return isIpInList(rawIp, listBlackCache)
}

/** 启动时确保加载过一次（首次请求前的缓存预热） */
export async function ensureBansLoaded() {
  if (lastRefresh === 0) {
    await refreshBans()
    await refreshIpList()
  }
}

// 定时兜底刷新（防止 PM2 多实例/外部直改数据库导致缓存过期）
setInterval(() => { refreshBans(); refreshIpList() }, REFRESH_INTERVAL)

/** Express 全局封禁中间件 */
export function ipBanMiddleware(req, res, next) {
  const ip = getClientIp(req)
  // 优先级：IP封禁(IpBan) > 白名单 > 黑名单(IpList)
  // ① 封禁管理（IpBan）：最高优先级，管理员主动封禁，白名单不覆盖
  if (isIpBanned(ip)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[IpBan] 拦截被封禁 IP ${ip} -> ${req.method} ${req.path}`)
    }
    return res.status(403).json({ success: false, code: 'IP_BANNED', message: '您已被封禁，请联系管理员' })
  }
  // ② 白名单：命中则直接放行（可覆盖网络管理黑名单规则）
  if (isWhitelisted(ip)) return next()
  // ③ 网络管理黑名单：命中返回地区受限（前端跳转 Internet_Banned）
  if (isIpListBanned(ip)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[IpBan] 拦截网络管理黑名单 IP ${ip} -> ${req.method} ${req.path}`)
    }
    return res.status(403).json({ success: false, code: 'INTERNET_BANNED', message: '您当前所处地区不受平台支持，我们将暂停为您提供任何服务' })
  }
  next()
}
