import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'

const router = Router()

router.post('/controller', authenticate, async (req, res) => {
  try {
    const { department, reason } = req.body
    // 防止重复提交：检查是否已有待审核的管制申请
    const existing = await prisma.application.findFirst({
      where: { userId: req.user.cid, type: 'controller', status: '待审核' }
    })
    if (existing) {
      return res.status(409).json({ success: false, message: '您已提交过管制员申请，请等待审核结果' })
    }
    const app = await prisma.application.create({
      data: {
        userId: req.user.cid, name: req.user.username, type: 'controller',
        department: department || '', reason: reason || '',
        status: '待审核', time: new Date().toLocaleString('zh-CN')
      }
    })
    res.json({ success: true, data: app })
  } catch (e) { console.error('[apply.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/staff', authenticate, async (req, res) => {
  try {
    const { department, reason } = req.body
    // 防止重复提交：检查是否已有待审核的职员申请
    const existing = await prisma.application.findFirst({
      where: { userId: req.user.cid, type: 'staff', status: '待审核' }
    })
    if (existing) {
      return res.status(409).json({ success: false, message: '您已提交过职员申请，请等待审核结果' })
    }
    const app = await prisma.application.create({
      data: {
        userId: req.user.cid, name: req.user.username, type: 'staff',
        department: department || '', reason: reason || '',
        status: '待审核', time: new Date().toLocaleString('zh-CN')
      }
    })
    res.json({ success: true, data: app })
  } catch (e) { console.error('[apply.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 我的申请列表
router.get('/my', authenticate, async (req, res) => {
  try {
    const data = await prisma.application.findMany({
      where: { userId: req.user.cid },
      orderBy: { id: 'desc' }
    })
    res.json({ success: true, data })
  } catch (e) { console.error('[apply.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
