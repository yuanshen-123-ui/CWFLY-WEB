import { Router } from 'express'
import prisma from '../utils/prisma.js'

const router = Router()

// --- Routes ---

// GET / — 获取职员列表（公开，用于管制员公示 / 职员公示）
router.get('/', async (req, res) => {
  try {
    const { type } = req.query
    // 与「管制员管理」(/admin/controllers, 查 department contains 'Control') 使用同一数据源，
    // 保证职员公示与管制员管理显示的人员完全一致
    const where = type === 'controller'
      ? { department: { contains: 'Control' } }
      : {}
    // 只返回公开字段，不暴露敏感信息
    const data = await prisma.staff.findMany({
      where, orderBy: { cid: 'asc' },
      select: { cid: true, name: true, department: true, position: true, rating: true, active: true, online: true }
    })
    // M-1 修复：CID 是平台登录主键，不对外公开（掩码保留首位供前端展示/分组）
    const masked = data.map(u => ({ ...u, cid: String(u.cid).slice(0, 1) + '**' }))
    res.json({ success: true, data: masked })
  } catch (e) {
    console.error('[Staff] 查询失败:', e)
    res.status(500).json({ success: false, message: '查询失败' })
  }
})

export default router
