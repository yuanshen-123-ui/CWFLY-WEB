import { Router } from 'express'
import prisma from '../utils/prisma.js'

const router = Router()

router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await prisma.user.count()
    // 管制员数量：fsdLevel >= 1（OBS 及以上）或 rating >= 11（SUP/ADM 平台管理员）
    const controllerCount = await prisma.user.count({
      where: { OR: [{ fsdLevel: { gte: 1 } }, { rating: { gte: 11 } }] }
    })
    const eventCount = await prisma.event.count()
    // 网站在线已登录用户数：OnlineUser 表跨实例统计（2 分钟内活跃）
    const onlineRows = await prisma.$queryRaw`SELECT COUNT(*) AS n FROM OnlineUser WHERE lastSeen >= DATE_SUB(NOW(3), INTERVAL 2 MINUTE)`
    const onlineUsers = Number(onlineRows[0]?.n || 0)
    res.json({ success: true, data: { totalUsers, controllerCount, eventCount, onlineUsers } })
  } catch (e) {
    console.error('[Dashboard] 查询失败:', e)
    res.status(500).json({ success: false, message: '查询失败' })
  }
})

export default router
