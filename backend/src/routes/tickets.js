import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'

const router = Router()

router.use(authenticate)

// 获取自己的工单列表
router.get('/', async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { userId: req.user.cid },
      orderBy: { id: 'desc' }
    })
    res.json({ success: true, data: tickets })
  } catch (e) { console.error('[tickets.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 获取单个工单
router.get('/:id', async (req, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(req.params.id) }
    })
    if (!ticket) return res.status(404).json({ success: false, message: '工单不存在' })
    if (ticket.userId !== req.user.cid) {
      return res.status(403).json({ success: false, message: '无权查看此工单' })
    }
    res.json({ success: true, data: ticket })
  } catch (e) { console.error('[tickets.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 创建工单
router.post('/', async (req, res) => {
  try {
    const { title, category, priority, content } = req.body
    if (!title || !content) return res.status(400).json({ success: false, message: '请填写标题和内容' })
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const ticket = await prisma.ticket.create({
      data: {
        userId: req.user.cid,
        title,
        category: category || 'general',
        priority: priority || 'normal',
        content,
        status: 'open',
        createdAt: now,
        updatedAt: now
      }
    })
    res.json({ success: true, data: ticket })
  } catch (e) { console.error('[tickets.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 删除自己的工单（L-4 修复：此前缺失 DELETE 处理器，请求落入全局 404）
router.delete('/:id', async (req, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(req.params.id) }
    })
    if (!ticket) return res.status(404).json({ success: false, message: '工单不存在' })
    if (ticket.userId !== req.user.cid) {
      return res.status(403).json({ success: false, message: '无权删除此工单' })
    }
    await prisma.ticket.delete({ where: { id: ticket.id } })
    res.json({ success: true, message: '工单已删除' })
  } catch (e) {
    if (e?.code === 'P2003') return res.status(409).json({ success: false, message: '该工单存在关联回复，无法删除' })
    console.error('[tickets.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

export default router
