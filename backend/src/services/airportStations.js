/**
 * 机场站点库（OurAirports）
 *
 * 数据源: https://davidmegginson.github.io/ourairports-data/airports.csv
 *         OurAirports 数据为 **Public Domain（公有领域）**，无署名/非商用限制，
 *         与 OpenAIP 的 CC BY-NC 4.0 不同。
 *
 * 用途（修复 2026-10-30: METAR 覆盖问题）:
 *   1) 判断 ICAO 是否为真实机场 —— 从而区分「机场代码不存在」与「机场存在但数据源未发布 METAR」，
 *      避免用户查到空报文却不知道为什么；
 *   2) 提供机场名称/城市，替代 weather.js 里原本 15 个硬编码中文名；
 *   3) 作为 METAR 站点清单的权威来源（CN/HK/MO/TW 的 4 字码机场），供 FSD 侧自动扩充下载清单。
 *
 * 缓存: backend/data/airports_cn.json，TTL 7 天；下载失败时沿用旧缓存；原子写入。
 */

import fs from 'fs'
import path from 'path'

const CSV_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const CACHE_DIR = path.join(process.cwd(), 'data')
const CACHE_FILE = path.join(CACHE_DIR, 'airports_cn.json')
const TTL_MS = 7 * 24 * 3600 * 1000          // 7 天
const MAX_CSV_BYTES = 40 * 1024 * 1024       // 约 13MB，给足余量

// 关注的地区（中国 + 港澳台）
const COUNTRIES = new Set(['CN', 'HK', 'MO', 'TW'])

// 关心的机场类型（含小机场；heliport/closed 等排除）
const TYPES = new Set(['large_airport', 'medium_airport', 'small_airport'])

let _stations = null        // { ICAO: { name, city, type, country } }
let _loading = null         // 去重并发加载

/** 最小 CSV 解析（OurAirports 的字段含引号与逗号） */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** 从 CSV 文本构建站点表 */
function buildStations(text) {
  const rows = parseCsv(text)
  if (!rows.length) throw new Error('CSV 为空')
  const header = rows[0]
  const idx = {}
  for (let i = 0; i < header.length; i++) idx[header[i]] = i
  const need = ['ident', 'type', 'name', 'iso_country', 'icao_code', 'gps_code', 'local_code', 'municipality']
  for (const k of need) if (idx[k] === undefined) throw new Error(`CSV 缺少列: ${k}`)

  const out = {}
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length < header.length) continue
    const country = row[idx.iso_country]
    if (!COUNTRIES.has(country)) continue
    const type = row[idx.type]
    if (!TYPES.has(type)) continue
    // 4 字码可能落在 ident / icao_code / gps_code / local_code 任一列
    let icao = ''
    for (const k of ['icao_code', 'ident', 'gps_code', 'local_code']) {
      const v = (row[idx[k]] || '').trim().toUpperCase()
      if (/^[A-Z]{4}$/.test(v)) { icao = v; break }
    }
    if (!icao) continue
    out[icao] = {
      name: (row[idx.name] || '').trim(),
      city: (row[idx.municipality] || '').trim(),
      type,
      country,
    }
  }
  return out
}

function readCache() {
  try {
    const st = fs.statSync(CACHE_FILE)
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    if (!raw || !raw.stations) return null
    return { stations: raw.stations, fresh: Date.now() - st.mtimeMs < TTL_MS, generatedAt: raw.generatedAt }
  } catch {
    return null
  }
}

function writeCache(stations) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const payload = JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: CSV_URL,
      count: Object.keys(stations).length,
      stations,
    })
    const tmp = CACHE_FILE + '.tmp'
    fs.writeFileSync(tmp, payload)
    fs.renameSync(tmp, CACHE_FILE)      // 原子替换，避免半截文件
  } catch (e) {
    console.warn('[airportStations] 写入缓存失败:', e?.message)
  }
}

async function download() {
  const r = await fetch(CSV_URL, { signal: AbortSignal.timeout(90 * 1000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > MAX_CSV_BYTES) throw new Error('CSV 超过大小上限')
  return buf.toString('utf8')
}

/**
 * 加载站点表（内存 → 磁盘缓存 → 下载）。
 * 下载失败时退回旧缓存或内置兜底清单，永不抛错（避免拖垮天气接口）。
 */
export async function loadStations() {
  if (_stations) return _stations
  if (_loading) return _loading

  _loading = (async () => {
    const cached = readCache()
    if (cached?.fresh) {
      _stations = cached.stations
      return _stations
    }
    try {
      const text = await download()
      const stations = buildStations(text)
      if (Object.keys(stations).length < 50) throw new Error('解析到的站点过少')
      _stations = stations
      writeCache(stations)
      console.log(`[airportStations] OurAirports 站点库已更新: ${Object.keys(stations).length} 个（CN/HK/MO/TW）`)
    } catch (e) {
      console.warn('[airportStations] 更新失败，使用缓存/兜底:', e?.message)
      _stations = cached?.stations || FALLBACK
      // 用旧缓存也写一次时间戳，避免每次请求都重试下载
      if (cached?.stations) writeCache(cached.stations)
    }
    return _stations
  })()

  try { return await _loading } finally { _loading = null }
}

/** 内置兜底（网络不可用且无缓存时，只保证主要枢纽可判存在） */
const FALLBACK = {
  ZBAA: { name: 'Beijing Capital International Airport', city: 'Beijing', type: 'large_airport', country: 'CN' },
  ZBAD: { name: 'Beijing Daxing International Airport', city: 'Beijing', type: 'large_airport', country: 'CN' },
  ZSPD: { name: 'Shanghai Pudong International Airport', city: 'Shanghai', type: 'large_airport', country: 'CN' },
  ZSSS: { name: 'Shanghai Hongqiao International Airport', city: 'Shanghai', type: 'large_airport', country: 'CN' },
  ZGGG: { name: 'Guangzhou Baiyun International Airport', city: 'Guangzhou', type: 'large_airport', country: 'CN' },
  ZUUU: { name: 'Chengdu Shuangliu International Airport', city: 'Chengdu', type: 'large_airport', country: 'CN' },
  ZPPP: { name: 'Kunming Changshui International Airport', city: 'Kunming', type: 'large_airport', country: 'CN' },
  ZLXY: { name: "Xi'an Xianyang International Airport", city: "Xi'an", type: 'large_airport', country: 'CN' },
  ZHHH: { name: 'Wuhan Tianhe International Airport', city: 'Wuhan', type: 'large_airport', country: 'CN' },
  ZSHC: { name: 'Hangzhou Xiaoshan International Airport', city: 'Hangzhou', type: 'large_airport', country: 'CN' },
  ZSNJ: { name: 'Nanjing Lukou International Airport', city: 'Nanjing', type: 'large_airport', country: 'CN' },
  VHHH: { name: 'Hong Kong International Airport', city: 'Hong Kong', type: 'large_airport', country: 'HK' },
}

/** 查询单个机场；不存在返回 null */
export async function getStation(icao) {
  const code = String(icao || '').trim().toUpperCase()
  if (!/^[A-Z]{4}$/.test(code)) return null
  const stations = await loadStations()
  const s = stations[code]
  return s ? { icao: code, ...s } : null
}

/** 全部站点 4 字码清单（可限定类型），供 METAR 下载清单使用 */
export async function listStationIcaos(types = ['large_airport', 'medium_airport']) {
  const stations = await loadStations()
  const want = new Set(types)
  return Object.keys(stations).filter((k) => want.has(stations[k].type)).sort()
}

/** 测试/运维用：清空内存缓存 */
export function clearCache() {
  _stations = null
}
