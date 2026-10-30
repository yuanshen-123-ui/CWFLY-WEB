import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'
import net from 'net'
import crypto from 'crypto'

const router = Router()

// ===== 飞行计划字段格式校验（与前端一致）: 不匹配正则的字段清空抛弃 =====
const FP_PATTERNS = {
  callsign: /^[A-Za-z0-9]{1,7}$/,       // 呼号: 英文+数字 最大7位
  flightType: /^(IFR|VFR)$/i,
  aircraft: /^[A-Za-z0-9]{1,5}$/,       // 飞机类型: 英文+数字 最大5位
  transponder: /^[A-Za-z0-9]+$/,        // 二次雷达代码: 英文+数字 无位数限制
  wakeCategory: /^(L|M|H|J)$/i,
  cruiseAlt: /^\d{1,5}$/,               // 巡航高度: 数字 最大5位
  depIcao: /^[A-Za-z]{1,4}$/i,          // 离场机场: 英文 最大4位
  arrIcao: /^[A-Za-z]{1,4}$/i,
  alternate: /^[A-Za-z]{1,4}$/i,
  depTime: /^\d{4}$/,                   // 离场时间: 数字4位
  flightTime: /^\d{4}$/,
  cruiseSpeed: /^\d{3}$/,               // 巡航真空速: 数字3位
  endurance: /^\d{4}$/,
  equipment: /^[A-Za-z0-9]+$/,          // 设备代码: 英文+数字 无位数限制
  route: /^[A-Za-z0-9\s]+$/,            // 航路: 英文+数字(含空格) 无位数限制
  remarks: /^[A-Za-z0-9\s]+$/           // 备注: 英文+数字(含空格) 无位数限制
}

// ==================== 公开接口（无需登录） ====================

// 获取管制区域边界(数据源: FlightController 在线快照表)
router.get('/fsd/boundaries', async (req, res) => {
  try {
    const { getControllerBoundaries } = await import('../services/controllerBoundaries.js')
    const rows = await prisma.$queryRaw`
      SELECT callsign, cid, realname, latitude AS lat, longitude AS lon,
             frequency, facilityType, visualRange
      FROM FlightController
      ORDER BY updatedAt DESC
    `
    const controllers = (rows || []).map(c => ({
      callsign: c.callsign,
      cid: c.cid,
      realname: c.realname,
      rating: 0,
      facilityType: Number(c.facilityType) || 0,
      frequency: c.frequency != null ? Number(c.frequency).toFixed(3) : '0',
      visualRange: Number(c.visualRange) || 40,
      lat: Number(c.lat) || 0,
      lon: Number(c.lon) || 0,
      altitude: 0,
      lastSeen: Date.now(),
    }))
    const boundaries = getControllerBoundaries(controllers)
    res.json({ success: true, data: boundaries })
  } catch (e) {
    res.json({ success: true, data: [] })
  }
})

// 获取当前在线机组(数据源: FlightPilot 在线快照表 + JOIN FlightPlan 最新计划)
router.get('/fsd/online', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT p.callsign, p.cid, p.realname, p.longitude AS lon, p.latitude AS lat,
             p.altitude, p.groundspd, p.transponder, p.transpondermd, p.updatedAt,
             p.heading, p.bank, p.pitch,
             fp.aircraft, fp.depIcao AS dep, fp.arrIcao AS dest, fp.route
      FROM FlightPilot p
      LEFT JOIN (SELECT callsign, MAX(id) AS max_id FROM FlightPlan GROUP BY callsign) t
        ON t.callsign = p.callsign
      LEFT JOIN FlightPlan fp ON fp.id = t.max_id
      ORDER BY p.updatedAt DESC
    `
    const data = (rows || []).map(p => ({
      callsign: p.callsign,
      cid: p.cid,
      realname: p.realname,
      aircraft: p.aircraft || '',
      dep: p.dep || '',
      dest: p.dest || '',
      route: p.route || '',
      altitude: Number(p.altitude) || 0,
      groundspeed: Number(p.groundspd) || 0,
      transponder: Number(p.transponder) || 0,
      rating: 0,
      lat: Number(p.lat) || 0,
      lon: Number(p.lon) || 0,
      heading: Number(p.heading) || 0,
      bank: Number(p.bank) || 0,
      pitch: Number(p.pitch) || 0,
      trail: [],
      lastSeen: p.updatedAt ? new Date(p.updatedAt).getTime() : Date.now(),
      firstSeen: null,
      type: /_(CTR|APP|TWR|GND|DEL|FSS)$/i.test(p.callsign || '') ? 'ATC' : 'PILOT'
    }))
    res.json({ success: true, data, source: 'snapshot' })
  } catch (e) {
    res.json({ success: true, data: [], source: 'error' })
  }
})

// 获取当前在线管制员(数据源: FlightController 在线快照表)
router.get('/fsd/controllers', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT callsign, cid, realname, latitude AS lat, longitude AS lon,
             frequency, facilityType, visualRange, updatedAt
      FROM FlightController
      ORDER BY updatedAt DESC
    `
    const data = (rows || []).map(c => ({
      callsign: c.callsign,
      cid: c.cid,
      realname: c.realname,
      frequency: c.frequency != null ? Number(c.frequency).toFixed(3) : '0',
      facilityType: Number(c.facilityType) || 0,
      visualRange: Number(c.visualRange) || 40,
      lat: Number(c.lat) || 0,
      lon: Number(c.lon) || 0,
      lastSeen: c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now()
    }))
    res.json({ success: true, data })
  } catch (e) {
    res.json({ success: true, data: [], source: 'error' })
  }
})

// ==================== 3. 通过分享 ID 获取（公开：必须在 authenticate 之前注册）====================
// 修复：此前该路由位于 router.use(authenticate) 之后 → 分享链接恒被 401 拦截，分享功能不可用
router.get('/share/:shareId', async (req, res) => {
  try {
    const shareId = String(req.params.shareId || '').trim()
    if (!/^[A-Z0-9]{4,16}$/i.test(shareId)) {
      return res.status(400).json({ success: false, message: '分享 ID 格式不正确' })
    }
    const plan = await prisma.flightPlan.findFirst({
      where: { shareId },
      // 分享场景不暴露用户主键等内部信息
      select: {
        id: true, callsign: true, flightType: true, aircraft: true, wakeCategory: true,
        equipment: true, transponder: true, depIcao: true, depTime: true, cruiseAlt: true,
        cruiseSpeed: true, arrIcao: true, alternate: true, flightTime: true, endurance: true,
        route: true, remarks: true, shareId: true, filedAt: true
      }
    })
    if (!plan) return res.status(404).json({ success: false, message: '飞行计划不存在' })
    res.json({ success: true, data: plan })
  } catch (e) {
    console.error('[flightplans.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 所有飞行计划接口需要登录
router.use(authenticate)

// ==================== 通知 fsd-py 广播(通过管理端口 3012) ====================
// 去掉周期定时广播后, 官网提交/删除计划由后端主动通知 fsd-py 触发广播
const FSD_MGMT_HOST = process.env.FSD_MGMT_HOST || '127.0.0.1'
const FSD_MGMT_PORT = Number(process.env.FSD_MGMT_PORT || 3012)
const FSD_MGMT_PASSWORD = process.env.FSD_MGMT_PASSWORD || ''

function notifyFsd(action, callsign) {
  return new Promise((resolve) => {
    if (!FSD_MGMT_PASSWORD) return resolve(false)
    const client = net.connect({ host: FSD_MGMT_HOST, port: FSD_MGMT_PORT }, () => {
      client.write(`pwd ${FSD_MGMT_PASSWORD}\r\n`)
      client.write(`${action === 'del' ? 'plandel' : 'planadd'} ${callsign}\r\n`)
      setTimeout(() => { client.destroy(); resolve(true) }, 600)
    })
    client.setTimeout(3000)
    client.on('timeout', () => { client.destroy(); resolve(false) })
    client.on('error', () => resolve(false))
  })
}

// ==================== 生成分享 ID ====================
function generateShareId() {
  // 安全(2026-10-25 审计 P2-4): crypto 随机(分享 ID 对应公开端点, Math.random 可预测)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 8; i++) {
    id += chars[crypto.randomInt(0, chars.length)]
  }
  return id
}

// ==================== 1. 获取自己的飞行计划列表 ====================
router.get('/', authenticate, async (req, res) => {
  try {
    const plans = await prisma.flightPlan.findMany({
      where: { userId: req.user.cid },
      orderBy: { id: 'desc' }
    })
    res.json({ success: true, data: plans })
  } catch {
    res.status(500).json({ success: false, message: '查询失败' })
  }
})

// ==================== 2. 获取单个飞行计划 ====================
// 审计修复：添加所有权校验，防止 IDOR
router.get('/:id', authenticate, async (req, res) => {
  try {
    const plan = await prisma.flightPlan.findFirst({
      where: { id: Number(req.params.id), userId: req.user.cid }
    })
    if (!plan) return res.status(404).json({ success: false, message: '飞行计划不存在' })
    res.json({ success: true, data: plan })
  } catch {
    res.status(500).json({ success: false, message: '查询失败' })
  }
})

// ==================== 4. 提交新飞行计划 ====================
router.post('/', authenticate, async (req, res) => {
  try {
    const raw = req.body
    const P = FP_PATTERNS
    const str = (v) => v == null ? '' : String(v).trim()
    // 字段格式校验: 不匹配正则的字段清空(抛弃), 防止非法数据入库
    const clean = (v, p) => { const s = str(v); return (p && s && !p.test(s)) ? '' : s }

    const callsign = clean(raw.callsign, P.callsign)
    const flightType = clean(raw.flightType, P.flightType) || 'IFR'
    const aircraft = clean(raw.aircraft, P.aircraft)
    const wakeCategory = clean(raw.wakeCategory, P.wakeCategory)
    const equipment = clean(raw.equipment, P.equipment)
    // FSD 标准 aircraft 格式: 机型/尾流等级, 如 A359/H、A359/L、A359/J
    // M(中型)不显示后缀, 直接 A359; 设备代码不放入 aircraft
    const wake = wakeCategory ? wakeCategory.toUpperCase() : ''
    const fsdAircraft = aircraft.toUpperCase() + (wake && wake !== 'M' ? '/' + wake : '')
    const transponder = clean(raw.transponder, P.transponder)
    const depIcao = clean(raw.depIcao, P.depIcao)
    const depTime = clean(raw.depTime, P.depTime)
    const cruiseAlt = clean(raw.cruiseAlt, P.cruiseAlt)
    const cruiseSpeed = clean(raw.cruiseSpeed, P.cruiseSpeed)
    const arrIcao = clean(raw.arrIcao, P.arrIcao)
    const alternate = clean(raw.alternate, P.alternate)
    const flightTime = clean(raw.flightTime, P.flightTime)
    const endurance = clean(raw.endurance, P.endurance)
    const route = clean(raw.route, P.route)
    const remarks = clean(raw.remarks, P.remarks)

    if (!callsign || !depIcao || !arrIcao) {
      return res.status(400).json({ success: false, message: '请填写呼号、起降机场' })
    }

    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const planData = {
      userId: req.user.cid,
      callsign: callsign.toUpperCase(),
      flightType: flightType.toUpperCase(),
      aircraft: fsdAircraft,
      wakeCategory: wakeCategory.toUpperCase(),
      equipment: equipment.toUpperCase(),
      transponder: transponder.toUpperCase(),
      depIcao: depIcao.toUpperCase(),
      depTime,
      cruiseAlt,
      cruiseSpeed,
      arrIcao: arrIcao.toUpperCase(),
      alternate: alternate.toUpperCase(),
      flightTime,
      endurance,
      route,
      remarks,
      filedAt: now,
      syncFsd: false
    }

    // 30 分钟内重复提交: 直接覆盖最近一条(根据 filedAt 判断), 保留原 shareId
    const WINDOW_MS = 30 * 60 * 1000
    const lastPlan = await prisma.flightPlan.findFirst({
      where: { userId: req.user.cid },
      orderBy: { id: 'desc' }
    })
    let plan
    if (lastPlan && lastPlan.filedAt) {
      const lastTime = new Date(lastPlan.filedAt).getTime()
      if (!isNaN(lastTime) && (Date.now() - lastTime) < WINDOW_MS) {
        plan = await prisma.flightPlan.update({
          where: { id: lastPlan.id },
          data: { ...planData, shareId: lastPlan.shareId }
        })
        // 通知 fsd-py 广播, 成功则标记已同步
        const notified = await notifyFsd('add', callsign.toUpperCase())
        if (notified) {
          await prisma.flightPlan.update({ where: { id: plan.id }, data: { syncFsd: true } })
          plan.syncFsd = true
        }
        return res.json({ success: true, data: plan, overwritten: true })
      }
    }
    plan = await prisma.flightPlan.create({
      data: { ...planData, shareId: generateShareId() }
    })

    // 通知 fsd-py 广播, 成功则标记已同步
    const notified = await notifyFsd('add', callsign.toUpperCase())
    if (notified) {
      await prisma.flightPlan.update({ where: { id: plan.id }, data: { syncFsd: true } })
      plan.syncFsd = true
    }
    res.json({ success: true, data: plan })
  } catch (e) {
    console.error('[flightplans.js] POST 提交失败:', e?.message)
    res.status(500).json({ success: false, message: '提交失败' })
  }
})

// ==================== 5. 同步已有计划到 FSD ====================
router.post('/:id/fsd-sync', authenticate, async (req, res) => {
  try {
    const plan = await prisma.flightPlan.findUnique({
      where: { id: Number(req.params.id) }
    })
    if (!plan) return res.status(404).json({ success: false, message: '飞行计划不存在' })
    if (plan.userId !== req.user.cid) {
      return res.status(403).json({ success: false, message: '无权操作此计划' })
    }

    // 置为待广播: fsd-py 周期扫描后会广播给在线管制员并置 syncFsd=1
    await prisma.flightPlan.update({
      where: { id: plan.id },
      data: { syncFsd: false }
    })

    res.json({ success: true, message: '已加入广播队列' })
  } catch {
    res.status(500).json({ success: false, message: '操作失败' })
  }
})

// ==================== 6. 删除飞行计划 ====================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const plan = await prisma.flightPlan.findUnique({
      where: { id: Number(req.params.id) }
    })
    if (!plan) return res.status(404).json({ success: false, message: '飞行计划不存在' })
    if (plan.userId !== req.user.cid) {
      return res.status(403).json({ success: false, message: '无权删除此计划' })
    }

    await prisma.flightPlan.delete({ where: { id: plan.id } })
    // 通知 fsd-py 广播移除该呼号计划
    notifyFsd('del', plan.callsign).catch(() => {})
    res.json({ success: true, message: '飞行计划已删除' })
  } catch {
    res.status(500).json({ success: false, message: '删除失败' })
  }
})

// ==================== 7. 从 SimBrief 导入 ====================
router.post('/simbrief-import', authenticate, async (req, res) => {
  try {
    const { simbriefId } = req.body
    if (!simbriefId) return res.status(400).json({ success: false, message: '缺少 SimBrief ID' })

    // 从 SimBrief API 获取飞行计划（带超时，避免慢网络长时间挂起）
    const apiUrl = `https://www.simbrief.com/api/xml.fetcher.php?userid=${encodeURIComponent(simbriefId)}`
    let response
    try {
      response = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) })
    } catch (e) {
      // 之前只记 e.name（如 "TypeError"）看不到真实原因，这里补上 message 与 cause
      console.error('[simbrief] 连接失败:', e?.name, e?.message, e?.cause?.code || e?.cause?.message || '')
      return res.status(502).json({ success: false, message: '无法连接 SimBrief，请检查网络后重试' })
    }
    if (!response.ok) {
      // 读取 SimBrief 返回正文，把具体原因透出（400 时常见：ID 无效 / 无飞行计划）
      let reason = ''
      try {
        const body = await response.text()
        const m = body.match(/<status>([^<]*)<\/status>/)
        reason = m ? m[1].trim() : ''
      } catch { /* 忽略 */ }
      if (reason.includes('Unknown UserID')) {
        return res.status(404).json({ success: false, message: 'SimBrief 用户 ID 无效：请输入 SimBrief 个人页里的数字 User ID（不是用户名或邮箱）' })
      }
      if (reason.includes('No flight plan')) {
        return res.status(404).json({ success: false, message: '该 SimBrief 账号暂无飞行计划：请先在 SimBrief 官网生成一份 OFP 再导入' })
      }
      return res.status(502).json({ success: false, message: `SimBrief 返回异常（HTTP ${response.status}${reason ? '：' + reason : ''}）` })
    }
    const xmlText = await response.text()
    if (!xmlText.includes('<OFP')) {
      return res.status(404).json({ success: false, message: '未找到该 SimBrief 用户的飞行计划，请确认 User ID' })
    }

    // SimBrief OFP XML 是嵌套结构（<origin><icao_code>…</icao_code></origin>），
    // 先按区块切分，再从区块内提取字段，避免抓错同名字段
    const block = (tag, src) => {
      const m = String(src || '').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
      return m ? m[1] : ''
    }
    const field = (tag, src) => {
      const m = String(src || '').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
      return m ? m[1].trim() : ''
    }
    const general = block('general', xmlText)
    const origin = block('origin', xmlText)
    const destination = block('destination', xmlText)
    const alternate = block('alternate', xmlText)
    const aircraft = block('aircraft', xmlText)
    const times = block('times', xmlText)
    // 呼号/飞行类型在 flightplan_text 区块（不在 general）
    const fpText = block('flightplan_text', xmlText)

    const fmtTime = (epoch) => {
      const t = new Date(Number(epoch) * 1000)
      return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(11, 16).replace(':', '')
    }
    const fmtDur = (sec) => {
      const s = Number(sec)
      if (!s || Number.isNaN(s) || s <= 0) return ''
      return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
    }

    const callsign = (field('callsign', fpText) || field('callsign', xmlText) || `CSN${Math.floor(Math.random() * 9000 + 1000)}`).toUpperCase()
    const aircraftCode = (field('icao_code', aircraft) || field('icaocode', aircraft) || 'A320').toUpperCase()
    const depIcao = field('icao_code', origin).toUpperCase()
    const arrIcao = field('icao_code', destination).toUpperCase()
    const alternateIcao = field('icao_code', alternate).toUpperCase()
    const depTime = fmtTime(field('est_out', times) || field('sched_out', times))
    const cruiseAlt = field('initial_altitude', general) || ''
    const cruiseSpeed = field('cruise_tas', general) || ''
    const route = field('route', general) || ''
    const flightTime = fmtDur(field('est_time_enroute', times))
    const endurance = fmtDur(field('endurance', times))
    const flightType = (field('flight_type', fpText) || field('flight_type', xmlText) || 'I').toUpperCase()
    const equipment = field('equip', aircraft) || field('equipment', aircraft) || ''

    if (!depIcao || !arrIcao) {
      return res.status(404).json({ success: false, message: 'SimBrief 计划缺少起降机场，可能未生成完整 OFP' })
    }

    const shareId = generateShareId()
    const now = new Date().toLocaleString('zh-CN', { hour12: false })

    const plan = await prisma.flightPlan.create({
      data: {
        userId: req.user.cid,
        callsign,
        flightType: flightType === 'V' ? 'VFR' : 'IFR',
        aircraft: aircraftCode,
        equipment,
        transponder: '',
        depIcao,
        depTime: depTime || '',
        cruiseAlt: cruiseAlt || '',
        cruiseSpeed: cruiseSpeed || '',
        arrIcao,
        alternate: alternateIcao,
        flightTime: flightTime || '',
        endurance: endurance || '',
        route: route || '',
        shareId,
        filedAt: now,
        syncFsd: false
      }
    })

    res.json({ success: true, data: plan, message: '已从 SimBrief 导入' })
  } catch (e) {
    res.status(500).json({ success: false, message: 'SimBrief 导入失败' })
  }
})
export default router
