/**
 * Whazzup JSON 生成器
 *
 * 定期从 FSD 服务器拉取在线状态，生成 whazzup.json，
 * 输出到 uploads/ 目录供前端直接获取。
 *
 * 访问地址：http://localhost:3000/whazzup.json
 * 或通过反向代理：https://fsddata.skylitefly.com/whazzup.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WHAZZUP_FILE = path.resolve(__dirname, '../../uploads/whazzup.json')
const UPDATE_INTERVAL = 30_000  // 30 秒

// FSD 服务器地址（也支持 whazzup.txt 或 FSD HTTP API）
const FSD_HOST = process.env.FSD_HOST || '127.0.0.1'
const FSD_PORT = Number(process.env.FSD_PORT || 6809)
const FSD_WHAZZUP_FILE = process.env.FSD_WHAZZUP_FILE || '/opt/cwfly/fsd-py/whazzup.txt'

let updateTimer = null
let cachedData = null

/**
 * 从 FSD Python 服务器生成的 whazzup.txt 读取数据
 */
function parseWhazzupClientLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(';')) return null

  const parts = trimmed.split(':')
  if (parts.length < 4) return null

  const callsign = parts[0] || ''
  const cid = parts[1] || ''
  const realname = parts[2] || ''
  const type = parts[3] === 'ATC' ? 'ATC' : 'PILOT'

  const frequency = Number(parts[4])
  const lat = Number(parts[5])
  const lon = Number(parts[6])
  const altitude = Number(parts[7])
  const groundspeed = Number(parts[8])

  const aircraft = parts[9] || ''
  const tascruise = Number(parts[10]) || 0
  const depairport = parts[11] || ''
  const planAltitude = parts[12] || ''
  const destairport = parts[13] || ''
  const rating = Number(parts[16]) || 0
  const transponder = Number(parts[17]) || 0
  const facilitytype = Number(parts[18]) || 0
  const visualrange = Number(parts[19]) || 0
  const hrsenroute = Number(parts[24]) || 0
  const minenroute = Number(parts[25]) || 0
  const hrsfuel = Number(parts[26]) || 0
  const minfuel = Number(parts[27]) || 0
  const altairport = parts[28] || ''
  const remarks = parts[29] || ''
  const route = parts[30] || ''

  return {
    callsign,
    cid,
    realname,
    type,
    rating,
    frequency: Number.isFinite(frequency) ? Math.round(frequency * 1000) : 0,
    lat: Number.isFinite(lat) ? lat : 0,
    lon: Number.isFinite(lon) ? lon : 0,
    altitude: Number.isFinite(altitude) ? altitude : 0,
    groundspeed: Number.isFinite(groundspeed) ? groundspeed : 0,
    transponder,
    facilitytype,
    visualrange,
    plan: {
      aircraft,
      tascruise,
      depairport,
      altitude: planAltitude,
      destairport,
      hrsenroute,
      minenroute,
      hrsfuel,
      minfuel,
      altairport,
      remarks,
      route,
    },
    starttime: Math.floor(Date.now() / 1000),
  }
}

async function fetchWhazzupData() {
  try {
    const text = fs.readFileSync(FSD_WHAZZUP_FILE, 'utf-8')
    const lines = text.split('\n')
    let connectedClients = 0
    const clients = []
    let inClients = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '!CLIENTS') { inClients = true; continue }
      if (trimmed.startsWith('!') && trimmed !== '!CLIENTS') { inClients = false; continue }
      if (trimmed.startsWith('CONNECTED CLIENTS =')) {
        connectedClients = parseInt(trimmed.split('=')[1]) || 0
      }
      if (inClients) {
        const client = parseWhazzupClientLine(trimmed)
        if (client) clients.push(client)
      }
    }

    return {
      clients,
      pilots: clients.filter(c => c.type === 'PILOT'),
      controllers: clients.filter(c => c.type === 'ATC'),
      timestamp: Date.now(),
      source: 'whazzup_txt',
      connectedClients,
    }
  } catch (err) {
    throw new Error('读取 FSD whazzup 文件失败: ' + err.message)
  }
}

/**
 * 尝试通过 TCP FSD9 协议获取
 * （后备方案，当前仅做 API 降级）
 */
async function fetchViaFsd9() {
  return fetchWhazzupData()
}

/**
 * 统一标准化客户端字段
 */
function normalizeClient(c) {
  return {
    callsign: c.callsign || c.Callsign || '',
    cid: c.cid || c.Cid || c.CID || '',
    realname: c.realname || c.Realname || '',
    type: c.type || c.Type || (c.facilitytype !== undefined ? 'ATC' : 'PILOT'),
    rating: c.rating ?? c.Rating ?? 0,
    frequency: c.frequency ?? c.Frequency ?? 0,
    facilitytype: c.facilitytype ?? c.FacilityType ?? 0,
    visualrange: c.visualrange ?? c.VisualRange ?? 40,
    latitude: c.lat ?? c.Lat ?? c.latitude ?? 0,
    longitude: c.lon ?? c.Lon ?? c.longitude ?? 0,
    altitude: c.altitude ?? c.Altitude ?? 0,
    groundspeed: c.groundspeed ?? c.Groundspeed ?? 0,
    transponder: c.transponder ?? c.Transponder ?? 0,
    aircraft: (c.plan?.aircraft || c.Plan?.Aircraft || c.aircraft || ''),
    dep: (c.plan?.depairport || c.Plan?.DepAirport || c.dep || ''),
    dest: (c.plan?.destairport || c.Plan?.DestAirport || c.dest || ''),
    route: (c.plan?.route || c.Plan?.Route || c.route || ''),
    starttime: c.starttime ?? c.Starttime ?? Math.floor(Date.now() / 1000),
  }
}

/**
 * 生成 whazzup.json 并写入文件
 */
async function generate() {
  try {
    const data = await fetchWhazzupData()
    cachedData = data

    const json = JSON.stringify({
      general: {
        version: 'CWFLY Whazzup',
        reload: UPDATE_INTERVAL / 1000,
        update: new Date().toISOString(),
        connectedClients: data.clients.length,
        connectedPilots: data.pilots.length,
        connectedControllers: data.controllers.length,
        timestamp: data.timestamp,
      },
      clients: data.clients,
      pilots: data.pilots,
      controllers: data.controllers,
    }, null, 2)

    // 写入临时文件然后原子替换
    const tmpFile = WHAZZUP_FILE + '.tmp'
    fs.writeFileSync(tmpFile, json, 'utf-8')
    fs.renameSync(tmpFile, WHAZZUP_FILE)

    return true
  } catch (err) {
    const now = Date.now()
    if (!global.__whazzupLastErr || now - global.__whazzupLastErr > 60000) {
      const detail = err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch failed')
        ? 'FSD 服务器未启动，等待连接...'
        : err.message
      console.log('[Whazzup]', detail)
      global.__whazzupLastErr = now
    }
    return false
  }
}

/**
 * 启动定时更新
 */
export function startWhazzupUpdater() {
  if (updateTimer) return
  console.log(`[Whazzup] 启动更新器，输出到 ${WHAZZUP_FILE}`)
  // 立即执行一次
  generate()
  // 定时更新
  updateTimer = setInterval(generate, UPDATE_INTERVAL)
}

/**
 * 停止定时更新
 */
export function stopWhazzupUpdater() {
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
}

/**
 * 获取缓存数据
 */
export function getCachedWhazzup() {
  if (cachedData) {
    return {
      general: {
        version: 'CWFLY Whazzup',
        reload: UPDATE_INTERVAL / 1000,
        update: new Date().toISOString(),
        connectedClients: cachedData.clients.length,
        connectedPilots: cachedData.pilots.length,
        connectedControllers: cachedData.controllers.length,
        timestamp: cachedData.timestamp,
      },
      clients: cachedData.clients,
      pilots: cachedData.pilots,
      controllers: cachedData.controllers,
    }
  }
  return null
}

/**
 * 获取 whazzup.json 文件路径
 */
export function getWhazzupFilePath() {
  return WHAZZUP_FILE
}
