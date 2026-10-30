import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'

const router = Router()

router.get('/', authenticate, async (req, res) => {
  try {
    const list = await prisma.feedback.findMany({
      where: { userId: req.user.cid },
      orderBy: { id: 'desc' }
    })
    res.json({ success: true, data: list })
  } catch (e) { console.error('[feedback.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/', authenticate, async (req, res) => {
  try {
    const { title, type, content } = req.body
    if (!title || !content) return res.status(400).json({ success: false, message: '缺少必填字段' })
    const fb = await prisma.feedback.create({
      data: { userId: req.user.cid, title, type: type || '投诉', content, status: '待处理', time: new Date().toLocaleString('zh-CN') }
    })
    res.json({ success: true, data: fb })
  } catch (e) { console.error('[feedback.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
