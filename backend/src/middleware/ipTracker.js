/**
 * 网络日志 IP 追踪中间件
 * - 规则: 只要调用接口/首次访问都算一次访问; 同一 IP 在「10 分钟窗口」内的请求次数累加(count),
 *   超过 10 分钟窗口后再次访问 → 新增一行(新的 windowStart)
 * - 内存按 (ip, 窗口) 聚合, 每 60s 批量落库到 IpVisit 表, 避免每个请求都写 DB
 * - DB 未就绪/表不存在时静默跳过, 不影响请求
 */
import prisma from '../utils/prisma.js'
import { getClientIp, getDeviceFp } from '../utils/client.js'

const WINDOW_MS = 10 * 60 * 1000 // 10 分钟窗口
const pending = new Map()
let flushTimer = null
const FLUSH_INTERVAL = 60000 // 60s 落库一次

/** 计算某个时间点所属的 10 分钟窗口开始时间(对齐到整 10 分钟) */
export function windowStartOf(now) {
  return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS)
}

/** 请求中间件: 按 (ip, 10分钟窗口) 聚合访问（记录最近一次访问指纹） */
export function recordIp(req, res, next) {
  try {
    const ip = getClientIp(req)
    if (ip && !ip.startsWith('127.') && ip !== '::1') {
      const now = new Date()
      const ws = windowStartOf(now)
      const key = ip + '|' + ws.getTime()
      const fp = getDeviceFp(req)
      const cur = pending.get(key)
      if (cur) { cur.count++; cur.last = now; if (fp) cur.fp = fp }
      else pending.set(key, { ip, windowStart: ws, count: 1, first: now, last: now, fp })
    }
  } catch { /* 忽略 */ }
  next()
}

/** 导出内存中未落库的实时访问快照(供 /logs/network 接口合并, 让刷新即可见最新) */
export function getPendingVisits() {
  return [...pending.values()].map(v => ({
    ip: v.ip, windowStart: v.windowStart, count: v.count, first: v.first, last: v.last, fp: v.fp,
  }))
}

/** 将内存聚合结果写入 IpVisit 表 */
async function flush() {
  if (!pending.size) return
  const batch = [...pending.entries()]
  pending.clear()
  for (const [key, { ip, windowStart, count, first, last, fp }] of batch) {
    try {
      await prisma.ipVisit.upsert({
        where: { ip_windowStart: { ip, windowStart } },
        create: { ip, windowStart, count, firstSeen: first, lastSeen: last, deviceFp: fp || '' },
        update: { count: { increment: count }, lastSeen: last, ...(fp ? { deviceFp: fp } : {}) },
      })
    } catch { /* 表不存在/DB 未就绪时静默, 不阻塞请求 */ }
  }
}

/** 启动定时落库（幂等） */
export function startIpTracker() {
  if (flushTimer) return flushTimer
  flushTimer = setInterval(flush, FLUSH_INTERVAL)
  flushTimer.unref?.()
  return flushTimer
}
