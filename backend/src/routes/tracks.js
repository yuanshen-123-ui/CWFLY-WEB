import { Router } from 'express'
import prisma from '../utils/prisma.js'

/**
 * 航迹回放 API（whazzup 回放增强）
 *
 * 数据源：FlightTrack 表（fsd-py 每 10s 采样一次机组位置写入）
 * 公开只读，供地图回放页与第三方使用。
 */
const router = Router()

function toInt(v, def = 0) {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

// 可回放的会话列表：?callsign=CES123&limit=20
router.get('/sessions', async (req, res) => {
  try {
    const callsign = String(req.query.callsign || '').trim().toUpperCase().slice(0, 16)
    const limit = Math.min(Math.max(toInt(req.query.limit, 20), 1), 100)
    const rows = await prisma.$queryRawUnsafe(
      `SELECT callsign,
              sessionId,
              COUNT(*) AS points,
              MIN(recordedAt) AS startTime,
              MAX(recordedAt) AS endTime,
              TIMESTAMPDIFF(SECOND, MIN(recordedAt), MAX(recordedAt)) AS durationSec,
              MAX(altitude) AS maxAltitude,
              MAX(groundSpeed) AS maxGroundSpeed
         FROM FlightTrack
        WHERE (? = '' OR callsign = ?)
        GROUP BY callsign, sessionId
       HAVING COUNT(*) >= 2
        ORDER BY endTime DESC
        LIMIT ?`,
      callsign, callsign, limit
    )
    const data = rows.map(r => ({
      callsign: r.callsign,
      sessionId: Number(r.sessionId) || 0,
      points: Number(r.points) || 0,
      startTime: r.startTime,
      endTime: r.endTime,
      durationSec: Number(r.durationSec) || 0,
      maxAltitude: Number(r.maxAltitude) || 0,
      maxGroundSpeed: Number(r.maxGroundSpeed) || 0
    }))
    res.json({ success: true, data })
  } catch (err) {
    console.error('[tracks] sessions failed:', err.message)
    res.status(500).json({ success: false, message: '获取回放列表失败' })
  }
})

// 单个会话的航迹点（按时间正序）：/session/123
router.get('/session/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id, -1)
    if (id < 0) return res.status(400).json({ success: false, message: '无效的会话 ID' })
    const rows = await prisma.$queryRawUnsafe(
      `SELECT lat, lon, altitude, groundSpeed, heading, onGround, recordedAt
         FROM FlightTrack
        WHERE sessionId = ?
        ORDER BY recordedAt ASC
        LIMIT 20000`,
      id
    )
    if (!rows.length) return res.status(404).json({ success: false, message: '该会话没有航迹数据' })
    res.json({
      success: true,
      data: rows.map(r => ({
        lat: Number(r.lat),
        lon: Number(r.lon),
        altitude: Number(r.altitude) || 0,
        groundSpeed: Number(r.groundSpeed) || 0,
        heading: Number(r.heading) || 0,
        onGround: !!Number(r.onGround),
        recordedAt: r.recordedAt
      }))
    })
  } catch (err) {
    console.error('[tracks] session failed:', err.message)
    res.status(500).json({ success: false, message: '获取航迹失败' })
  }
})

// 按呼号取最近一个会话的航迹（便利接口）：/latest/CES123
router.get('/latest/:callsign', async (req, res) => {
  try {
    const callsign = String(req.params.callsign || '').trim().toUpperCase().slice(0, 16)
    if (!callsign) return res.status(400).json({ success: false, message: '无效呼号' })
    const sessions = await prisma.$queryRawUnsafe(
      `SELECT sessionId, MAX(recordedAt) AS endTime
         FROM FlightTrack
        WHERE callsign = ?
        GROUP BY sessionId
        ORDER BY endTime DESC
        LIMIT 1`,
      callsign
    )
    if (!sessions.length) return res.status(404).json({ success: false, message: '没有该呼号的航迹' })
    req.params.id = String(sessions[0].sessionId)
    return router.handle ? res.redirect(`/api/tracks/session/${sessions[0].sessionId}`) : res.redirect(`/api/tracks/session/${sessions[0].sessionId}`)
  } catch (err) {
    console.error('[tracks] latest failed:', err.message)
    res.status(500).json({ success: false, message: '获取航迹失败' })
  }
})

export default router
