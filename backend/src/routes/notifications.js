import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'

const router = Router()
router.use(authenticate)

// 获取通知列表
router.get('/', async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.cid },
      orderBy: { id: 'desc' },
      take: 50
    })
    const unread = await prisma.notification.count({ where: { userId: req.user.cid, read: false } })
    res.json({ success: true, data: { items: notifications, unread } })
  } catch (e) { console.error('[notifications.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 标记已读
router.put('/read/:id', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: Number(req.params.id), userId: req.user.cid },
      data: { read: true }
    })
    res.json({ success: true })
  } catch (e) { console.error('[notifications.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 全部已读
router.put('/read-all', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.cid, read: false },
      data: { read: true }
    })
    res.json({ success: true })
  } catch (e) { console.error('[notifications.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 创建通知（内部使用）
export async function createNotification(userId, type, title, content = '', link = '') {
  try {
    await prisma.notification.create({ data: { userId, type, title, content, link } })
  } catch {}
}

export default router
