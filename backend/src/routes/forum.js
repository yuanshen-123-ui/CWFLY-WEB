import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'

const router = Router()

// 初始化版块
// 演示数据已清除，上线后由管理员创建

// --- Routes ---

// GET /boards — 获取版块列表
router.get('/boards', async (req, res) => {
  try {
    const boards = await prisma.forumBoard.findMany({ orderBy: { sort: 'asc' } })
    res.json({ success: true, data: boards })
  } catch (e) {
    console.error('[forum.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/posts', async (req, res) => {
  try {
    const { boardId, page = 1 } = req.query
    const where = boardId ? { boardId: Number(boardId) } : {}
    const items = await prisma.forumPost.findMany({ where, orderBy: [{ pinned: 'desc' }, { id: 'desc' }], skip: (Number(page) - 1) * 20, take: 20 })
    const total = await prisma.forumPost.count({ where })
    res.json({ success: true, data: { items, total } })
  } catch (e) { console.error('[forum.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/posts/:id', async (req, res) => {
  try {
    const post = await prisma.forumPost.findUnique({ where: { id: Number(req.params.id) } })
    if (!post) return res.status(404).json({ success: false, message: '帖子不存在' })
    await prisma.forumPost.update({ where: { id: post.id }, data: { views: post.views + 1 } })
    const replies = await prisma.forumReply.findMany({ where: { postId: post.id }, orderBy: { id: 'asc' } })
    res.json({ success: true, data: { ...post, replies } })
  } catch (e) { console.error('[forum.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/posts', authenticate, async (req, res) => {
  try {
    const { boardId, title, content } = req.body
    if (!title || !content) return res.status(400).json({ success: false, message: '缺少标题或内容' })
    const post = await prisma.forumPost.create({ data: { boardId: Number(boardId) || 1, userId: req.user.cid, title, content } })
    res.json({ success: true, data: post })
  } catch (e) { console.error('[forum.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/posts/:id/reply', authenticate, async (req, res) => {
  try {
    const { content } = req.body
    if (!content) return res.status(400).json({ success: false, message: '缺少内容' })
    const reply = await prisma.forumReply.create({ data: { postId: Number(req.params.id), userId: req.user.cid, content } })
    await prisma.forumPost.update({ where: { id: Number(req.params.id) }, data: { updatedAt: new Date() } })
    res.json({ success: true, data: reply })
  } catch (e) { console.error('[forum.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
