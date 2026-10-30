import { Router } from 'express'
import { getStation } from '../services/airportStations.js'

const router = Router()
const AWC = 'https://aviationweather.gov/api/data'

// 单源超时（原实现 CFY/checkwx 各 4s 且必然超时/失败 → 每次查询白等 4~8 秒）
const SRC_TIMEOUT = 5000
// 缓存：命中 60 秒；未命中（该机场确实无 METAR）5 分钟，避免反复外呼
const TTL_HIT = 60 * 1000
const TTL_MISS = 5 * 60 * 1000

function parseMetar(str) {
  if (!str) return {}
  let wind = '', vis = '', visUnit = 'm', temp = '', dew = '', qnh = '', qnhUnit = 'hPa', time = ''
  const t = str.match(/\b(\d{6}Z)\b/); if (t) time = t[1]

  // 风向风速: xxxTT(G?xx)(MPS|KT)
  const w = str.match(/\b(\d{3}\d{2,3}G?\d{0,2}(?:MPS|KT))\b/)
  if (w) { const d = w[1]; wind = d.slice(0,3) + '° ' + d.slice(3).replace(/MPS|KT/,'') + (d.includes('KT')?'kt':'m/s') }

  // 能见度: CAVOK → ≥10km
  if (str.includes('CAVOK')) {
    vis = '≥10'
    visUnit = 'km'
  } else {
    // 尝试匹配 SM（英制英里）: 如 10SM, 6SM, 1/2SM, 1 1/2SM
    const sm = str.match(/\b(\d+(?:\s+\d+)?\s*\d?\/?\d*)SM\b/)
    if (sm) {
      vis = sm[1].trim()
      visUnit = 'SM'
    } else {
      // 标准 4 位米制能见度: 如 9999, 5000, 0350
      const v = str.match(/\b(\d{4})\b(?!\s*\/)/)
      if (v) {
        const val = v[1]
        // 排除误匹配到气压 A2992 等
        if (val !== 'CAVOK' && !str.includes('A' + val)) {
          if (val === '9999') {
            vis = '≥10'
            visUnit = 'km'
          } else {
            vis = val
            visUnit = 'm'
          }
        }
      }
    }
  }

  // 温度/露点
  const td = str.match(/\b(M?\d{2})\/(M?\d{2})\b/)
  if (td) { temp = td[1].replace('M','-'); dew = td[2].replace('M','-') }

  // 气压: QHHHH (hPa) 或 AHHHH (inHg)
  const q = str.match(/\b(Q(\d{4}))\b/)
  if (q) { qnh = q[2]; qnhUnit = 'hPa' }
  else {
    const a = str.match(/\bA(\d{4})\b/)
    if (a) { qnh = a[1]; qnhUnit = 'inHg' }
  }

  return { wind, vis, visUnit, temp, dew, qnh, qnhUnit, time }
}

/**
 * 解析 TAF 报文为易读格式
 */
function parseTaf(str) {
  if (!str) return null
  const lines = str.split('\n').map(s => s.trim()).filter(Boolean)
  const result = { raw: str, lines: [], summary: '' }
  const forecasts = []

  for (const line of lines) {
    // 跳过 TAF 开头行（如 TAF ZSSS 280300Z 2804/2906）
    const header = line.match(/^TAF\s+\w+\s+\d{6}Z\s+\d{4}\/\d{4}/)
    if (header) {
      result.header = header[0]
      continue
    }

    let fc = { type: 'base', raw: line, wind: '', vis: '', weather: '', cloud: '', prob: '' }

    // 概率 PROB30/PROB40
    const prob = line.match(/\b(PROB[34]0)\b/)
    if (prob) fc.prob = prob[1]

    // 预报类型 TEMPO / BECMG / FMHHHH
    const tempo = line.match(/\b(TEMPO)\s+(\d{4}\/\d{4})\b/)
    const becmg = line.match(/\b(BECMG)\s+(\d{4}\/\d{4})\b/)
    const fm = line.match(/\b(FM(\d{6}))\b/)
    if (tempo) { fc.type = 'TEMPO'; fc.period = tempo[2] }
    else if (becmg) { fc.type = 'BECMG'; fc.period = becmg[2] }
    else if (fm) { fc.type = 'FM'; fc.period = fm[2] }

    // 风向风速: xxxTT(G?xx)(MPS|KT)
    const w = line.match(/\b(\d{3}\d{2,3}G?\d{0,2}(?:MPS|KT))\b/)
    if (w) {
      const d = w[1]
      fc.wind = d.slice(0, 3) + '° ' + d.slice(3).replace(/MPS|KT/, '') + (d.includes('KT') ? 'kt' : 'm/s')
    }

    // 能见度: CAVOK / 9999 / 4 位数
    if (line.includes('CAVOK')) {
      fc.vis = 'CAVOK（≥10km）'
    } else {
      const sm = line.match(/\b(\d+(?:\s+\d+)?\s*\d?\/?\d*)SM\b/)
      if (sm) fc.vis = sm[1].trim() + ' SM'
      else {
        const v = line.match(/\b(\d{4})\b(?!\s*\/)/)
        if (v) {
          fc.vis = v[1] === '9999' ? '≥10 km' : v[1] + ' m'
        }
      }
    }

    // 天气现象: -RA, +SN, BR, FG, TSRA 等
    const wx = line.match(/\b([+-]?(?:SH|TS|BC|BL|DR|FZ|MI|PR)?(?:RA|SN|SG|PL|GR|GS|DZ|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS|TS|SH|NSW))\b/g)
    if (wx) fc.weather = wx.join(' ')

    // 云况
    const clouds = []
    const cloudMatches = line.matchAll(/\b((?:FEW|SCT|BKN|OVC|VV)(\d{3})(?:CB|TCU)?)\b/g)
    for (const cm of cloudMatches) {
      const h = parseInt(cm[2]) * 100
      clouds.push(cm[1].replace(cm[2], h + 'ft'))
    }
    if (clouds.length) fc.cloud = clouds.join(' ')
    if (line.includes('NSC')) fc.cloud = 'NSC（无重要云）'
    if (line.includes('SKC') || line.includes('CLR')) fc.cloud = '晴天'

    forecasts.push(fc)
  }

  result.lines = forecasts
  // 生成摘要
  if (forecasts.length) {
    const parts = forecasts.map(f => {
      let s = ''
      if (f.type !== 'base') s += '[' + f.type + (f.period ? ' ' + f.period : '') + ']'
      if (f.prob) s += ' ' + f.prob
      if (f.wind) s += ' 风' + f.wind
      if (f.vis) s += ' 能见度' + f.vis
      if (f.weather) s += ' 天气' + f.weather
      if (f.cloud) s += ' 云' + f.cloud
      return s.trim()
    })
    result.summary = parts.join('；')
  }
  return result
}

// 常见枢纽中文名（优先展示；未命中时用 OurAirports 英文名）
const ZH_NAMES = {
  ZBAA: '北京首都', ZBAD: '北京大兴', ZSSS: '上海虹桥', ZSPD: '上海浦东', ZGGG: '广州白云',
  ZGSZ: '深圳宝安', ZBTJ: '天津滨海', ZPPP: '昆明长水', ZUCK: '重庆江北', ZSHC: '杭州萧山',
  ZSNJ: '南京禄口', ZHHH: '武汉天河', ZGHA: '长沙黄花', ZUUU: '成都天府', ZLXY: '西安咸阳',
  ZLLL: '兰州中川', ZSAM: '厦门高崎', ZSQD: '青岛胶东', ZJHK: '海口美兰', ZJSY: '三亚凤凰',
  ZSSH: '上海虹桥(旧)', VHHH: '香港赤鱲角', VMMC: '澳门', RCTP: '台北桃园', RCSS: '台北松山',
}

/* ============================ METAR 数据源 ============================ */

/** 源 1: aviationweather.gov（NOAA；全球 METAR，可带 TAF） */
async function fromAviationWeather(code) {
  const r = await fetch(`${AWC}/metar?ids=${code}&format=raw&taf=true`, { signal: AbortSignal.timeout(SRC_TIMEOUT) })
  if (!r.ok) return {}
  const text = (await r.text()).trim()
  if (!text) return {}
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean)
  const isTaf = (s) => /^TAF\b/.test(s)
  const metarLine = lines.find((s) => !isTaf(s))
  const tafLines = lines.filter(isTaf)
  return {
    metar: metarLine || '',
    taf: tafLines.join('\n'),
  }
}

/** 源 2: VATSIM（metar.vatsim.net；返回 '<ICAO> DDHHMMZ ...'，无 METAR 前缀，需归一化） */
async function fromVatsim(code) {
  const r = await fetch(`https://metar.vatsim.net/metar.php?id=${code}`, { signal: AbortSignal.timeout(SRC_TIMEOUT) })
  if (!r.ok) return {}
  const text = (await r.text()).trim()
  if (!text) return {}
  const re = new RegExp(`^(?:METAR\\s+|SPECI\\s+)?${code}\\s+\\d{6}Z`)
  const line = text.split('\n').map((s) => s.trim()).find((s) => re.test(s))
  if (!line) return {}
  return { metar: 'METAR ' + line.replace(/^(?:METAR|SPECI)\s+/, '') }
}

/** 可选源: CFY 平台 API（默认关闭；2026-10-30 实测已不可用，保留开关便于换地址） */
async function fromCfy(code) {
  const base = (process.env.WEATHER_CFY_API || '').trim()
  if (!base) return {}
  const [m, t] = await Promise.all([
    fetch(`${base}?icao=${code}`, { signal: AbortSignal.timeout(SRC_TIMEOUT) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${base.replace(/metar/i, 'taf')}?icao=${code}`, { signal: AbortSignal.timeout(SRC_TIMEOUT) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  return { metar: m?.data || m?.metar || '', taf: t?.data || t?.taf || '' }
}

/** 可选源: checkwx.com（需 CHECKWX_API_KEY；无 Key 直接跳过，不再空转） */
async function fromCheckwx(code) {
  const key = (process.env.CHECKWX_API_KEY || '').trim()
  if (!key) return {}
  const r = await fetch(`https://api.checkwx.com/metar/${code}/decoded`, {
    headers: { 'X-API-Key': key }, signal: AbortSignal.timeout(SRC_TIMEOUT),
  })
  if (!r.ok) return {}
  const d = await r.json()
  const raw = d?.data?.[0]?.raw_report || ''
  return raw ? { metar: raw.includes('METAR') ? raw : 'METAR ' + raw } : {}
}

/** 可选源: metar-taf.com（2026-10-30 实测 Cloudflare 全量 403；需白名单/出口代理才可用） */
async function fromMetarTaf(code) {
  if (process.env.WEATHER_ENABLE_METAR_TAF !== '1') return {}
  const r = await fetch(`https://metar-taf.com/metar/${code}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(SRC_TIMEOUT),
  })
  if (!r.ok) return {}
  const html = await r.text()
  const m = html.match(new RegExp(`METAR\\s+${code}\\s+\\d{6}Z[^<\\n]{0,200}`))
  return m ? { metar: m[0].trim() } : {}
}

/** 源链（按顺序尝试，命中即停）：覆盖失败自动降级，避免单源故障导致整站无天气 */
// 前两个源（覆盖重合）以并发竞速方式调用，见路由处理；其余为可选源
const OPTIONAL_SOURCES = [
  ['metar_taf', fromMetarTaf],
  ['cfy', fromCfy],
  ['checkwx', fromCheckwx],
]

// 简易内存缓存（同一机场 60s 内不重复外呼）
const cache = new Map()

router.get('/', async (req, res) => {
  try {
    const { icao } = req.query
    if (!icao) return res.status(400).json({ success: false, message: '缺少 ICAO 代码' })
    const code = String(icao).toUpperCase().trim()
    // 安全(2026-10-25 审计 P3-1): ICAO 白名单, 防参数注入外 URL
    if (!/^[A-Z0-9]{4}$/.test(code)) return res.status(400).json({ success: false, message: '无效 ICAO 代码' })

    const hit = cache.get(code)
    if (hit && Date.now() - hit.at < hit.ttl) return res.json(hit.payload)

    let metar = ''
    let taf = ''
    let source = null
    const tried = []

    // 主源并发竞速：aviationweather 与 VATSIM 覆盖高度重合，
    // 并发可把「未命中」的最坏延迟从 2×5s 降到 ~5s，且单源故障立即由另一源兜住
    const [awcOut, vatsimOut] = await Promise.allSettled([fromAviationWeather(code), fromVatsim(code)])
    const settled = [['aviationweather', awcOut], ['vatsim', vatsimOut]]
    for (const [name, r] of settled) {
      if (r.status === 'fulfilled') {
        if (r.value?.metar || r.value?.taf) tried.push(name)
      } else {
        console.warn(`[Weather] source ${name} failed for ${code}:`, r.reason?.message)
      }
    }
    if (awcOut.status === 'fulfilled' && awcOut.value?.metar) { metar = awcOut.value.metar; source = 'aviationweather' }
    if (!metar && vatsimOut.status === 'fulfilled' && vatsimOut.value?.metar) { metar = vatsimOut.value.metar; source = 'vatsim' }
    if (awcOut.status === 'fulfilled' && awcOut.value?.taf) taf = awcOut.value.taf

    // 可选源（默认全部关闭；开启后才逐个补缺）
    for (const [name, fn] of OPTIONAL_SOURCES) {
      if (metar && taf) break
      try {
        const out = await fn(code)
        if (out?.metar || out?.taf) tried.push(name)
        if (!metar && out?.metar) { metar = out.metar; source = name }
        if (!taf && out?.taf) taf = out.taf
      } catch (e) {
        console.warn(`[Weather] source ${name} failed for ${code}:`, e?.message)
      }
    }

    // 站点库判定：区分「机场不存在」与「机场存在但未发布 METAR」
    let station = null
    try { station = await getStation(code) } catch { station = null }

    const data = {
      metar: metar || null,
      taf: taf || null,
      parsed: metar ? parseMetar(metar) : null,
      tafParsed: taf ? parseTaf(taf) : null,
      station: ZH_NAMES[code] || station?.name || code,
      stationExists: !!station,
      metarAvailable: !!metar,
      tafAvailable: !!taf,
      source: source || null,
      sourcesTried: tried,
      hint: metar
        ? null
        : station
          ? `${ZH_NAMES[code] || station.name}（${station.city || station.country}）暂无公开 METAR：该机场未在国际 METAR 数据流中发布，可稍后重试或查看航图`
          : `机场代码 ${code} 不在机场库中，请检查 ICAO 是否正确`,
    }

    const payload = { success: true, data }
    cache.set(code, { at: Date.now(), ttl: metar ? TTL_HIT : TTL_MISS, payload })
    if (cache.size > 500) {
      // 简单上限，防内存膨胀
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (oldest) cache.delete(oldest[0])
    }
    res.json(payload)
  } catch (e) {
    console.error('[weather.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

export default router
