import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'

const router = Router()

router.post('/', authenticate, async (req, res) => {
  try {
    const { eventId } = req.body
    const record = await prisma.checkInRecord.create({
      data: { userId: req.user.cid, eventId: String(eventId), eventTitle: `活动 #${eventId}`, time: new Date().toLocaleString('zh-CN') }
    })
    res.json({ success: true, data: record })
  } catch (e) { console.error('[checkin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/history', authenticate, async (req, res) => {
  try {
    const records = await prisma.checkInRecord.findMany({
      where: { userId: req.user.cid },
      orderBy: { id: 'desc' }
    })
    res.json({ success: true, data: records })
  } catch (e) { console.error('[checkin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
