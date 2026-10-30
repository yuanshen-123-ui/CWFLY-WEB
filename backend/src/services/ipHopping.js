/**
 * IP 跳变检测（证据链，2026-08-05）
 *
 * 检测场景：一个活跃用户（同一 userId）的 IP 突然断开，1 分钟内又从新 IP 重新活跃
 * （VPN/代理切换、网络切换、账号共用设备等）。判定为可疑 IP 跳变并写入
 * SecurityEvent(path='ip-hop', network={oldIp,newIp,gapMs,sameDevice})。
 *
 * 数据源（以请求为粒度上报活跃）：
 *   - authenticate 中间件：所有已认证 API 请求（token 续签同一处钩子）
 *   - 登录成功 / Socket.IO user:online
 *
 * 判定规则：
 *   - 同一 userId 上一次活跃 IP 与当前 IP 不同，且间隔 ≤ IP_HOP_WINDOW_MS（默认 60s）→ 记录
 *   - 相同 (userId, oldIp→newIp) 组合在 IP_HOP_COOLDOWN_MS（默认 10min）内只记录一次，避免刷屏
 *
 * 局限说明：FSD 协议不携带客户端 IP（IP 只在 fsd-master/fsd-py 服务端可见），
 * 故 FSD 客户端跳 IP 无法在此检测；如需覆盖需在 FSD 服务端侧做。
 */

import prisma from '../utils/prisma.js'
import { getClientIp, getDeviceFp } from '../utils/client.js'

// 判定窗口：活跃 IP 与下一 IP 的间隔（默认 60s = 1 分钟）
export const IP_HOP_WINDOW_MS = Number(process.env.IP_HOP_WINDOW_MS || 60) * 1000
// 去重窗口：同 (oldIp→newIp) 对在此时间内只报一次
export const IP_HOP_COOLDOWN_MS = Number(process.env.IP_HOP_COOLDOWN_MS || 10) * 60 * 1000
// 内存状态上限，超出则清理 24h 未活跃的条目
const MAX_STATE = 20000

// userId -> { ip, deviceFp, lastActiveAt, recentHops: Map<无序IP对, 最近记录时间> }
const userState = new Map()

function prune() {
  if (userState.size <= MAX_STATE) return
  const now = Date.now()
  const cutoff = now - 24 * 3600 * 1000
  for (const [uid, st] of userState) {
    if (now - st.lastActiveAt > cutoff) userState.delete(uid)
  }
}

/** 同对 IP 的去重窗口内最多保留的记录数（超限删除最旧的） */
const MAX_HOPS_PER_USER = 20

/**
 * 上报一次活跃（登录 / 已认证请求 / Socket.IO 上线）
 * @param {string} userId CID
 * @param {string} ip 真实客户端 IP
 * @param {string} deviceFp 设备指纹（用于区分同一设备换 IP vs 多设备）
 */
export function trackUserIp(userId, ip, deviceFp = '') {
  if (!userId || !ip) return
  const now = Date.now()
  const prev = userState.get(userId)

  if (prev && prev.ip && prev.ip !== ip && (now - prev.lastActiveAt) <= IP_HOP_WINDOW_MS) {
    // 无序 IP 对作为去重键：A↔B 反复切换也只记一次（防 VPN/网络抖动刷屏）
    const pairKey = [prev.ip, ip].sort().join('|')
    const recentHops = prev.recentHops || new Map()
    const lastHop = recentHops.get(pairKey)
    if (!lastHop || (now - lastHop) >= IP_HOP_COOLDOWN_MS) {
      recentHops.set(pairKey, now)
      if (recentHops.size > MAX_HOPS_PER_USER) {
        const oldest = recentHops.keys().next().value
        recentHops.delete(oldest)
      }
      recordIpHop(userId, prev.ip, ip, now - prev.lastActiveAt, prev.deviceFp === deviceFp, deviceFp)
    }
  }

  userState.set(userId, {
    ip, deviceFp, lastActiveAt: now,
    recentHops: prev?.recentHops || new Map()
  })
  prune()
}

/** 从 Express 请求直接上报（authenticate 中间件 / 登录路由用） */
export function trackRequestIp(req, userId) {
  trackUserIp(userId, getClientIp(req), getDeviceFp(req))
}

/** 从 Socket.IO 握手直接上报 */
export function trackSocketIp(socket, userId) {
  const ip = (socket.handshake?.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim()
    || socket.handshake?.address
    || ''
  trackUserIp(userId, ip)
}

function recordIpHop(userId, oldIp, newIp, gapMs, sameDevice, deviceFp) {
  prisma.securityEvent.create({
    data: {
      ip: newIp,
      userId,
      deviceFp,
      path: 'ip-hop',
      network: JSON.stringify({ oldIp, newIp, gapMs, sameDevice })
    }
  }).catch(err => {
    if (process.env.NODE_ENV !== 'production') console.error('[IpHop] 写入失败:', err.message)
  })
  console.warn(`[IpHop] 检测到 IP 跳变: user=${userId} ${oldIp} -> ${newIp} gap=${gapMs}ms sameDevice=${sameDevice}`)
}
