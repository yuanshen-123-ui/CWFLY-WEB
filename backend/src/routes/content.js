import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'
import { fetchAirportByICAO, normalizeAirportData, saveAirportToDB } from '../services/openaip.js'

const router = Router()

// 演示数据已清除，上线后由管理员创建

// --- Constants ---
const PUBLISHED = 'published'

// --- Routes ---

// GET /knowledge — 知识库列表
router.get('/knowledge', async (req, res) => {
  try {
    const { category } = req.query
    const where = category
      ? { category, status: PUBLISHED }
      : { status: PUBLISHED }
    const data = await prisma.knowledgeBase.findMany({ where, orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch (e) {
    console.error('[content.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/knowledge/:id', async (req, res) => {
  try {
    // 安全(2026-08-07): 仅返回已发布内容, 防止草稿/未发布内容被 ID 枚举读取
    const item = await prisma.knowledgeBase.findFirst({ where: { id: Number(req.params.id), status: PUBLISHED } })
    if (!item) return res.status(404).json({ success: false, message: '不存在' })
    await prisma.knowledgeBase.update({ where: { id: item.id }, data: { views: item.views + 1 } })
    res.json({ success: true, data: item })
  } catch (e) { console.error('[content.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 搜索（必须先于 /:icao）
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q) return res.json({ success: true, data: [] })
    const [events, posts, airports, knowledge] = await Promise.all([
      prisma.event.findMany({ where: { title: { contains: q } }, take: 10 }),
      prisma.forumPost.findMany({ where: { title: { contains: q } }, take: 10 }),
      prisma.airport.findMany({ where: { OR: [{ icao: { contains: q.toUpperCase() } }, { name: { contains: q } }, { city: { contains: q } }] }, take: 10 }),
      prisma.knowledgeBase.findMany({ where: { title: { contains: q }, status: 'published' }, take: 10 }),
    ])
    res.json({ success: true, data: { events, posts, airports, knowledge } })
  } catch (e) { console.error('[content.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 机场列表/查询
router.get('/', async (req, res) => {
  try {
    const { icao } = req.query
    const where = icao ? { icao: icao.toUpperCase() } : {}
    const data = await prisma.airport.findMany({ where, orderBy: { icao: 'asc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[content.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/:icao', async (req, res) => {
  try {
    const icao = req.params.icao.toUpperCase()
    let ap = await prisma.airport.findUnique({ where: { icao } })
    let fromOpenAIP = false

    // 如果数据库有数据但缺少频率/跑道，尝试从 OpenAIP 补充
    if (ap) {
      let frequencies = []
      let runways = []
      try { frequencies = JSON.parse(ap.frequencies) } catch {}
      try { runways = JSON.parse(ap.runways) } catch {}

      // 缺少详细数据时尝试 OpenAIP
      if (frequencies.length === 0 || runways.length === 0) {
        const oaData = await fetchAirportByICAO(icao)
        if (oaData) {
          const normalized = normalizeAirportData(oaData)
          if (normalized) {
            await saveAirportToDB(prisma, normalized)
            // 重新读取
            ap = await prisma.airport.findUnique({ where: { icao } })
            fromOpenAIP = true
            try { frequencies = JSON.parse(ap.frequencies) } catch {}
            try { runways = JSON.parse(ap.runways) } catch {}
          }
        }
      }

      res.json({
        success: true,
        data: {
          ...ap,
          frequencies,
          runways,
          isMilitary: ap.isMilitary || false,
          _source: fromOpenAIP ? 'openaip' : 'local',
        }
      })
    } else {
      // 数据库无该机场，尝试从 OpenAIP 获取
      const oaData = await fetchAirportByICAO(icao)
      if (oaData) {
        const normalized = normalizeAirportData(oaData)
        if (normalized) {
          await saveAirportToDB(prisma, normalized)
          const saved = await prisma.airport.findUnique({ where: { icao } })
          let frequencies = []
          let runways = []
          try { frequencies = JSON.parse(saved.frequencies) } catch {}
          try { runways = JSON.parse(saved.runways) } catch {}
          return res.json({
            success: true,
            data: { ...saved, frequencies, runways, _source: 'openaip' },
          })
        }
      }
      return res.status(404).json({ success: false, message: '机场不存在' })
    }
  } catch (e) { console.error('[content.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
