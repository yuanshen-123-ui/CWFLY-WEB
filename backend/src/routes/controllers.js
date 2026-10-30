import { Router } from 'express'
import prisma from '../utils/prisma.js'

const router = Router()

// GET /api/controllers — 管制员名单（公开）
// 数据源：Staff 表（与 /api/staff?type=controller 同源）
//   department 既可能是英文 "Control"，也可能是中文 "管制部/区域管制"，两种都匹配
// 在线状态：以 FSD 的 FlightController 在线快照为准（快照表仅在线时存在该行）
router.get('/', async (req, res) => {
  try {
    const staff = await prisma.staff.findMany({
      where: {
        OR: [
          { department: { contains: 'Control' } },
          { department: { contains: '管制' } }
        ]
      },
      orderBy: { cid: 'asc' },
      select: {
        cid: true, name: true, department: true, position: true,
        rating: true, active: true, online: true
      }
    })

    let onlineCids = new Set()
    try {
      const rows = await prisma.$queryRaw`SELECT cid FROM FlightController`
      onlineCids = new Set((rows || []).map(r => String(r.cid)))
    } catch {
      // 快照表不可用时退回 Staff.online 字段
    }

    const data = (staff || []).map(s => ({
      // CID 是平台登录主键，公开列表只保留首位（与 /api/staff 保持一致）
      cid: String(s.cid).slice(0, 1) + '**',
      name: s.name,
      department: s.department,
      position: s.position,
      rating: s.rating,
      online: onlineCids.has(String(s.cid)) || !!s.online
    }))

    res.json({ success: true, data })
  } catch (e) {
    console.error('[controllers] 查询失败:', e?.message)
    res.json({ success: true, data: [] })
  }
})

export default router
