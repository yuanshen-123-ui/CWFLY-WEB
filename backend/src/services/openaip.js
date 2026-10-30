/**
 * OpenAIP 航空数据服务
 *
 * API 文档: https://docs.openaip.net/
 * 注册获取 API Key: https://www.openaip.net/ → 用户中心 → API Clients
 *
 * 使用方式：
 *   1. 在 openaip.net 注册账号
 *   2. 申请 API Key
 *   3. 设置环境变量 OPENAPI_KEY=你的API_KEY
 *
 * 数据使用需署名:
 *   © OpenAIP (https://www.openaip.net)
 *   Licensed under CC BY-NC 4.0
 *   https://creativecommons.org/licenses/by-nc/4.0/
 */

const API_BASE = 'https://api.core.openaip.net/api'
const API_KEY = process.env.OPENAPI_KEY || ''

/**
 * 获取 API 请求头
 */
function getHeaders() {
  return API_KEY ? { 'x-openaip-api-key': API_KEY } : {}
}

/**
 * 通过 ICAO 代码查询机场信息
 * OpenAIP 使用 search 参数搜索机场（支持 ICAO 搜索）
 * @param {string} icao - ICAO 代码（如 ZBAA）
 * @returns {object|null} 机场信息（含频率、跑道等）
 */
export async function fetchAirportByICAO(icao) {
  if (!API_KEY) return null

  try {
    // 先搜索机场列表找到文档 ID
    const searchUrl = `${API_BASE}/airports?search=${icao.toUpperCase()}&fields=_id,name,icaoCode,iataCode,type,country,position,timezone,elevation`
    const searchRes = await fetch(searchUrl, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(4000),
    })
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()

    // 查找匹配 ICAO 的机场
    const airports = searchData?.data || searchData?.items || []
    const match = airports.find(a =>
      (a.icaoCode || '').toUpperCase() === icao.toUpperCase()
    )
    if (!match?._id) return null

    // 用文档 ID 获取完整机场详情（含频率、跑道）
    const detailUrl = `${API_BASE}/airports/${match._id}`
    const detailRes = await fetch(detailUrl, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(4000),
    })
    if (!detailRes.ok) return null
    return await detailRes.json()
  } catch {
    return null
  }
}

/** 频率类型数字→名称映射 */
const FREQ_TYPE_NAMES = {
  0: 'Approach', 1: 'APRON', 2: 'Arrival', 3: 'Center', 4: 'CTAF',
  5: 'Delivery', 6: 'Departure', 7: 'FIS', 8: 'Gliding', 9: 'Ground',
  10: 'Information', 11: 'Multicom', 12: 'Unicom', 13: 'Radar', 14: 'Tower',
  15: 'ATIS', 16: 'Radio', 17: 'Other', 18: 'AIRMET', 19: 'AWOS',
  20: 'Lights', 21: 'VOLMET', 22: 'AFIS', 23: 'ASOS', 24: 'AWIS',
  25: 'Emergency', 26: 'Clearance Delivery', 27: 'Remote Com Outlet',
  28: 'Ground Com Outlet', 29: 'Flight Service Station', 30: 'Class C',
  31: 'Class B', 32: 'VFR Advisory', 33: 'TRSA',
}

/** 道面组成数字→名称映射 */
const SURFACE_NAMES = {
  0: 'Asphalt', 1: 'Concrete', 2: 'Grass', 3: 'Sand', 4: 'Water',
  5: 'Bituminous', 6: 'Brick', 7: 'Macadam', 8: 'Stone', 9: 'Coral',
  10: 'Clay', 11: 'Laterite', 12: 'Gravel', 13: 'Earth', 14: 'Ice',
  15: 'Snow', 16: 'Laminate', 17: 'Metal', 18: 'Landing Mat',
  19: 'PSP', 20: 'Wood', 21: 'Non Bituminous', 22: 'Unknown',
}

/**
 * 将 OpenAIP 机场数据转换为系统统一格式
 */
export function normalizeAirportData(openaipData) {
  if (!openaipData) return null

  const d = openaipData?.data || openaipData
  // OpenAIP 坐标在 geometry.coordinates 中 [lng, lat]
  const coords = d.geometry?.coordinates || []
  const elevObj = d.elevation || {}

  // 解析频率
  const frequencies = (d.frequencies || []).map(f => ({
    name: f.name || FREQ_TYPE_NAMES[f.type] || '',
    type: FREQ_TYPE_NAMES[f.type] || `Type-${f.type}`,
    frequency: f.value || '',
    primary: !!f.primary,
  }))

  // 解析跑道
  const runways = (d.runways || []).map(r => {
    const surf = r.surface || {}
    const compMain = surf.mainComposite ?? surf.composition?.[0]
    const dim = r.dimension || {}
    const len = dim.length?.value || 0
    const wid = dim.width?.value || 0
    return {
      ident: r.designator || '',
      length: len,
      width: wid,
      surface: SURFACE_NAMES[compMain] || '',
      heading: r.trueHeading ?? null,
    }
  })

  // 判断军用机场（type=5 为 Military Aerodrome）
  const isMilitary = d.type === 5

  return {
    icao: (d.icaoCode || '').toUpperCase(),
    name: d.name || '',
    iata: d.iataCode || '',
    city: '',
    country: d.country || '',
    lat: coords[1] || 0,
    lon: coords[0] || 0,
    elevation: elevObj.value || 0,
    timezone: '',
    magnetic: d.magneticDeclination ?? 0,
    isMilitary,
    frequencies,
    runways,
  }
}

/**
 * 将 OpenAIP 数据保存到本地数据库
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} data - normalizeAirportData 的输出
 */
export async function saveAirportToDB(prisma, data) {
  if (!data?.icao) return

  try {
    await prisma.airport.upsert({
      where: { icao: data.icao },
      update: {
        name: data.name,
        iata: data.iata,
        city: data.city,
        country: data.country,
        lat: data.lat,
        lon: data.lon,
        elevation: data.elevation,
        timezone: data.timezone,
        magnetic: data.magnetic,
        isMilitary: data.isMilitary,
        frequencies: JSON.stringify(data.frequencies),
        runways: JSON.stringify(data.runways),
      },
      create: {
        icao: data.icao,
        name: data.name,
        iata: data.iata,
        city: data.city,
        country: data.country,
        lat: data.lat,
        lon: data.lon,
        elevation: data.elevation,
        timezone: data.timezone,
        magnetic: data.magnetic,
        isMilitary: data.isMilitary,
        frequencies: JSON.stringify(data.frequencies),
        runways: JSON.stringify(data.runways),
      },
    })
    console.log(`[OpenAIP] 已保存机场数据: ${data.icao} (${data.frequencies.length} 频率, ${data.runways.length} 跑道)`)
  } catch (e) {
    console.warn(`[OpenAIP] 保存机场失败 ${data.icao}: ${e.message}`)
  }
}
