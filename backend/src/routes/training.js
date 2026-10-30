import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'

const router = Router()
router.use(authenticate)

// 课程列表
router.get('/courses', async (req, res) => {
  try {
    const data = await prisma.trainingCourse.findMany({ orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[training.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 报名课程
router.post('/courses/:id/enroll', async (req, res) => {
  try {
    const courseId = Number(req.params.id)
    const existing = await prisma.trainingRecord.findFirst({ where: { courseId, userId: req.user.cid } })
    if (existing) return res.status(409).json({ success: false, message: '已报名该课程' })
    const record = await prisma.trainingRecord.create({
      data: { courseId, userId: req.user.cid, status: 'in_progress' }
    })
    res.json({ success: true, data: record, message: '报名成功' })
  } catch (e) { console.error('[training.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 我的培训记录
router.get('/records', async (req, res) => {
  try {
    const data = await prisma.trainingRecord.findMany({
      where: { userId: req.user.cid },
      orderBy: { id: 'desc' }
    })
    res.json({ success: true, data })
  } catch (e) { console.error('[training.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 考试详情
router.get('/exams/:id', async (req, res) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: Number(req.params.id) } })
    if (!exam) return res.status(404).json({ success: false, message: '考试不存在' })
    res.json({ success: true, data: exam })
  } catch (e) { res.status(500).json({ success: false, message: '查询失败' }) }
})

// 提交考试
router.post('/exams/:id/submit', async (req, res) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: Number(req.params.id) } })
    if (!exam) return res.status(404).json({ success: false, message: '考试不存在' })
    const { answers } = req.body
    const questions = exam.questions || []
    let score = 0
    if (answers && Array.isArray(answers)) {
      answers.forEach((a, i) => {
        if (i < questions.length && a === questions[i].correctIndex) score += 20
      })
    }
    const total = questions.length * 20
    const passed = score >= total * 0.6
    res.json({ success: true, data: { score, passed, total } })
  } catch (e) { res.status(500).json({ success: false, message: '提交失败' }) }
})

// 排班列表
// 修复(2026-10-16)：模型此前没有 date 字段，where/orderBy 用 date 必抛 Prisma 校验错 → 接口 500
router.get('/schedules', async (req, res) => {
  try {
    const date = (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) ? req.query.date : ''
    const where = date ? { date } : {}
    const rows = await prisma.controllerSchedule.findMany({ where, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] })
    // 兼容前端读取的 userId 字段（模型字段是 cid），并附带用户名便于展示
    const cids = [...new Set(rows.map(r => r.cid).filter(Boolean))]
    const users = cids.length
      ? await prisma.user.findMany({ where: { cid: { in: cids } }, select: { cid: true, username: true } })
      : []
    const nameMap = new Map(users.map(u => [u.cid, u.username]))
    const data = rows.map(r => ({ ...r, userId: r.cid, username: nameMap.get(r.cid) || '' }))
    res.json({ success: true, data })
  } catch (e) { console.error('[training.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 申请值班
// 修复(2026-10-16)：原来写入 { userId, date } 两个模型不存在的字段（且 eventId 必填未提供）→ 必失败
router.post('/schedules', async (req, res) => {
  try {
    const { date, position, startTime, endTime } = req.body || {}
    if (!date || !position || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: '请填写日期、席位、开始与结束时间' })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ success: false, message: '日期格式应为 YYYY-MM-DD' })
    }
    const data = await prisma.controllerSchedule.create({
      data: {
        cid: req.user.cid,                        // 模型字段为 cid
        eventId: Number(req.body.eventId) || 0,   // 模型 eventId 必填 Int；非活动排班存 0
        date: String(date),
        position: String(position).slice(0, 64),
        frequency: String(req.body.frequency || '').slice(0, 16),
        startTime: String(startTime).slice(0, 32),
        endTime: String(endTime).slice(0, 32),
        status: 'pending'
      }
    })
    res.json({ success: true, data: { ...data, userId: data.cid }, message: '申请成功，等待审核' })
  } catch (e) { console.error('[training.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
