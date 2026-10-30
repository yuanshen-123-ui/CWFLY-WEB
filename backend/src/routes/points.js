import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res) => {
  try {
    let points = await prisma.userPoint.findUnique({ where: { userId: req.user.cid } })
    if (!points) points = { userId: req.user.cid, points: 0, exp: 0, level: 1, flights: 0, hours: 0 }
    const achievements = await prisma.userAchievement.findMany({
      where: { userId: req.user.cid },
      include: { achievement: true }
    })
    res.json({ success: true, data: { points, achievements } })
  } catch (e) { console.error('[points.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/leaderboard', async (req, res) => {
  try {
    const data = await prisma.userPoint.findMany({ orderBy: { points: 'desc' }, take: 50 })
    res.json({ success: true, data })
  } catch (e) { console.error('[points.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
