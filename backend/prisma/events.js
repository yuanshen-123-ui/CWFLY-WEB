import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'
import { createNotification } from './notifications.js'

const router = Router()

// 演示数据已清除，上线后由管理员创建

// --- Constants ---
const STATUS_CANCELLED = 'cancelled'

// --- Helper ---
async function enrichEvents(events) {
  return Promise.all(events.map(async (e) => {
    const [total, pilotCount, controllerCount] = await Promise.all([
      prisma.eventRegistration.count({ where: { eventId: e.id, status: { not: STATUS_CANCELLED } } }),
      prisma.eventRegistration.count({ where: { eventId: e.id, type: 'pilot', status: { not: STATUS_CANCELLED } } }),
      prisma.eventRegistration.count({ where: { eventId: e.id, type: 'controller', status: { not: STATUS_CANCELLED } } })
    ])
    return { ...e, registrationCount: total, pilotCount, controllerCount }
  }))
}

// --- Routes ---

// POST / — 创建活动
router.post('/', authenticate, async (req, res) => {
  try {
    // 仅管理员（rating>=9）或有任意细分权限的用户可创建
    if (!req.user?.rating || req.user.rating < 9) {
      const perms = (req.user?.permissions || '').split(',').filter(Boolean)
      if (!perms.length) {
        return res.status(403).json({ success: false, message: '无权限创建活动' })
      }
    }
    const { title, date, dep, arr, route, distance, notams, desc, poster, atcPositions, publisher, status } = req.body
    if (!title) return res.status(400).json({ success: false, message: '缺少活动标题' })
    const event = await prisma.event.create({
      data: {
        title,
        date: date || '',
        dep: dep || '',
        arr: arr || '',
        route: route || '',
        distance: distance || '',
        notams: notams || '',
        desc: desc || '',
        poster: poster || '',
        atcPositions: atcPositions || '',
        publisher: publisher || req.user.username || '',
        status: status || '报名中'
      }
    })
    res.json({ success: true, data: event })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// PUT /:id — 更新活动
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!req.user?.rating || req.user.rating < 9) {
      const perms = (req.user?.permissions || '').split(',').filter(Boolean)
      if (!perms.length) return res.status(403).json({ success: false, message: '无权限修改活动' })
    }
    const id = Number(req.params.id)
    const existing = await prisma.event.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ success: false, message: '活动不存在' })
    const { title, date, dep, arr, route, distance, notams, desc, poster, atcPositions, publisher, status } = req.body
    const data = {} // Event 模型没有 createdAt/updatedAt 字段
    if (title !== undefined) data.title = title
    if (date !== undefined) data.date = date
    if (dep !== undefined) data.dep = dep
    if (arr !== undefined) data.arr = arr
    if (route !== undefined) data.route = route
    if (distance !== undefined) data.distance = distance
    if (notams !== undefined) data.notams = notams
    if (desc !== undefined) data.desc = desc
    if (poster !== undefined) data.poster = poster
    if (atcPositions !== undefined) data.atcPositions = atcPositions
    if (publisher !== undefined) data.publisher = publisher
    if (status !== undefined) data.status = status
    const updated = await prisma.event.update({ where: { id }, data })
    res.json({ success: true, data: updated })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// DELETE /registrations/:id — 取消报名（必须定义在 /:id 之前，避免被 /:id 拦截）
// 管理员可取消任意报名，普通用户仅能取消自己的
router.delete('/registrations/:id', authenticate, async (req, res) => {
  try {
    const reg = await prisma.eventRegistration.findUnique({ where: { id: Number(req.params.id) } })
    if (!reg) return res.status(404).json({ success: false, message: '报名记录不存在' })
    const isAdmin = (req.user?.rating ?? 0) >= 9 || (req.user?.permissions || '').split(',').includes('event')
    // 非管理员只能取消自己的报名
    if (!isAdmin && String(reg.userId) !== String(req.user.cid)) {
      return res.status(403).json({ success: false, message: '只能取消自己的报名' })
    }
    await prisma.eventRegistration.update({
      where: { id: Number(req.params.id) },
      data: { status: 'cancelled' }
    })
    res.json({ success: true, message: '已取消报名' })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// DELETE /:id — 删除活动
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!req.user?.rating || req.user.rating < 9) {
      const perms = (req.user?.permissions || '').split(',').filter(Boolean)
      if (!perms.length) return res.status(403).json({ success: false, message: '无权限删除活动' })
    }
    const id = Number(req.params.id)
    const existing = await prisma.event.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ success: false, message: '活动不存在' })
    await prisma.eventRegistration.deleteMany({ where: { eventId: id } })
    await prisma.event.delete({ where: { id } })
    res.json({ success: true, message: '已删除' })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// GET / — 获取活动列表
router.get('/', async (req, res) => {
  try {
    const data = await prisma.event.findMany({ orderBy: { id: 'desc' } })
    const enriched = await enrichEvents(data)
    res.json({ success: true, data: enriched })
  } catch (e) {
    console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// GET /my — 我的报名（含取消的，需在 /:id 之前定义）
router.get('/my', authenticate, async (req, res) => {
  try {
    const registrations = await prisma.eventRegistration.findMany({ where: { userId: req.user.cid }, orderBy: { id: 'desc' } })
    const events = await Promise.all(registrations.map(async r => {
      const ev = await prisma.event.findUnique({ where: { id: r.eventId } })
      return { ...r, event: ev }
    }))
    res.json({ success: true, data: events })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// GET /my-registrations — 我的报名列表（需在 /:id 之前定义）
router.get('/my-registrations', authenticate, async (req, res) => {
  try {
    const regs = await prisma.eventRegistration.findMany({
      where: { userId: req.user.cid, status: { not: 'cancelled' } },
      orderBy: { id: 'desc' }
    })
    const enriched = await Promise.all(regs.map(async r => {
      const ev = await prisma.event.findUnique({ where: { id: r.eventId } })
      return { ...r, event: ev }
    }))
    res.json({ success: true, data: enriched })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// GET /reviews — 活动回顾（需在 /:id 之前定义）
router.get('/reviews', async (req, res) => {
  try {
    const data = await prisma.activityReview.findMany({
      orderBy: { id: 'desc' },
      take: 50
    })
    res.json({ success: true, data })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// GET /:id — 获取活动详情（含报名列表）
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) return res.status(404).json({ success: false, message: '活动不存在' })
    const [pilots, controllers] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: { eventId: id, type: 'pilot', status: { not: STATUS_CANCELLED } },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.eventRegistration.findMany({
        where: { eventId: id, type: 'controller', status: { not: STATUS_CANCELLED } },
        orderBy: { createdAt: 'asc' }
      })
    ])
    // 获取飞行员和管制员的用户信息
    const allUserIds = [...pilots.map(p => p.userId), ...controllers.map(c => c.userId)]
    const users = await prisma.user.findMany({
      where: { cid: { in: allUserIds } },
      select: { cid: true, username: true, rating: true, fsdLevel: true }
    })
    const userMap = Object.fromEntries(users.map(u => [u.cid, u]))
    res.json({
      success: true, data: {
        ...event,
        pilots: pilots.map(p => ({ ...p, user: userMap[p.userId] || null })),
        controllers: controllers.map(c => ({ ...c, user: userMap[c.userId] || null })),
        pilotCount: pilots.length,
        controllerCount: controllers.length,
        registrationCount: pilots.length + controllers.length
      }
    })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/:id/join', authenticate, async (req, res) => {
  try {
    const eventId = Number(req.params.id)
    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) return res.status(404).json({ success: false, message: '活动不存在' })
    if (event.status !== '报名中') return res.status(400).json({ success: false, message: '该活动不在报名期' })
    const { type, callsign, aircraft, position } = req.body
    const regType = type === 'controller' ? 'controller' : 'pilot'
    // 管制员报名时校验用户是否具备管制员资格（fsdLevel >= 5 = C1）
    let savedCallsign = callsign || ''
    let savedFrequency = ''
    if (regType === 'controller') {
      const fsdLevel = req.user?.fsdLevel ?? 0
      if (fsdLevel < 5) {
        return res.status(403).json({ success: false, message: '仅管制员（C1 及以上）可报名管制席位' })
      }
      // 校验所选席位是否属于该活动的管制席位，并自动填充呼号/频率
      if (position) {
        let matched = null
        try {
          const atcPositions = JSON.parse(event.atcPositions || '[]')
          if (Array.isArray(atcPositions)) {
            matched = atcPositions.find(p => (p.callsign || p.type) === position)
          }
        } catch { matched = null }
        if (!matched) return res.status(400).json({ success: false, message: '所选席位不属于该活动' })
        savedCallsign = matched.callsign || position
        savedFrequency = matched.frequency || ''
      }
    }
    // 检查是否已报名
    const existing = await prisma.eventRegistration.findFirst({
      where: { eventId, userId: req.user.cid, type: regType, status: { not: 'cancelled' } }
    })
    if (existing) return res.status(409).json({ success: false, message: '您已报名该活动' })
    // 管制员报名时检查席位是否已被占用
    if (regType === 'controller' && position) {
      const posTaken = await prisma.eventRegistration.findFirst({
        where: { eventId, type: 'controller', position, status: { not: 'cancelled' } }
      })
      if (posTaken) return res.status(409).json({ success: false, message: '该席位已被报名' })
    }
    const now = new Date().toISOString()
    await prisma.eventRegistration.create({
      data: {
        eventId, userId: req.user.cid, type: regType,
        callsign: savedCallsign || callsign || '', aircraft: aircraft || '',
        position: position || '',
        frequency: savedFrequency || '',
        status: 'registered', createdAt: now, updatedAt: now
      }
    })
    const typeLabel = regType === 'controller' ? '管制员' : '飞行员'
    await createNotification(req.user.cid, 'event', `${typeLabel}报名成功：${event.title}`,
      `您已成功以${typeLabel}身份报名「${event.title}」。`, '/events')
    res.json({ success: true, message: `${typeLabel}报名成功！` })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.delete('/:id/join', authenticate, async (req, res) => {
  try {
    await prisma.eventRegistration.updateMany({
      where: { eventId: Number(req.params.id), userId: req.user.cid, status: 'registered' },
      data: { status: 'cancelled' }
    })
    res.json({ success: true, message: '已取消报名' })
  } catch (e) { console.error('[events.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
