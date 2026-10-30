import { Router } from 'express'
import prisma from '../utils/prisma.js'

const router = Router()

// --- Navigraph 配置（可配 refreshToken，当前网络可能不可达时会快速回退） ---
const NAVIGRAPH_TOKEN_URL = 'https://identity.api.navigraph.com/connect/token'
const NAVIGRAPH_CHARTS_API = 'https://api.navigraph.com/v2/charts'
// 安全(2026-08-07): 不内置默认 refresh token(避免源码泄露凭据), 生产必须经环境变量提供
const NAVIGRAPH_REFRESH_TOKEN = process.env.NAVIGRAPH_REFRESH_TOKEN || ''
const NAVIGRAPH_CLIENT_ID = 'navigraph.web'

// --- 原始 API 配置 ---
const CFY_API = 'https://www.ccflysim.cn:8443/api'

// --- 内存缓存 access token ---
let cachedToken = null
let tokenExpiry = 0

/**
 * 获取 Navigraph access token（带缓存，超时短，失败则快速回退）
 */
async function getNavigraphToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: NAVIGRAPH_REFRESH_TOKEN,
    client_id: NAVIGRAPH_CLIENT_ID,
  })

  const res = await fetch(NAVIGRAPH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Navigraph 认证失败 (${res.status}): ${errText}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000
  return cachedToken
}

/**
 * 通过 Navigraph API 查询航图（超时短，快速回退）
 */
async function queryNavigraphCharts(icao, rules = 'IFR') {
  const token = await getNavigraphToken()
  const url = `${NAVIGRAPH_CHARTS_API}/${icao.toUpperCase()}?version=STD&rules=${rules}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Navigraph API 错误 (${res.status})`)
  const data = await res.json()
  return { charts: data.charts || [] }
}

/**
 * 通过原始 ccflysim API 查询航图
 */
async function queryLegacyCharts(icao, provider = 'jeppesen', rules = 'IFR') {
  const url = `${CFY_API}/charts?icao=${icao.toUpperCase()}&provider=${provider}&rules=${rules}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`原始 API 错误 (${res.status})`)
  return await res.json()
}

// 航图查询
router.get('/', async (req, res) => {
  try {
    const { icao, provider = 'jeppesen', rules = 'IFR' } = req.query
    if (!icao) return res.status(400).json({ success: false, message: '缺少 ICAO 代码' })

    let data
    let fromNavigraph = false

    if (provider === 'jeppesen') {
      // 并行发起 Navigraph 和原始 API 请求，谁先成功用谁
      try {
        data = await Promise.race([
          queryNavigraphCharts(icao, rules).then(d => { fromNavigraph = true; return d }),
          queryLegacyCharts(icao, provider, rules),
        ])
        if (fromNavigraph) console.log(`[Charts] Navigraph 查询成功: ${icao}`)
      } catch {
        // 两个都失败，最后再单独试一次原始 API
        data = await queryLegacyCharts(icao, provider, rules)
      }
    } else {
      data = await queryLegacyCharts(icao, provider, rules)
    }

    // 将外部图片 URL 替换为本地代理路径，解决 CORS/防盗链问题
    const rewriteUrl = (url) => {
      if (!url || typeof url !== 'string') return url
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return `/api/charts/proxy?url=${encodeURIComponent(url)}`
      }
      return url
    }

    const charts = data?.data?.charts || data?.charts || []
    for (const chart of charts) {
      if (chart.image_day_url) chart.image_day_url = rewriteUrl(chart.image_day_url)
      if (chart.image_night_url) chart.image_night_url = rewriteUrl(chart.image_night_url)
      if (chart.thumb_day_url) chart.thumb_day_url = rewriteUrl(chart.thumb_day_url)
      if (chart.thumb_night_url) chart.thumb_night_url = rewriteUrl(chart.thumb_night_url)
      if (chart.url) chart.url = rewriteUrl(chart.url)
    }

    res.json({ success: true, data, fromNavigraph })
  } catch (e) {
    console.error('[charts.js]', e?.message, e?.cause?.code || e?.cause?.message || ''); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// ---- 代理白名单（SSRF 防护, 2026-08-07 加固; 2026-08-08 增补 AIP 航图 CDN） ----
// 仅允许代理到可信航图 CDN 域名; 禁止内网/环回/链路本地地址
// skylitefly.com: AIP(中国民航) 航图图片 CDN(charts-cdn.skylitefly.com)
const PROXY_ALLOWED_HOSTS = ['navigraph.com', 'ccflysim.cn', 'skylitefly.com']
function isInternalIp(host) {
  if (!host) return true
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || host === 'localhost' || host === '::1' || host === '0.0.0.0'
}
function isProxyAllowed(url) {
  let u
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (isInternalIp(host)) return false
  return PROXY_ALLOWED_HOSTS.some(d => host === d || host.endsWith('.' + d))
}

// 航图图片代理（解决 CORS/防盗链 + Navigraph CDN 认证）
// 安全(2026-08-08): 目标域名白名单 + SSRF 防护已足够, 去掉 authenticate——
// <img> 标签加载图片时不带 Authorization 头, 若要求登录会导致图片 401 加载失败;
// Navigraph Bearer token 仅在服务器内存、只附加到 navigraph.com 请求, 不泄露给客户端
router.get('/proxy', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).end()
  if (!isProxyAllowed(url)) {
    return res.status(403).json({ success: false, message: '目标地址不在代理白名单' })
  }

  try {
    // 仅当目标是 Navigraph CDN 时才附加 Bearer token, 其余目标不带任何凭据
    const isNavigraph = url.includes('navigraph.com')
    const authHeader = (cachedToken && isNavigraph) ? { 'Authorization': `Bearer ${cachedToken}` } : {}

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CWFLY/1.0)',
        'Referer': 'https://www.cwflysim.cn/',
        'Accept': 'image/webp,image/*,*/*',
        ...authHeader
      }
    })
    if (!response.ok) return res.status(response.status).end()

    const contentType = response.headers.get('content-type') || 'image/png'
    const buffer = Buffer.from(await response.arrayBuffer())

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(buffer)
  } catch {
    res.status(504).end()
  }
})

/**
 * 计算大圆距离（Haversine 公式）
 * @returns {number} 距离（海里）
 */
function greatCircleDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065 // 地球半径（海里）
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/** 常用机场坐标后备字典（覆盖国内主要机场） */
const AIRPORT_COORDS = {
  ZSSS: { lat: 31.1979, lon: 121.3363 }, ZSPD: { lat: 31.1434, lon: 121.8053 },
  ZBAA: { lat: 40.0799, lon: 116.6031 }, ZBAD: { lat: 39.5098, lon: 116.4105 },
  ZGGG: { lat: 23.3925, lon: 113.2988 }, ZGSZ: { lat: 22.6394, lon: 113.8142 },
  ZGHA: { lat: 28.1892, lon: 113.2200 }, ZGNN: { lat: 22.6083, lon: 108.1725 },
  ZUCK: { lat: 29.7192, lon: 106.6417 }, ZUUU: { lat: 30.5786, lon: 103.9469 },
  ZPPP: { lat: 25.1019, lon: 102.9292 }, ZPLJ: { lat: 26.6792, lon: 100.2461 },
  ZSHC: { lat: 30.2295, lon: 120.4344 }, ZSNB: { lat: 29.8267, lon: 121.4619 },
  ZSNJ: { lat: 31.7420, lon: 118.8620 }, ZSOF: { lat: 31.9889, lon: 116.9789 },
  ZSAM: { lat: 24.5439, lon: 118.1275 }, ZSFZ: { lat: 25.9333, lon: 119.6667 },
  ZGSD: { lat: 22.0069, lon: 113.3747 }, ZGHK: { lat: 19.7933, lon: 110.4525 },
  ZJHK: { lat: 19.9349, lon: 110.4590 }, ZJSY: { lat: 18.3029, lon: 109.4122 },
  ZWWW: { lat: 43.9072, lon: 87.4742 }, ZWSH: { lat: 39.5433, lon: 76.0200 },
  ZLXY: { lat: 34.4471, lon: 108.7516 }, ZLLL: { lat: 36.5152, lon: 103.6200 },
  ZYHB: { lat: 45.6234, lon: 126.2503 }, ZYCC: { lat: 43.9959, lon: 125.6850 },
  ZYTL: { lat: 38.9657, lon: 121.5386 }, ZYTX: { lat: 41.6401, lon: 123.4834 },
  ZBTJ: { lat: 39.1244, lon: 117.3462 }, ZBNY: { lat: 40.0732, lon: 116.6416 },
  ZBHH: { lat: 40.8500, lon: 111.8233 }, ZBDT: { lat: 40.0603, lon: 113.4823 },
  ZHHH: { lat: 30.7838, lon: 114.2081 },
  ZUGY: { lat: 26.5383, lon: 106.8014 }, ZUKJ: { lat: 26.3222, lon: 109.4450 },
  ZPKM: { lat: 25.2167, lon: 102.7417 }, ZPDQ: { lat: 27.7936, lon: 99.6772 },
  ZWYN: { lat: 39.2333, lon: 75.2333 }, ZWAK: { lat: 41.2633, lon: 80.2572 },
  ZSQD: { lat: 36.2661, lon: 120.3744 }, ZSJN: { lat: 36.8572, lon: 117.2161 },
  RCTP: { lat: 25.0764, lon: 121.2239 }, RCSS: { lat: 25.0697, lon: 121.5525 },
  VHHH: { lat: 22.3080, lon: 113.9185 }, VMMC: { lat: 22.1495, lon: 113.5914 },
  RJTT: { lat: 35.5494, lon: 139.7798 }, RJBB: { lat: 34.4320, lon: 135.2304 },
  RKSI: { lat: 37.4602, lon: 126.4407 }, RKSS: { lat: 37.5583, lon: 126.7906 },
}

/** 获取机场坐标（优先数据库，其次后备字典） */
async function getAirportCoords(icao) {
  try {
    const ap = await prisma.airport.findUnique({ where: { icao } })
    if (ap?.lat && ap?.lon) return { lat: ap.lat, lon: ap.lon }
  } catch {}
  return AIRPORT_COORDS[icao] || null
}

/** 解析 SimBrief 格式的 route 字符串为字段对象 */
function parseSimbriefRoute(routeStr) {
  if (!routeStr || (!routeStr.includes('[SBFlightPlan]') && !routeStr.includes('Departure='))) return null
  const fields = {}
  routeStr.split(/[\r\n]+/).forEach(line => {
    const idx = line.indexOf('=')
    if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  })
  return fields
}

// 航路查询
router.get('/route', async (req, res) => {
  try {
    const { dep, arr, xt } = req.query
    if (!dep || !arr) return res.status(400).json({ success: false, message: '缺少起降机场' })

    const depICAO = dep.toUpperCase()
    const arrICAO = arr.toUpperCase()

    // 尝试多个可能的API路径
    const paths = ['ruote', 'route', 'flight/route', 'airway']
    let data = null
    for (const p of paths) {
      try {
        const url = `${CFY_API}/${p}?dep=${depICAO}&arr=${arrICAO}${xt ? '&xt=' + xt : ''}`
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
        const d = await resp.json()
        if (d.success !== false || d.data) { data = d; break }
      } catch {}
    }

    // 查询机场坐标计算距离和飞行时间
    let distance = null
    let flightTime = null
    try {
      const [depPos, arrPos] = await Promise.all([
        getAirportCoords(depICAO),
        getAirportCoords(arrICAO),
      ])
      if (depPos && arrPos) {
        const nm = greatCircleDistance(depPos.lat, depPos.lon, arrPos.lat, arrPos.lon)
        distance = nm
        // 预计飞行时间：平均地速 420kt（考虑起降阶段）
        const hours = nm / 420
        const mins = Math.round(hours * 60)
        flightTime = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60}m` : `${mins}m`
      }
    } catch { /* 坐标查询失败不影响主流程 */ }

    // 从 SimBrief 格式中提取备降场等信息
    let alternate = null
    if (data?.route) {
      const fields = parseSimbriefRoute(data.route)
      if (fields?.Alternate) alternate = fields.Alternate
    }

    res.json({
      success: true,
      data: {
        ...(data || {}),
        dep: depICAO,
        arr: arrICAO,
        distance: distance || data?.distance || '',
        flight_time: flightTime || data?.flight_time || data?.ete || '',
        alternate: alternate || data?.alternate || '',
      }
    })
  } catch (e) {
    console.error('[charts.js]', e?.message, e?.cause?.code || e?.cause?.message || ''); res.status(500).json({ success: false, message: '操作失败' })
  }
})

export default router
