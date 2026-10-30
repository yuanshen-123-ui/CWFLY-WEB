/**
 * 设备指纹封禁服务（2026-08-08）
 *
 * 背景：仅封 IP 可被代理/换网绕过，仅封账号可被换小号绕过。
 * 方案：删除用户并加入黑名单时，同步拉黑其关联的全部设备指纹，
 *      注册/登录时校验指纹黑名单，实现"设备级封禁"。
 *
 * 数据来源（设备指纹证据链）：
 *   - User.registerFp     注册时指纹
 *   - LoginLog.deviceFp   每次登录指纹
 *   - SecurityEvent.deviceFp  安全事件指纹
 *
 * 缓存：内存 Set + 定时刷新（与 ipBan 一致，PM2 多实例由定时器兜底）
 */

import prisma from '../utils/prisma.js'

let fpCache = new Set()
let lastRefresh = 0
const REFRESH_INTERVAL = 60 * 1000

/** 从数据库全量刷新缓存 */
export async function refreshDeviceBans() {
  const rows = await prisma.deviceBan.findMany({ select: { fp: true } })
  fpCache = new Set(rows.map(r => r.fp))
  lastRefresh = Date.now()
}

/** 判断设备指纹是否被封禁（空指纹不拦截，避免误伤无指纹客户端） */
export function isDeviceBanned(fp) {
  if (!fp) return false
  return fpCache.has(String(fp).trim())
}

/** 首次请求前预热缓存 */
export async function ensureDeviceBansLoaded() {
  if (lastRefresh === 0) await refreshDeviceBans()
}

/** 封禁单个设备指纹（幂等 upsert） */
export async function banDeviceFp(fp, reason = '', bannedBy = 'system') {
  const f = String(fp || '').trim()
  if (!f) return null
  await prisma.deviceBan.upsert({
    where: { fp: f },
    update: { reason: reason || undefined, bannedBy: bannedBy || undefined },
    create: { fp: f, reason: reason || '', bannedBy: bannedBy || '' }
  })
  fpCache.add(f)
  return { fp: f }
}

/** 收集一个用户关联的全部设备指纹（注册 + 登录日志 + 安全事件） */
export async function collectUserDeviceFps(cid) {
  const fps = new Set()
  const uid = String(cid || '')
  if (!uid) return []
  const u = await prisma.user.findUnique({ where: { cid: uid }, select: { registerFp: true } })
  if (u?.registerFp) fps.add(String(u.registerFp).trim())
  const logs = await prisma.loginLog.findMany({
    where: { userId: uid }, select: { deviceFp: true }, orderBy: { id: 'desc' }, take: 200
  })
  for (const l of logs) if (l.deviceFp) fps.add(String(l.deviceFp).trim())
  const events = await prisma.securityEvent.findMany({
    where: { userId: uid }, select: { deviceFp: true }, orderBy: { id: 'desc' }, take: 200
  })
  for (const e of events) if (e.deviceFp) fps.add(String(e.deviceFp).trim())
  return [...fps].filter(Boolean)
}

/** 封禁用户全部设备指纹，返回实际封禁的指纹列表 */
export async function banUserDevices(cid, reason = '', bannedBy = 'system') {
  const fps = await collectUserDeviceFps(cid)
  const banned = []
  for (const fp of fps) {
    try { await banDeviceFp(fp, reason, bannedBy); banned.push(fp) } catch (e) { /* ignore */ }
  }
  return banned
}

// 定时兜底刷新（防止 PM2 多实例/外部直改数据库导致缓存过期）
setInterval(() => { refreshDeviceBans().catch(() => {}) }, REFRESH_INTERVAL)
