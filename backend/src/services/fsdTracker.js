/**
 * FSD9 协议直连追踪器
 *
 * 通过 TCP 直连 FSD 服务器 (6809)，
 * 实时接收所有客户端位置更新，
 * 记录每个飞行员的经纬度轨迹。
 *
 * 作为备份，也支持从 HTTP API 轮询。
 */

import { connect } from 'net'
import crypto from 'crypto'

const FSD_HOST = process.env.FSD_HOST || '127.0.0.1'
const FSD_PORT = Number(process.env.FSD_PORT || 6809)
const FSD_API_URL = process.env.FSD_API_URL || 'http://127.0.0.1:8080/api'

// 每个飞行员最多保留的轨迹点数
const MAX_TRAIL_POINTS = 200

// 轨迹数据：Map<callsign, { trail[], current, plan }>
const pilotTrails = new Map()

// ATC 客户端数据：Map<callsign, { callsign, cid, realname, rating, facilityType, frequency, visualRange, lat, lon, altitude, lastSeen }>
const atcClients = new Map()

// Socket.IO 实时广播
function broadcastFsdUpdate() {
  const io = global.__fsd_io
  if (!io) return
  const now = Date.now()
  if (broadcastFsdUpdate._last && now - broadcastFsdUpdate._last < 800) return
  broadcastFsdUpdate._last = now
  try {
    // 动态导入边界计算（避免循环依赖）
    import('../services/controllerBoundaries.js').then(({ getControllerBoundaries }) => {
      const boundaries = getControllerBoundaries(getAtcClients())
      const pilots = getPilotTrails()
      console.log(`[FSD-Broadcast] 广播 ${boundaries.length} 个边界, ${pilots.length} 个飞行员`)
      io.emit('fsd:update', {
        pilots,
        boundaries,
        time: now
      })
    }).catch(() => {
      io.emit('fsd:update', {
        pilots: getPilotTrails(),
        boundaries: [],
        time: now
      })
    })
  } catch { /* ignore */ }
}
// 连接状态
let socket = null
let buffer = ''
let connected = false
let authenticated = false
let challenge = ''
let reconnectTimer = null
let pollTimer = null
let pingInterval = null
let lastPong = Date.now()
let lastLogTime = 0 // 避免重复日志刷屏
let consecutiveFails = 0

// ========== FSD9 协议常量 ==========
const CL_ADDATC = '#AA'
const CL_ADDPILOT = '#AP'
const CL_RMATC = '#DA'
const CL_RMPILOT = '#DP'
const CL_PILOTPOS = '@'
const CL_ATCPOS = '%'
const CL_PLAN = '$FP'
const CL_PING = '$PI'
const CL_PONG = '$PO'
const CL_ERROR = '$ER'
const CL_SECUREAUTH = '$SA'
const CL_CHALLENGE = '$CH'
const CL_CQ = '$CQ'
const CL_CR = '$CR'
const CL_MESSAGE = '#TM'

const CLIENT_PILOT = 1
const CLIENT_ATC = 2
const NEED_REVISION = 9

// ========== 公开 API ==========

export function getPilotTrails() {
  const result = []
  for (const [callsign, data] of pilotTrails) {
    if (data.current && data.current.lat && data.current.lon) {
      result.push({
        callsign,
        cid: data.cid,
        realname: data.realname,
        aircraft: data.plan?.aircraft || data.aircraft || '',
        dep: data.plan?.depairport || data.dep || '',
        dest: data.plan?.destairport || data.dest || '',
        route: data.plan?.route || data.route || '',
        altitude: data.current.altitude || 0,
        groundspeed: data.current.groundspeed || 0,
        transponder: data.current.transponder || 0,
        rating: data.rating || 0,
        lat: data.current.lat,
        lon: data.current.lon,
        trail: data.trail.slice(-MAX_TRAIL_POINTS),
        lastSeen: data.lastSeen,
        firstSeen: data.firstSeen,
      })
    }
  }
  return result
}

export function getAtcClients() {
  const result = []
  for (const [callsign, data] of atcClients) {
    result.push({
      callsign: data.callsign,
      cid: data.cid,
      realname: data.realname,
      rating: data.rating,
      facilityType: data.facilityType,
      frequency: data.frequency,
      visualRange: data.visualRange,
      lat: data.lat,
      lon: data.lon,
      altitude: data.altitude || 0,
      lastSeen: data.lastSeen,
    })
  }
  return result
}

export function getRawPilotTrails() {
  return pilotTrails
}

export function isFsd9Connected() {
  return connected && authenticated
}

// ========== FSD9 直连 ==========

export function startFsdTracker(io) {
  console.log('[FSDTraker] 启动 FSD9 直连追踪器...')
  // 保存 io 实例用于实时广播
  global.__fsd_io = io
  // HTTP API 轮询作为后备（每 15 秒）- 即使 FSD9 未连接也能获取数据
  startHttpPoll()
  // 尝试 FSD9 直连
  connectFsd9()
}

export function stopFsdTracker() {
  if (socket) { try { socket.destroy() } catch {} socket = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function connectFsd9() {
  if (socket) try { socket.destroy() } catch {} {}

  socket = connect({ host: FSD_HOST, port: FSD_PORT }, () => {
    console.log(`[FSDTraker] FSD9 已连接 ${FSD_HOST}:${FSD_PORT}`)
    connected = true
    consecutiveFails = 0
  })

  socket.on('data', (data) => {
    buffer += data.toString('utf-8')
    while (buffer.includes('\r\n')) {
      const idx = buffer.indexOf('\r\n')
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      if (line) processLine(line)
    }
  })

  socket.on('close', () => {
    connected = false
    authenticated = false
    scheduleReconnect()
  })

  socket.on('error', (err) => {
    const now = Date.now()
    if (now - lastLogTime > 30000) { // 每 30 秒最多打印一次
      const detail = err.code === 'ECONNREFUSED'
        ? `FSD 服务器 (${FSD_HOST}:${FSD_PORT}) 未启动`
        : err.message
      console.log(`[FSDTraker] ${detail}`)
      lastLogTime = now
    }
    scheduleReconnect()
  })

  socket.setTimeout(60000)
  socket.on('timeout', () => {
    if (Date.now() - lastLogTime > 30000) {
      console.log('[FSDTraker] FSD9 超时，重新连接')
      lastLogTime = Date.now()
    }
    socket.destroy()
    scheduleReconnect()
  })
}

function scheduleReconnect() {
  if (reconnectTimer) return
  consecutiveFails++
  const delay = Math.min(consecutiveFails * 5000, 60000) // 5s → 10s → 15s → ... → 60s max
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectFsd9()
  }, delay)
}

function send(raw) {
  if (socket && connected) {
    try { socket.write(raw + '\r\n') } catch {}
  }
}

// ========== 协议解析 ==========

function processLine(line) {
  // $CH 挑战
  if (line.startsWith(CL_CHALLENGE)) {
    challenge = line.slice(3)
    doAuth()
    return
  }

  // $ER 错误
  if (line.startsWith(CL_ERROR)) return

  // #AA / #AP 新客户端
  if (line.startsWith(CL_ADDATC)) return addClient(line.slice(3), CLIENT_ATC)
  if (line.startsWith(CL_ADDPILOT)) return addClient(line.slice(3), CLIENT_PILOT)

  // #DA / #DP 客户端下线
  if (line.startsWith(CL_RMATC)) {
    const cs = line.slice(3).split(':')[0]
    const key = cs.toUpperCase()
    pilotTrails.delete(key)
    atcClients.delete(key)
    broadcastFsdUpdate()
    return
  }
  if (line.startsWith(CL_RMPILOT)) {
    const cs = line.slice(3).split(':')[0]
    pilotTrails.delete(cs.toUpperCase())
    broadcastFsdUpdate()
    return
  }

  // @ 飞行员位置更新
  if (line.startsWith(CL_PILOTPOS)) return updatePilotPos(line.slice(1))

  // % 管制员位置更新
  if (line.startsWith(CL_ATCPOS)) return updateAtcPos(line.slice(1))

  // $FP 飞行计划
  if (line.startsWith(CL_PLAN)) return updateFlightPlan(line.slice(3))

  // $PO Pong
  if (line.startsWith(CL_PONG)) { lastPong = Date.now(); return }

  // $CR 认证响应（来自 FSD 服务器）——部分服务器发此确认
  if (line.startsWith(CL_CR)) {
    if (!authenticated) {
      authenticated = true
      console.log('[FSDTraker] FSD9 认证成功')
      startPing()
    }
    return
  }

  // #TM 欢迎/MOTD 消息——fsd-py 认证成功后发此（等效于认证确认）
  if (line.startsWith('#TM') && !authenticated) {
    authenticated = true
    console.log('[FSDTraker] FSD9 认证成功 (welcome)')
    startPing()
    return
  }
}

function doAuth() {
  // 每个 cluster 实例用唯一 callsign，避免与 bot(CW-BOT) 及实例间冲突
  const base = process.env.FSD_BOT_CALLSIGN || 'CW-MAP'
  const callsign = `${base}-${process.pid}`.slice(0, 12)
  // CID=0000 密码 ***（cert.txt 已验证）
  const cid = process.env.FSD_BOT_CID || '0000'
  const password = process.env.FSD_BOT_PASSWORD || ''

  // 优先挑战-响应
  if (challenge) {
    const pwdHash = crypto.createHash('sha256').update(password).digest()
    const hmac = crypto.createHmac('sha256', challenge).update(pwdHash).digest('hex')
    send(`${CL_SECUREAUTH}${callsign}:${CLIENT_PILOT}:${cid}:${hmac}:1:${NEED_REVISION}:${callsign}:0`)
  } else {
    send(`${CL_ADDPILOT}${callsign}:${CLIENT_PILOT}:${cid}:${password}:1:${NEED_REVISION}:0:${callsign}`)
  }
  // 兜底：认证后 3 秒即使未收到欢迎消息也标记成功并启动心跳
  // （fsd-py 认证成功发 #TM，但部分服务器不发任何确认）
  setTimeout(() => {
    if (!authenticated) {
      authenticated = true
      console.log('[FSDTraker] FSD9 认证成功 (fallback)')
      startPing()
    }
  }, 3000)
}

function startPing() {
  // 清除旧的 ping 定时器，避免多次重连后累积多个 interval
  if (pingInterval) clearInterval(pingInterval)
  // 已有 pong 检查 + ping（用实际 callsign，fsd-py 才回应 $PO）
  const base = process.env.FSD_BOT_CALLSIGN || 'CW-MAP'
  const callsign = `${base}-${process.pid}`.slice(0, 12)
  pingInterval = setInterval(() => {
    send(`${CL_PING}${callsign}:*`)
    if (Date.now() - lastPong > 30000) {
      console.warn('[FSDTraker] 心跳超时，重新连接')
      if (socket) socket.destroy()
      scheduleReconnect()
    }
  }, 15000)
}

function addClient(raw, type) {
  const parts = raw.split(':')
  let callsign, cid, realname, rating

  if (type === CLIENT_ATC) {
    // #AA 格式: callsign::realname:cid:protocol:rating:facilityType:visualRange
    callsign = parts[0]
    realname = parts[2] || ''
    cid = parts[3] || ''
    rating = parseInt(parts[5]) || 0
    const facilityType = parseInt(parts[6]) || 0
    const visualRange = parseInt(parts[7]) || 0

    const key = callsign?.toUpperCase()
    if (!key) return

    atcClients.set(key, {
      callsign,
      cid,
      realname,
      rating,
      facilityType,
      visualRange,
      frequency: 0,
      lat: null,
      lon: null,
      altitude: 0,
      lastSeen: Date.now(),
    })
    return
  }

  // 飞行员处理
  callsign = parts[0]
  cid = parts[2] || ''
  rating = parseInt(parts[4]) || 0
  realname = parts[7] || ''

  const key = callsign?.toUpperCase()
  if (!key) return

  if (!pilotTrails.has(key)) {
    pilotTrails.set(key, {
      callsign,
      cid,
      realname,
      rating,
      aircraft: '',
      dep: '',
      dest: '',
      route: '',
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      current: null,
      plan: null,
      trail: [],
    })
  }
}

function updatePilotPos(raw) {
  // @ 格式: identflag:callsign:transponder:rating:lat:lon:alt:gs:pbh:flags
  const parts = raw.split(':')
  if (parts.length < 7) return

  const callsign = parts[1]
  const key = callsign?.toUpperCase()
  if (!key) return

  let data = pilotTrails.get(key)
  if (!data) {
    // 如果 FSD 服务器没有先发 #AP 直接发 @，也创建记录
    data = {
      callsign, cid: '', realname: '', rating: 0,
      aircraft: '', dep: '', dest: '', route: '',
      firstSeen: Date.now(), lastSeen: Date.now(),
      current: null, plan: null, trail: [],
    }
    pilotTrails.set(key, data)
  }

  const lat = parseFloat(parts[4])
  const lon = parseFloat(parts[5])

  if (isNaN(lat) || isNaN(lon)) return
  if (lat === 0 && lon === 0) return

  const now = Date.now()

  // 记录轨迹点（去重：距离太近的跳过）
  const lastTrail = data.trail[data.trail.length - 1]
  if (!lastTrail || haversine(lastTrail.lat, lastTrail.lon, lat, lon) > 0.5) {
    data.trail.push({ lat, lon, time: now })
    // 限制轨迹数量
    if (data.trail.length > MAX_TRAIL_POINTS) {
      data.trail = data.trail.slice(-MAX_TRAIL_POINTS)
    }
  }

  data.current = {
    lat,
    lon,
    altitude: parseInt(parts[6]) || 0,
    groundspeed: parseInt(parts[7]) || 0,
    transponder: parseInt(parts[2]) || 0,
  }
  data.lastSeen = now
  broadcastFsdUpdate()
}

function updateAtcPos(raw) {
  // % 格式(服务器广播): callsign:frequency:facilityType:visualRange:rating:lat:lon:altitude
  const parts = raw.split(':')
  if (parts.length < 8) return

  const callsign = parts[0]
  const key = callsign?.toUpperCase()
  if (!key) return

  let data = atcClients.get(key)
  if (!data) {
    // 如果 FSD 服务器没有先发 #AA 直接发 %，也创建记录
    data = {
      callsign, cid: '', realname: '', rating: 0,
      facilityType: 0, frequency: 0, visualRange: 0,
      lat: null, lon: null, altitude: 0,
      lastSeen: Date.now(),
    }
    atcClients.set(key, data)
  }

  data.frequency = parseInt(parts[1]) || 0
  data.facilityType = parseInt(parts[2]) || 0
  data.visualRange = parseInt(parts[3]) || 0
  data.rating = parseInt(parts[4]) || 0

  const lat = parseFloat(parts[5])
  const lon = parseFloat(parts[6])
  if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
    data.lat = lat
    data.lon = lon
  }

  data.altitude = parseInt(parts[7]) || 0
  data.lastSeen = Date.now()
  broadcastFsdUpdate()
}

function updateFlightPlan(raw) {
  // $FP 格式取决于具体 FSD 版本，尝试多种解析
  const parts = raw.split(':')
  if (parts.length < 4) return

  const callsign = parts[0]
  const key = callsign?.toUpperCase()
  const data = pilotTrails.get(key)
  if (!data) return

  data.plan = {
    type: parts[1]?.[0] || 'I',
    aircraft: parts[2] || '',
    tascruise: parseInt(parts[3]) || 0,
    depairport: parts[4] || '',
    destairport: parts[8] || '',
    route: parts[15] || '',
  }
}

// ========== HTTP API 后备轮询 ==========

function startHttpPoll() {
  pollFsdApi()
  pollTimer = setInterval(pollFsdApi, 15000)
}

async function pollFsdApi() {
  try {
    // 从 whazzup 缓存获取数据（包含 FSD 服务器上所有在线用户）
    const { getCachedWhazzup } = await import('../services/whazzup.js')
    const data = getCachedWhazzup()
    if (!data) {
      console.log('[FSD-Poll] whazzup 缓存为空，跳过')
      return
    }

    console.log(`[FSD-Poll] whazzup 数据: ${data.controllers?.length || 0} 管制员, ${data.pilots?.length || 0} 飞行员`)

    const pilots = data.pilots || data.clients || []
    for (const p of pilots) {
      const lat = parseFloat(p.lat || p.Lat || 0)
      const lon = parseFloat(p.lon || p.Lon || 0)
      if (!lat && !lon) continue

      const key = (p.callsign || '').toUpperCase()
      if (!key) continue

      let d = pilotTrails.get(key)
      if (!d) {
        d = {
          callsign: p.callsign, cid: p.cid || '', realname: p.realname || '',
          rating: p.rating || 0, aircraft: p.aircraft || '',
          dep: p.dep || '', dest: p.dest || '', route: p.route || '',
          firstSeen: Date.now(), lastSeen: Date.now(),
          current: null, plan: null, trail: [],
        }
        pilotTrails.set(key, d)
      }

      const now = Date.now()
      const lastTrail = d.trail[d.trail.length - 1]
      if (!lastTrail || haversine(lastTrail.lat, lastTrail.lon, lat, lon) > 0.5) {
        d.trail.push({ lat, lon, time: now })
        if (d.trail.length > MAX_TRAIL_POINTS)
          d.trail = d.trail.slice(-MAX_TRAIL_POINTS)
      }

      d.current = { lat, lon, altitude: p.altitude || 0, groundspeed: p.groundspeed || 0, transponder: p.transponder || 0 }
      d.lastSeen = now
    }

    // ===== 同步管制员 =====
    const controllers = data.controllers || data.atc || []
    console.log(`[FSD-Poll] 开始同步 ${controllers.length} 个管制员`)
    for (const c of controllers) {
      const key = (c.callsign || '').toUpperCase()
      if (!key) continue

      let d = atcClients.get(key)
      if (!d) {
        console.log(`[FSD-Poll] 添加新管制员: ${key}`)
        d = {
          callsign: c.callsign, cid: c.cid || '', realname: c.realname || '',
          rating: c.rating || 0, facilityType: c.facilitytype || c.facilityType || 0,
          frequency: c.frequency || 0, visualRange: c.visualrange || c.visualRange || 40,
          lat: null, lon: null, altitude: 0, lastSeen: Date.now(),
        }
        atcClients.set(key, d)
      }

      const lat = parseFloat(c.lat || c.Lat || c.latitude || 0)
      const lon = parseFloat(c.lon || c.Lon || c.longitude || 0)
      if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
        d.lat = lat
        d.lon = lon
      }
      d.frequency = c.frequency || c.Frequency || d.frequency
      d.facilityType = c.facilitytype || c.facilityType || d.facilityType
      d.visualRange = c.visualrange || c.visualRange || d.visualRange
      d.rating = c.rating || c.Rating || d.rating
      d.lastSeen = Date.now()
    }

    console.log(`[FSD-Poll] atcClients 现在有 ${atcClients.size} 个管制员`)

    // 清理超过 10 分钟无更新的飞行员和管制员
    const cutoff = Date.now() - 600000
    for (const [key, d] of pilotTrails) {
      if (d.lastSeen < cutoff) pilotTrails.delete(key)
    }
    for (const [key, d] of atcClients) {
      if (d.lastSeen < cutoff) atcClients.delete(key)
    }

    // 触发广播，让前端拿到实时数据
    broadcastFsdUpdate()
  } catch {}
}

// ========== 工具 ==========

/** Haversine 距离计算（单位：千米） */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
