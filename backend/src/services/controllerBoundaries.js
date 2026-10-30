/**
 * 管制区域边界服务
 *
 * 根据管制员呼号后缀确定其类型，返回对应的地理多边形：
 *   _CTR → FIR 区域边界（含飞行情报区）
 *   _APP → 进近管制圈（半径 80km 围绕机场）
 *   _TWR → 塔台管制圈（半径 15km）
 *   _GND → 地面管制圈（半径 5km）
 *   _DEL → 放行管制圈（半径 5km）
 *   ＿FSS → 飞行服务站（半径 1000km）
 *   其他 → 默认 50km 圈
 *
 * FIR 数据来源：VATSpy 数据项目（vatspy-data-project）的 Boundaries.geojson，
 * 文件位于 backend/src/data/fir_boundaries.json（全球 FIR 真实边界）。
 * 缺失/解析失败时回退到内置的简化中国周边 FIR 边界坐标。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as turf from '@turf/turf'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 半径常量（千米）
const RADIUS = {
  CTR: 600,    // 区域管制
  APP: 80,     // 进近
  TWR: 15,     // 塔台
  GND: 5,      // 地面
  DEL: 5,      // 放行
  FSS: 1000,   // 飞行服务站
  DEFAULT: 50, // 默认
}

// FIR 边界缓存
let firBoundaries = null

/**
 * 计算多边形环面积（近似平方度，用于比较哪个环是主环）
 */
function ringArea(ring) {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i]
    const p2 = ring[(i + 1) % ring.length]
    area += (p2[0] - p1[0]) * (p1[1] + p2[1]) / 2
  }
  return Math.abs(area)
}

/**
 * 将 VATSpy 的 MultiPolygon 特征规范化为单 Polygon（取最大外环）
 * VATSpy 的 properties 无 name，用 id 代替；附带 label 坐标。
 */
function normalizeVatspyFeature(f) {
  const id = String(f.properties?.id || '').toUpperCase()
  if (!id) return null
  let bestRing = null
  let bestArea = -1
  for (const polygon of (f.geometry?.coordinates || [])) {
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 3) continue
      const a = ringArea(ring)
      if (a > bestArea) { bestArea = a; bestRing = ring }
    }
  }
  if (!bestRing) return null
  return {
    properties: {
      id,
      name: f.properties.id || id,
      label_lon: f.properties.label_lon,
      label_lat: f.properties.label_lat,
      oceanic: f.properties.oceanic,
      region: f.properties.region,
      division: f.properties.division,
    },
    geometry: { type: 'Polygon', coordinates: [bestRing] },
  }
}

/**
 * 建立 id → feature 索引（重复 id 保留面积更大者）
 */
function indexFeatures(features) {
  const byId = new Map()
  const ringOf = (f) => f?.geometry?.coordinates?.[0] || []
  for (const f of features) {
    const id = String(f.properties?.id || '').toUpperCase()
    if (!id) continue
    const existing = byId.get(id)
    if (!existing) { byId.set(id, f); continue }
    if (ringArea(ringOf(f)) > ringArea(ringOf(existing))) {
      byId.set(id, f)
    }
  }
  return byId
}

/**
 * 加载 FIR 边界 GeoJSON 数据：
 * 1. 优先使用 backend/src/data/fir_boundaries.json（VATSpy 真实 FIR 边界）
 * 2. 缺失/解析失败时回退到内置简化 FIR
 */
function loadFirBoundaries() {
  if (firBoundaries) return firBoundaries
  try {
    const filePath = path.resolve(__dirname, '../data/fir_boundaries.json')
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.features) && parsed.features.length) {
        const features = parsed.features.map(normalizeVatspyFeature).filter(Boolean)
        if (features.length) {
          firBoundaries = { features, byId: indexFeatures(features), source: 'vatspy' }
          return firBoundaries
        }
      }
    }
  } catch (e) {
    console.warn('[boundaries] 加载 fir_boundaries.json 失败，回退内置简化数据:', e.message)
  }
  const builtin = getBuiltinFirs().features
  firBoundaries = { features: builtin, byId: indexFeatures(builtin), source: 'builtin' }
  return firBoundaries
}

/**
 * 内置简化 FIR 边界（全球主要 FIR）
 * 数据来源：ICAO FIR 边界（高度简化）
 * 坐标格式：[经度, 纬度]
 *
 * 通过 `backend/data/fir_boundaries.json` 可加载更精确的 GeoJSON。
 * 可通过 ICAO 前缀匹配（如 RJAA → RJ, KZLA → KZ）。
 */
function getBuiltinFirs() {
  return {
    type: 'FeatureCollection',
    features: [
      // ==================== 中国 ====================
      { properties: { id: 'ZBAA', name: '北京 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [108,48],[120,48],[126,42],[126,38],[124,36],[122,34],[120,32],
          [118,30],[116,28],[114,26],[110,26],[108,28],[106,30],[104,34],
          [106,38],[108,42],[108,48]
        ]]}
      },
      { properties: { id: 'ZSSS', name: '上海 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [118,34],[122,34],[126,32],[126,28],[124,26],[122,24],[120,22],
          [118,22],[116,24],[116,28],[118,30],[118,34]
        ]]}
      },
      { properties: { id: 'ZGGG', name: '广州 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [108,26],[116,24],[118,22],[120,22],[118,20],[116,18],[112,18],
          [110,20],[108,22],[106,24],[108,26]
        ]]}
      },
      { properties: { id: 'ZUUU', name: '成都 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [97,34],[104,34],[106,30],[108,28],[110,26],[108,26],[106,24],
          [104,26],[100,26],[97,28],[95,30],[97,34]
        ]]}
      },
      { properties: { id: 'ZPKM', name: '昆明 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [97,28],[100,26],[104,26],[106,24],[104,22],[100,22],[97,24],[95,26],[97,28]
        ]]}
      },
      { properties: { id: 'ZLXY', name: '西安 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [104,38],[106,38],[108,42],[108,38],[106,34],[104,34],[102,32],[100,34],[102,36],[104,38]
        ]]}
      },
      { properties: { id: 'ZYSH', name: '沈阳 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [118,42],[126,42],[132,40],[132,36],[130,34],[126,34],[124,36],[122,38],[120,38],[118,40],[118,42]
        ]]}
      },
      { properties: { id: 'ZWWW', name: '乌鲁木齐 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [73,50],[90,50],[96,46],[96,40],[90,36],[85,34],[80,36],[73,40],[73,50]
        ]]}
      },
      { properties: { id: 'ZGKL', name: '桂林 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [108,26],[110,26],[112,24],[110,22],[108,22],[106,24],[108,26]
        ]]}
      },
      { properties: { id: 'ZJH', name: '海口 FIR', country: 'CN' },
        geometry: { type: 'Polygon', coordinates: [[
          [108,20],[116,18],[118,16],[114,14],[110,16],[108,18],[108,20]
        ]]}
      },
      // ==================== 日本 ====================
      { properties: { id: 'RJAA', name: '东京 FIR / 福冈 FIR', country: 'JP' },
        geometry: { type: 'Polygon', coordinates: [[
          [127,35],[132,33],[135,35],[140,35],[145,40],[145,45],[140,48],
          [135,50],[130,50],[127,45],[125,40],[125,35],[127,35]
        ]]}
      },
      { properties: { id: 'ROAH', name: '那霸 FIR（冲绳）', country: 'JP' },
        geometry: { type: 'Polygon', coordinates: [[
          [122,24],[125,24],[128,26],[130,28],[128,30],[125,28],[122,26],[122,24]
        ]]}
      },
      // ==================== 韩国 ====================
      { properties: { id: 'RKRR', name: '仁川 FIR', country: 'KR' },
        geometry: { type: 'Polygon', coordinates: [[
          [124,38],[126,35],[128,35],[130,37],[130,40],[128,42],[126,42],[124,40],[124,38]
        ]]}
      },
      // ==================== 东南亚 ====================
      { properties: { id: 'VTSM', name: '曼谷 FIR', country: 'TH' },
        geometry: { type: 'Polygon', coordinates: [[
          [100,5],[105,5],[107,8],[107,14],[105,18],[102,20],[100,18],
          [98,16],[97,12],[97,8],[100,5]
        ]]}
      },
      { properties: { id: 'VVTS', name: '胡志明 FIR', country: 'VN' },
        geometry: { type: 'Polygon', coordinates: [[
          [102,8],[105,5],[108,5],[110,8],[110,12],[108,16],[105,18],
          [102,18],[100,14],[100,10],[102,8]
        ]]}
      },
      { properties: { id: 'WSJC', name: '新加坡 FIR', country: 'SG' },
        geometry: { type: 'Polygon', coordinates: [[
          [100,-2],[105,-2],[107,0],[107,5],[105,5],[103,5],[100,3],[100,-2]
        ]]}
      },
      { properties: { id: 'WAAF', name: '雅加达 FIR', country: 'ID' },
        geometry: { type: 'Polygon', coordinates: [[
          [100,-8],[108,-8],[115,-8],[118,-5],[118,0],[115,0],[110,0],
          [105,0],[100,0],[97,-3],[97,-6],[100,-8]
        ]]}
      },
      { properties: { id: 'RPMZ', name: '马尼拉 FIR', country: 'PH' },
        geometry: { type: 'Polygon', coordinates: [[
          [116,5],[120,5],[125,5],[128,8],[128,15],[125,18],[120,20],
          [116,18],[114,15],[114,10],[116,5]
        ]]}
      },
      { properties: { id: 'WMFC', name: '吉隆坡 FIR', country: 'MY' },
        geometry: { type: 'Polygon', coordinates: [[
          [100,0],[105,0],[108,3],[108,8],[105,8],[103,8],[100,6],[100,0]
        ]]}
      },
      // ==================== 北美 ====================
      { properties: { id: 'KZLA', name: '洛杉矶 ARTCC（ZLA）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-126,38],[-120,38],[-118,36],[-117,34],[-114,34],[-114,32],
          [-117,32],[-120,32],[-122,34],[-124,36],[-126,38]
        ]]}
      },
      { properties: { id: 'KZOA', name: '奥克兰 ARTCC（ZOA）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-126,42],[-120,42],[-120,38],[-124,36],[-126,38],[-126,42]
        ]]}
      },
      { properties: { id: 'KZSE', name: '西雅图 ARTCC（ZSE）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-126,48],[-120,48],[-120,42],[-124,40],[-126,42],[-126,48]
        ]]}
      },
      { properties: { id: 'KZMP', name: '明尼阿波利斯 ARTCC（ZMP）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-105,49],[-97,49],[-97,43],[-100,42],[-105,43],[-105,49]
        ]]}
      },
      { properties: { id: 'KZAU', name: '芝加哥 ARTCC（ZAU）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-93,44],[-87,44],[-87,40],[-90,39],[-93,40],[-93,44]
        ]]}
      },
      { properties: { id: 'KZNY', name: '纽约 ARTCC（ZNY）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-80,42],[-73,42],[-73,40],[-75,38],[-78,38],[-80,40],[-80,42]
        ]]}
      },
      { properties: { id: 'KZDC', name: '华盛顿 ARTCC（ZDC）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-80,40],[-75,38],[-75,36],[-77,36],[-80,38],[-80,40]
        ]]}
      },
      { properties: { id: 'KZTL', name: '亚特兰大 ARTCC（ZTL）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-85,38],[-80,38],[-80,34],[-83,32],[-87,32],[-88,35],[-85,38]
        ]]}
      },
      { properties: { id: 'KZMA', name: '迈阿密 ARTCC（ZMA）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-85,30],[-80,30],[-80,24],[-82,22],[-85,24],[-85,30]
        ]]}
      },
      { properties: { id: 'KZHU', name: '休斯顿 ARTCC（ZHU）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-98,34],[-93,34],[-93,28],[-97,26],[-100,28],[-100,32],[-98,34]
        ]]}
      },
      { properties: { id: 'KZFW', name: '沃斯堡 ARTCC（ZFW）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-100,36],[-97,36],[-97,32],[-100,32],[-100,36]
        ]]}
      },
      { properties: { id: 'KZDV', name: '丹佛 ARTCC（ZDV）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-109,41],[-102,41],[-102,37],[-105,36],[-109,37],[-109,41]
        ]]}
      },
      { properties: { id: 'KZAB', name: '阿尔伯克基 ARTCC（ZAB）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-110,38],[-102,37],[-102,32],[-106,31],[-110,32],[-110,38]
        ]]}
      },
      { properties: { id: 'KZKC', name: '堪萨斯城 ARTCC（ZKC）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-97,40],[-93,40],[-93,36],[-97,36],[-97,40]
        ]]}
      },
      { properties: { id: 'KZOB', name: '克利夫兰 ARTCC（ZOB）', country: 'US' },
        geometry: { type: 'Polygon', coordinates: [[
          [-87,44],[-80,44],[-80,40],[-83,40],[-87,40],[-87,44]
        ]]}
      },
      { properties: { id: 'CZEG', name: '埃德蒙顿 FIR', country: 'CA' },
        geometry: { type: 'Polygon', coordinates: [[
          [-130,60],[-110,60],[-110,54],[-114,52],[-120,52],[-130,55],[-130,60]
        ]]}
      },
      { properties: { id: 'CZVR', name: '温哥华 FIR', country: 'CA' },
        geometry: { type: 'Polygon', coordinates: [[
          [-140,54],[-130,55],[-120,52],[-120,48],[-126,48],[-130,50],[-140,52],[-140,54]
        ]]}
      },
      { properties: { id: 'CZWG', name: '温尼伯 FIR', country: 'CA' },
        geometry: { type: 'Polygon', coordinates: [[
          [-110,60],[-95,60],[-95,54],[-100,52],[-110,54],[-110,60]
        ]]}
      },
      { properties: { id: 'CZUL', name: '蒙特利尔 FIR', country: 'CA' },
        geometry: { type: 'Polygon', coordinates: [[
          [-80,52],[-70,52],[-65,48],[-70,45],[-75,45],[-80,48],[-80,52]
        ]]}
      },
      { properties: { id: 'CZYZ', name: '多伦多 FIR', country: 'CA' },
        geometry: { type: 'Polygon', coordinates: [[
          [-95,54],[-80,52],[-80,48],[-85,44],[-90,44],[-95,48],[-95,54]
        ]]}
      },
      // ==================== 欧洲 ====================
      { properties: { id: 'EDUU', name: '慕尼黑 UIR / 德国 FIR', country: 'DE' },
        geometry: { type: 'Polygon', coordinates: [[
          [5,47],[10,47],[13,48],[15,50],[15,54],[13,55],[10,55],[7,54],
          [5,52],[5,47]
        ]]}
      },
      { properties: { id: 'EGTT', name: '伦敦 FIR / 苏格兰 FIR', country: 'GB' },
        geometry: { type: 'Polygon', coordinates: [[
          [-8,52],[0,52],[2,54],[2,58],[0,60],[-3,60],[-6,58],[-8,55],[-8,52]
        ]]}
      },
      { properties: { id: 'LFFF', name: '巴黎 FIR', country: 'FR' },
        geometry: { type: 'Polygon', coordinates: [[
          [-5,45],[0,45],[2,47],[5,47],[5,50],[2,50],[0,50],[-2,48],[-5,47],[-5,45]
        ]]}
      },
      { properties: { id: 'LIRR', name: '罗马 FIR / 米兰 FIR', country: 'IT' },
        geometry: { type: 'Polygon', coordinates: [[
          [6,44],[10,44],[12,43],[14,42],[14,38],[12,37],[10,38],[8,38],
          [6,40],[6,44]
        ]]}
      },
      { properties: { id: 'LECB', name: '巴塞罗那 FIR / 马德里 FIR', country: 'ES' },
        geometry: { type: 'Polygon', coordinates: [[
          [-10,40],[-2,40],[0,42],[3,42],[3,44],[0,44],[-5,44],[-10,42],[-10,40]
        ]]}
      },
      { properties: { id: 'EBBU', name: '布鲁塞尔 FIR', country: 'BE' },
        geometry: { type: 'Polygon', coordinates: [[
          [2,49],[5,49],[6,51],[5,52],[3,52],[2,50],[2,49]
        ]]}
      },
      { properties: { id: 'EHAA', name: '阿姆斯特丹 FIR', country: 'NL' },
        geometry: { type: 'Polygon', coordinates: [[
          [3,51],[5,51],[7,52],[7,54],[5,54],[3,53],[3,51]
        ]]}
      },
      { properties: { id: 'EKDK', name: '哥本哈根 FIR', country: 'DK' },
        geometry: { type: 'Polygon', coordinates: [[
          [8,54],[12,54],[15,55],[15,57],[12,57],[10,56],[8,55],[8,54]
        ]]}
      },
      { properties: { id: 'ESOS', name: '瑞典 FIR', country: 'SE' },
        geometry: { type: 'Polygon', coordinates: [[
          [11,55],[15,55],[18,56],[20,58],[20,62],[18,64],[15,65],[12,64],
          [10,62],[10,58],[11,55]
        ]]}
      },
      { properties: { id: 'ENOB', name: '挪威 FIR', country: 'NO' },
        geometry: { type: 'Polygon', coordinates: [[
          [4,57],[10,57],[12,58],[15,60],[15,65],[12,68],[10,70],[5,70],
          [4,68],[4,60],[4,57]
        ]]}
      },
      { properties: { id: 'EFIN', name: '芬兰 FIR', country: 'FI' },
        geometry: { type: 'Polygon', coordinates: [[
          [20,60],[25,60],[28,62],[30,65],[30,70],[28,70],[25,70],[22,68],
          [20,65],[20,60]
        ]]}
      },
      { properties: { id: 'UUWV', name: '莫斯科 FIR', country: 'RU' },
        geometry: { type: 'Polygon', coordinates: [[
          [35,50],[40,48],[45,48],[50,50],[50,55],[48,58],[45,60],[40,60],
          [35,58],[33,55],[33,52],[35,50]
        ]]}
      },
      { properties: { id: 'ULLL', name: '圣彼得堡 FIR', country: 'RU' },
        geometry: { type: 'Polygon', coordinates: [[
          [28,56],[33,55],[35,58],[33,62],[30,64],[28,62],[27,60],[27,58],[28,56]
        ]]}
      },
      { properties: { id: 'LRBB', name: '布加勒斯特 FIR', country: 'RO' },
        geometry: { type: 'Polygon', coordinates: [[
          [20,44],[25,44],[28,45],[30,47],[30,48],[28,48],[25,48],[22,47],[20,44]
        ]]}
      },
      { properties: { id: 'LZBB', name: '布拉迪斯拉发 FIR / 维也纳 FIR', country: 'AT' },
        geometry: { type: 'Polygon', coordinates: [[
          [12,46],[16,46],[18,48],[17,50],[15,50],[13,49],[12,47],[12,46]
        ]]}
      },
      { properties: { id: 'EPWW', name: '华沙 FIR', country: 'PL' },
        geometry: { type: 'Polygon', coordinates: [[
          [14,49],[18,49],[22,50],[24,52],[24,54],[22,55],[18,55],[15,54],[14,52],[14,49]
        ]]}
      },
      // ==================== 中东 ====================
      { properties: { id: 'OAKX', name: '达卡 FIR / 巴林 FIR', country: 'BH' },
        geometry: { type: 'Polygon', coordinates: [[
          [48,24],[52,24],[55,25],[56,27],[55,28],[52,28],[50,27],[48,26],[48,24]
        ]]}
      },
      { properties: { id: 'ORBB', name: '巴格达 FIR', country: 'IQ' },
        geometry: { type: 'Polygon', coordinates: [[
          [38,30],[44,30],[46,32],[46,36],[44,38],[42,38],[40,37],[38,35],[38,30]
        ]]}
      },
      { properties: { id: 'OJAC', name: '阿曼 FIR', country: 'OM' },
        geometry: { type: 'Polygon', coordinates: [[
          [52,16],[56,16],[58,18],[58,22],[56,24],[54,24],[52,22],[52,18],[52,16]
        ]]}
      },
      { properties: { id: 'OSTT', name: '大马士革 FIR / 贝鲁特 FIR', country: 'SY' },
        geometry: { type: 'Polygon', coordinates: [[
          [35,32],[38,32],[40,34],[40,36],[38,37],[36,37],[35,35],[35,32]
        ]]}
      },
      { properties: { id: 'LTBB', name: '安卡拉 FIR', country: 'TR' },
        geometry: { type: 'Polygon', coordinates: [[
          [26,36],[32,36],[36,36],[38,38],[38,40],[36,42],[32,42],[28,42],[26,40],[26,36]
        ]]}
      },
      // ==================== 南亚 ====================
      { properties: { id: 'VIDF', name: '德里 FIR', country: 'IN' },
        geometry: { type: 'Polygon', coordinates: [[
          [72,28],[78,28],[82,26],[84,28],[84,32],[82,34],[78,34],[76,32],[74,30],[72,28]
        ]]}
      },
      { properties: { id: 'VEGF', name: '加尔各答 FIR', country: 'IN' },
        geometry: { type: 'Polygon', coordinates: [[
          [82,22],[86,22],[90,24],[92,26],[92,22],[90,20],[86,18],[84,20],[82,22]
        ]]}
      },
      { properties: { id: 'VABF', name: '孟买 FIR', country: 'IN' },
        geometry: { type: 'Polygon', coordinates: [[
          [68,22],[72,22],[76,20],[78,18],[76,16],[72,16],[68,18],[68,22]
        ]]}
      },
      { properties: { id: 'OPKR', name: '卡拉奇 FIR', country: 'PK' },
        geometry: { type: 'Polygon', coordinates: [[
          [62,24],[68,22],[70,24],[70,28],[68,30],[66,30],[64,28],[62,26],[62,24]
        ]]}
      },
      // ==================== 大洋洲 ====================
      { properties: { id: 'YBBB', name: '布里斯班 FIR', country: 'AU' },
        geometry: { type: 'Polygon', coordinates: [[
          [145,-20],[150,-20],[155,-22],[155,-28],[153,-30],[150,-30],[148,-28],[145,-25],[145,-20]
        ]]}
      },
      { properties: { id: 'YMMM', name: '墨尔本 FIR', country: 'AU' },
        geometry: { type: 'Polygon', coordinates: [[
          [140,-30],[145,-25],[148,-28],[150,-32],[150,-38],[148,-40],[145,-40],[142,-38],[140,-35],[140,-30]
        ]]}
      },
      { properties: { id: 'NZZO', name: '奥克兰 FIR', country: 'NZ' },
        geometry: { type: 'Polygon', coordinates: [[
          [165,-35],[170,-35],[175,-37],[175,-42],[173,-44],[170,-44],[168,-42],[165,-38],[165,-35]
        ]]}
      },
      // ==================== 南美 ====================
      { properties: { id: 'SBAO', name: '巴西利亚 FIR', country: 'BR' },
        geometry: { type: 'Polygon', coordinates: [[
          [-50,-10],[-45,-10],[-40,-12],[-38,-15],[-40,-18],[-45,-20],[-48,-20],[-50,-15],[-50,-10]
        ]]}
      },
      { properties: { id: 'SBRE', name: '累西腓 FIR', country: 'BR' },
        geometry: { type: 'Polygon', coordinates: [[
          [-38,-5],[-35,-5],[-33,-8],[-33,-12],[-35,-15],[-38,-15],[-38,-5]
        ]]}
      },
      { properties: { id: 'SAEF', name: '埃塞萨 FIR / 布宜诺斯艾利斯', country: 'AR' },
        geometry: { type: 'Polygon', coordinates: [[
          [-62,-30],[-58,-30],[-55,-32],[-55,-36],[-58,-38],[-60,-38],[-62,-35],[-62,-30]
        ]]}
      },
      { properties: { id: 'SCEZ', name: '智利 FIR', country: 'CL' },
        geometry: { type: 'Polygon', coordinates: [[
          [-76,-20],[-70,-20],[-68,-22],[-68,-30],[-70,-33],[-72,-35],[-75,-33],[-76,-25],[-76,-20]
        ]]}
      },
      // ==================== 非洲 ====================
      { properties: { id: 'HAAA', name: '亚的斯亚贝巴 FIR', country: 'ET' },
        geometry: { type: 'Polygon', coordinates: [[
          [33,5],[38,5],[42,8],[44,10],[44,14],[42,15],[38,15],[35,12],[33,10],[33,5]
        ]]}
      },
      { properties: { id: 'HECC', name: '开罗 FIR', country: 'EG' },
        geometry: { type: 'Polygon', coordinates: [[
          [24,22],[30,22],[34,24],[35,28],[35,30],[34,32],[30,32],[28,30],[26,28],[24,25],[24,22]
        ]]}
      },
      { properties: { id: 'FAJA', name: '约翰内斯堡 FIR', country: 'ZA' },
        geometry: { type: 'Polygon', coordinates: [[
          [22,-28],[26,-28],[30,-26],[32,-28],[32,-32],[30,-34],[28,-34],[26,-32],[24,-30],[22,-28]
        ]]}
      },
      { properties: { id: 'DNKK', name: '拉各斯 FIR', country: 'NG' },
        geometry: { type: 'Polygon', coordinates: [[
          [2,4],[6,4],[10,6],[12,8],[12,12],[10,12],[8,12],[6,10],[4,8],[2,6],[2,4]
        ]]}
      },
      { properties: { id: 'GOOO', name: '达喀尔 FIR', country: 'SN' },
        geometry: { type: 'Polygon', coordinates: [[
          [-20,12],[-15,12],[-12,14],[-12,16],[-15,18],[-17,18],[-20,16],[-20,12]
        ]]}
      },
    ]
  }
}

/**
 * 生成圆形多边形
 * @param {number} lat - 中心纬度
 * @param {number} lon - 中心经度
 * @param {number} radiusKm - 半径（千米）
 * @param {number} points - 多边形点数
 * @returns {Array} 坐标数组 [[lon,lat],...]
 */
function createCirclePolygon(lat, lon, radiusKm, points = 64) {
  const coords = []
  const latRad = radiusKm / 111.32
  const lonRad = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI
    const dx = lon + lonRad * Math.cos(angle)
    const dy = lat + latRad * Math.sin(angle)
    coords.push([dx, dy])
  }
  return coords
}

/**
 * 生成多边形扇区边界（用少边数模拟空域区块，非圆形）
 * @param {number} lat - 中心纬度
 * @param {number} lon - 中心经度
 * @param {number} radiusKm - 半径（千米）
 * @param {number} sides - 边数（6=六边形, 8=八边形, 12=十二边形）
 * @returns {Array<{lon:number, lat:number}>}
 */
function createSectorPolygon(lat, lon, radiusKm, sides = 8) {
  const coords = []
  const latRad = radiusKm / 111.32
  const lonRad = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))

  // 基于经纬度生成确定的偏移角度，使每个空域扇区有固定朝向
  const offset = ((lat * 7 + lon * 13) % 360) * Math.PI / 180

  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * 2 * Math.PI + offset
    const dx = lon + lonRad * Math.cos(angle)
    const dy = lat + latRad * Math.sin(angle)
    coords.push({ lon: dx, lat: dy })
  }
  return coords
}

/**
 * 解析管制呼号类型
 */
function parseControllerType(callsign) {
  const upper = callsign.toUpperCase()

  if (upper.endsWith('_CTR')) return { type: 'CTR', suffix: '_CTR' }
  if (upper.endsWith('_APP')) return { type: 'APP', suffix: '_APP' }
  if (upper.endsWith('_TWR')) return { type: 'TWR', suffix: '_TWR' }
  if (upper.endsWith('_GND')) return { type: 'GND', suffix: '_GND' }
  if (upper.endsWith('_DEL')) return { type: 'DEL', suffix: '_DEL' }
  if (upper.endsWith('_FSS')) return { type: 'FSS', suffix: '_FSS' }

  // 尝试通过 facilityType 判断
  return { type: 'UNKNOWN', suffix: '' }
}

/**
 * 获取机场 ICAO 代码（从呼号中提取）
 * 例如：ZSPD_TWR → ZSPD, ZBAA_APP → ZBAA
 */
function extractAirportIcao(callsign) {
  const upper = callsign.toUpperCase()
  // 去掉后缀
  const parts = upper.split('_')
  if (parts.length >= 2) {
    const icao = parts[0]
    if (/^[A-Z0-9]{4}$/.test(icao)) return icao
  }
  return null
}

/**
 * 机场 → FIR/管制区映射（中国区域，对应 VATSpy 数据中的 FIR id）
 * 使机场呼号（如 ZBAA_CTR → ZBPE）能定位到正确的管制区多边形。
 */
const AIRPORT_TO_FIR = {
  // —— 华北：北京管制区 ZBPE ——
  'ZBAA': 'ZBPE', 'ZBAD': 'ZBPE', 'ZBTJ': 'ZBPE', 'ZBSJ': 'ZBPE', 'ZBYN': 'ZBPE',
  'ZBDT': 'ZBPE', 'ZBLL': 'ZBPE', 'ZBZJ': 'ZBPE', 'ZBCZ': 'ZBPE', 'ZBSH': 'ZBPE',
  'ZBXZ': 'ZBPE', 'ZBLA': 'ZBPE', 'ZBES': 'ZBPE', 'ZBHD': 'ZBPE',
  // 呼和浩特管制区 ZBHH
  'ZBHH': 'ZBHH', 'ZBDS': 'ZBHH', 'ZBYC': 'ZBHH', 'ZBTL': 'ZBHH',
  // —— 华东：上海管制区 ZSHA ——
  'ZSSS': 'ZSHA', 'ZSPD': 'ZSHA', 'ZSNJ': 'ZSHA', 'ZSHC': 'ZSHA', 'ZSNB': 'ZSHA',
  'ZSWX': 'ZSHA', 'ZSNT': 'ZSHA', 'ZSYT': 'ZSHA', 'ZSLY': 'ZSHA', 'ZSWZ': 'ZSHA',
  'ZSGS': 'ZSHA', 'ZSXZ': 'ZSHA', 'ZSYA': 'ZSHA', 'ZSHZ': 'ZSHA', 'ZSJG': 'ZSHA',
  'ZSJH': 'ZSHA', 'ZSCG': 'ZSHA', 'ZSQD': 'ZSQD', 'ZSJN': 'ZSJN', 'ZSOF': 'ZSOF',
  'ZSCN': 'ZSCN', 'ZSAM': 'ZSAM',
  // —— 中南：广州管制区 ZGZU ——
  'ZGGG': 'ZGZU', 'ZGSZ': 'ZGZU', 'ZGHA': 'ZGZU', 'ZGNN': 'ZGZU', 'ZGKL': 'ZGZU',
  'ZHCC': 'ZGZU', 'ZGOW': 'ZGZU', 'ZGSD': 'ZGZU', 'ZGZJ': 'ZGZU', 'ZGBH': 'ZGZU',
  'ZGDY': 'ZGZU', 'ZGHZ': 'ZGZU', 'ZGYY': 'ZGZU', 'ZHYC': 'ZGZU', 'ZHNY': 'ZGZU',
  'ZHXF': 'ZGZU', 'ZHSN': 'ZGZU', 'ZHJZ': 'ZGZU', 'ZHLY': 'ZGZU', 'ZHEC': 'ZGZU',
  // 武汉管制区 ZHWH
  'ZHHH': 'ZHWH', 'ZHSY': 'ZHWH', 'ZHGH': 'ZHWH', 'ZHTM': 'ZHWH',
  // 三亚管制区 ZJSA
  'ZJHK': 'ZJSA', 'ZJSY': 'ZJSA',
  // —— 西北：兰州管制区 ZLHW ——
  'ZLLL': 'ZLHW', 'ZLXN': 'ZLHW', 'ZLHZ': 'ZLHW', 'ZLYL': 'ZLHW', 'ZLDH': 'ZLHW',
  'ZLIC': 'ZLHW', 'ZLGY': 'ZLHW', 'ZLZW': 'ZLHW', 'ZLQY': 'ZLHW', 'ZLSM': 'ZLHW',
  'ZLAK': 'ZLHW', 'ZLJN': 'ZLHW', 'ZLYA': 'ZLHW',
  // 西安管制区 ZLXY
  'ZLXY': 'ZLXY',
  // —— 西南：成都管制区 ZUUU ——
  'ZUUU': 'ZUUU', 'ZUCK': 'ZUUU', 'ZUGY': 'ZUUU', 'ZUMY': 'ZUUU', 'ZUTF': 'ZUUU',
  'ZUNC': 'ZUUU', 'ZUKJ': 'ZUUU', 'ZUXC': 'ZUUU', 'ZULZ': 'ZUUU', 'ZUDX': 'ZUUU',
  'ZUBJ': 'ZUUU', 'ZUSN': 'ZUUU', 'ZUPS': 'ZUUU', 'ZUGZ': 'ZUUU', 'ZUPZ': 'ZUUU',
  // 昆明管制区 ZPKM
  'ZPPP': 'ZPKM', 'ZPLJ': 'ZPKM', 'ZPDQ': 'ZPKM', 'ZPJH': 'ZPKM', 'ZPPX': 'ZPKM',
  'ZPSM': 'ZPKM', 'ZPMS': 'ZPKM', 'ZPYM': 'ZPKM', 'ZPZT': 'ZPKM', 'ZPCZ': 'ZPKM',
  // 拉萨管制区 ZULS
  'ZULS': 'ZULS', 'ZUNZ': 'ZULS', 'ZUNL': 'ZULS', 'ZUBD': 'ZULS',
  // —— 东北：沈阳管制区 ZYSH / 哈尔滨 ZYHB ——
  'ZYTX': 'ZYSH', 'ZYTL': 'ZYSH', 'ZYCC': 'ZYSH', 'ZYQQ': 'ZYSH', 'ZYMJ': 'ZYSH',
  'ZYYJ': 'ZYSH', 'ZYJZ': 'ZYSH', 'ZYDD': 'ZYSH', 'ZYCY': 'ZYSH',
  'ZYHB': 'ZYHB', 'ZYMH': 'ZYHB', 'ZYLD': 'ZYHB', 'ZYHE': 'ZYHB', 'ZYFY': 'ZYHB',
  // —— 新疆：乌鲁木齐管制区 ZWWW-N/S ——
  'ZWWW': 'ZWWW-N', 'ZWTN': 'ZWWW-S', 'ZWSH': 'ZWWW-S', 'ZWKM': 'ZWWW-S',
  'ZWAK': 'ZWWW-N', 'ZWHM': 'ZWWW-S', 'ZWYN': 'ZWWW-S', 'ZWKL': 'ZWWW-S',
  'ZWHZ': 'ZWWW-N', 'ZWDH': 'ZWWW-S', 'ZWKC': 'ZWWW-N', 'ZWBL': 'ZWWW-N',
  'ZWSC': 'ZWWW-S', 'ZWQX': 'ZWWW-S',

  // ==================== 国际常见航点 ====================
  // 日本：东京 FIR RJTG / 福冈 FIR RJBG
  'RJTT': 'RJTG', 'RJAA': 'RJTG', 'RJBB': 'RJTG', 'RJOO': 'RJTG', 'RJGG': 'RJTG',
  'RJSS': 'RJTG', 'RJNK': 'RJTG', 'RJNS': 'RJTG', 'RJSN': 'RJTG', 'RJSF': 'RJTG',
  'RJFF': 'RJBG', 'RJFU': 'RJBG', 'RJOA': 'RJBG', 'RJOK': 'RJBG', 'RJFR': 'RJBG',
  // 韩国：仁川 FIR RKRR
  'RKSI': 'RKRR', 'RKSS': 'RKRR', 'RKPC': 'RKRR', 'RKTU': 'RKRR', 'RKPK': 'RKRR',
  'RKNY': 'RKRR', 'RKPS': 'RKRR', 'RKJB': 'RKRR',
  // 台湾：台北 FIR RCAA
  'RCTP': 'RCAA', 'RCSS': 'RCAA', 'RCKH': 'RCAA', 'RCMQ': 'RCAA',
  // 港澳：香港 FIR VHHK
  'VHHH': 'VHHK', 'VMMC': 'VHHK',
  // 新加坡 / 马来西亚：新加坡 WSJC、吉隆坡 WMFC
  'WSSS': 'WSJC', 'WMSA': 'WMFC', 'WMKK': 'WMFC',
  // 泰国：曼谷 FIR VTBB
  'VTBS': 'VTBB', 'VTBD': 'VTBB', 'VTSP': 'VTBB', 'VTCC': 'VTBB', 'VTUD': 'VTBB',
  // 越南：河内 VVHM、胡志明 VVHN
  'VVNB': 'VVHM', 'VVTS': 'VVHN', 'VVDN': 'VVHN', 'VVCR': 'VVHN',
  // 印尼：雅加达 WAAF、东部 WIIF
  'WIII': 'WAAF', 'WADD': 'WIIF',
  // 中东：阿联酋 OMAE、卡塔尔 OTDF、沙特 OEJD、约旦 OJAC
  'OMDB': 'OMAE', 'OMAA': 'OMAE', 'OMSJ': 'OMAE', 'OTHH': 'OTDF',
  'OERK': 'OEJD', 'OEJN': 'OEJD', 'OJAI': 'OJAC',
  // 欧洲
  'EGLL': 'EGTT', 'EGKK': 'EGTT', 'EGGD': 'EGTT', 'EGPH': 'EGPX', 'EGPD': 'EGPX',
  'EIDW': 'EIDW', 'LFPG': 'LFFF', 'LFPO': 'LFFF', 'LFLL': 'LFFF', 'LFMN': 'LFFF',
  'EDDF': 'EDGG', 'EDDL': 'EDGG', 'EDDS': 'EDWW', 'EDDM': 'EDMM',
  'EHAM': 'EHAA', 'EBBR': 'EBBU', 'LIRF': 'LIRR', 'LIML': 'LIRR', 'LIRN': 'LIRR',
  'LEMD': 'LECB', 'LEBL': 'LECB', 'LPPT': 'LPPC',
  // 美国（ARTCC）
  'KLAX': 'KZLA', 'KSAN': 'KZLA', 'KLAS': 'KZLA',
  'KSFO': 'KZOA', 'KOAK': 'KZOA', 'KSJC': 'KZOA',
  'KSEA': 'KZSE', 'KPDX': 'KZSE', 'KPHX': 'KZAB', 'KDEN': 'KZDV', 'KSLC': 'KZLC',
  'KORD': 'KZAU', 'KMDW': 'KZAU', 'KATL': 'KZTL', 'KJFK': 'KZNY', 'KLGA': 'KZNY',
  'KEWR': 'KZNY', 'KPHL': 'KZNY', 'KIAD': 'KZDC', 'KDCA': 'KZDC', 'KBWI': 'KZDC',
  'KMIA': 'KZMA', 'KFLL': 'KZMA', 'KTPA': 'KZMA', 'KIAH': 'KZHU', 'KHOU': 'KZHU',
  'KDFW': 'KZFW', 'KDAL': 'KZFW', 'KBOS': 'KZBW', 'KMSP': 'KZMP', 'KDTW': 'KZOB',
  'KCLE': 'KZOB', 'KCMH': 'KZOB', 'KMEM': 'KZME', 'KSTL': 'KZKC', 'KMCI': 'KZKC',
}

/**
 * 获取 FIR 中心点（优先使用 VATSpy 的 label 坐标，避免平均点漂移）
 */
function getFirCenter(fir) {
  const coords = fir.geometry.coordinates[0]
  const lblLat = parseFloat(fir.properties.label_lat)
  const lblLon = parseFloat(fir.properties.label_lon)
  if (!Number.isNaN(lblLat) && !Number.isNaN(lblLon)) {
    return { lat: lblLat, lon: lblLon }
  }
  let sumLat = 0, sumLon = 0
  for (const c of coords) { sumLat += c[1]; sumLon += c[0] }
  return { lat: sumLat / coords.length, lon: sumLon / coords.length }
}

/**
 * 查找 FIR（通过管制呼号或机场匹配）
 * 匹配优先级：呼号直配 → 机场映射表 → 机场本身是 FIR → 前缀兜底
 */
function findFir(callsign, airportIcao) {
  const firs = loadFirBoundaries()
  if (!firs?.features) return null

  // 按真实席位解析扇区标识: ZBAA_CTR → ZBAA; ZBAA_N_CTR / ZBAA-N_CTR → ZBAA-N
  const sector = String(callsign || '').toUpperCase()
    .replace(/_CTR$/, '')   // 去 _CTR 后缀
    .replace(/_/g, '-')     // 下划线子扇区转连字符(匹配 VATSpy FIR id 格式)

  // 1) 真实席位直接命中扇区/管制区边界(如 ZBAA_CTR → ZBAA, ZBAA_N_CTR → ZBAA-N)
  if (sector && firs.byId?.has(sector)) {
    return firs.byId.get(sector)
  }

  // 2) 子扇区回退: 完整扇区(如 ZBAA-SW)未命中时, 去掉子扇区后缀回退到主区(ZBAA)显示
  if (sector && sector.includes('-')) {
    const main = sector.split('-')[0]
    if (firs.byId?.has(main)) {
      return firs.byId.get(main)
    }
  }

  // 3) 机场 → FIR 映射表（中国区域）
  if (airportIcao) {
    const mapped = AIRPORT_TO_FIR[airportIcao]
    if (mapped && firs.byId?.has(mapped)) {
      return firs.byId.get(mapped)
    }
  }

  // 4) 机场 ICAO 本身就是 FIR id（如 ZUUU_CTR → ZUUU）
  if (airportIcao && firs.byId?.has(airportIcao)) {
    return firs.byId.get(airportIcao)
  }

  // 5) 前两位前缀匹配（跳过子扇区），作为最后兜底
  if (airportIcao) {
    const prefix = airportIcao.slice(0, 2)
    for (const f of firs.features) {
      const id = f.properties.id
      if (id.startsWith(prefix) && !id.includes('-')) {
        return f
      }
    }
  }

  return null
}

/**
 * 获取机场坐标（从 FSD 追踪器或空数据）
 * @param {string} icao
 * @returns {{lat: number, lon: number}|null}
 */
function getAirportPosition(icao) {
  // 中国主要机场坐标
  const airports = {
    'ZBAA': { lat: 40.08, lon: 116.58 },
    'ZBTJ': { lat: 39.12, lon: 117.35 },
    'ZSSS': { lat: 31.14, lon: 121.81 },
    'ZSPD': { lat: 31.14, lon: 121.80 },
    'ZGGG': { lat: 23.39, lon: 113.31 },
    'ZGSZ': { lat: 22.64, lon: 113.81 },
    'ZUUU': { lat: 30.58, lon: 103.95 },
    'ZUCK': { lat: 29.72, lon: 106.64 },
    'ZLXY': { lat: 34.44, lon: 108.75 },
    'ZPPP': { lat: 25.02, lon: 102.74 },
    'ZHHH': { lat: 30.78, lon: 114.21 },
    'ZGHA': { lat: 28.19, lon: 113.22 },
    'ZSHC': { lat: 30.23, lon: 120.43 },
    'ZSNB': { lat: 29.82, lon: 121.46 },
    'ZSNJ': { lat: 31.74, lon: 118.87 },
    'ZSAM': { lat: 24.54, lon: 118.13 },
    'ZSFZ': { lat: 25.93, lon: 119.66 },
    'ZYTX': { lat: 41.64, lon: 123.48 },
    'ZYHB': { lat: 45.62, lon: 126.25 },
    'ZWWW': { lat: 43.91, lon: 87.47 },
    'ZULS': { lat: 29.30, lon: 90.91 },
    'ZUGY': { lat: 26.54, lon: 106.80 },
    'ZGNN': { lat: 22.61, lon: 108.17 },
    'ZJHK': { lat: 19.94, lon: 110.46 },
    'ZJSY': { lat: 18.30, lon: 109.41 },
    'ZPLJ': { lat: 26.68, lon: 100.25 },
    'ZPDQ': { lat: 27.54, lon: 100.06 },
    'ZBAD': { lat: 39.51, lon: 116.41 },
  }
  return airports[icao] || null
}

/**
 * 为单个管制员生成区域边界
 */
function getControllerBoundary(controller) {
  const callsign = controller.callsign || ''
  const info = parseControllerType(callsign)
  const icao = extractAirportIcao(callsign)
  let polygon = null
  let center = null

  // 获取机场坐标
  const ap = icao ? getAirportPosition(icao) : null
  center = ap || { lat: controller.lat || 35, lon: controller.lon || 110 }

  if (info.type === 'CTR') {
    // === 区域管制：使用 FIR 多边形（大片空域） ===
    const fir = findFir(callsign, icao)
    if (fir) {
      const coords = fir.geometry.coordinates[0]
      return {
        callsign, type: 'CTR',
        label: fir.properties.name || fir.properties.id,
        icao: fir.properties.id,
        polygon: coords.map(c => ({ lon: c[0], lat: c[1] })),
        centerPoint: getFirCenter(fir),
        strokeColor: '#d6e41c', strokeWeight: 1.5, strokeOpacity: 0.5,
        fillColor: '#2e7d32', fillOpacity: 0.2, strokeDash: false,
      }
    }
    // 无 FIR 数据时的备用
  } else if (info.type === 'APP') {
    // === 进近管制：80km 多边形扇区（12边，看起来像空域区块而非圆形） ===
    const poly = createSectorPolygon(center.lat, center.lon, 80, 12)
    return {
      callsign, type: 'APP',
      label: `${callsign} (APP)`,
      icao: icao || '',
      polygon: poly,
      centerPoint: center,
      strokeColor: '#920197', strokeWeight: 1.5, strokeOpacity: 0.45,
      fillColor: '#1976d2', fillOpacity: 0.18, strokeDash: true,
      radiusKm: 80,
    }
  } else if (info.type === 'TWR') {
    // === 塔台管制：仅显示点位 ===
    return {
      callsign, type: 'TWR',
      label: `${callsign} (TWR)`,
      icao: icao || '',
      point: center,
      strokeColor: '#c92121',
    }
  } else if (info.type === 'GND') {
    return {
      callsign, type: 'GND',
      label: `${callsign} (GND)`,
      icao: icao || '',
      point: center,
      strokeColor: '#1fd67b',
    }
  } else if (info.type === 'DEL') {
    return {
      callsign, type: 'DEL',
      label: `${callsign} (DEL)`,
      icao: icao || '',
      point: center,
      strokeColor: '#00bcd4',
    }
  } else if (info.type === 'FSS') {
    // === 飞行服务站：尝试匹配 FIR 数据(如 PRC_FSS → PRC-FSS), 未命中则不显示 ===
    const fir = findFir(callsign, icao)
    if (fir) {
      const coords = fir.geometry.coordinates[0]
      return {
        callsign, type: 'FSS',
        label: fir.properties.name || fir.properties.id,
        icao: fir.properties.id,
        polygon: coords.map(c => ({ lon: c[0], lat: c[1] })),
        centerPoint: getFirCenter(fir),
        strokeColor: '#d6e41c', strokeWeight: 1.5, strokeOpacity: 0.5,
        fillColor: '#6a1b9a', fillOpacity: 0.2, strokeDash: false,
      }
    }
    return null
  } else {
    // === 未知类型：仅返回点位 ===
    return {
      callsign, type: info.type,
      label: callsign,
      icao: icao || '',
      point: center,
      strokeColor: '#546e7a',
    }
  }

  // CTR 无 FIR 数据时的备用：仅点位
  return {
    callsign, type: 'CTR',
    label: callsign,
    icao: icao || '',
    point: center,
    strokeColor: '#2e7d32',
  }
}

/**
 * 为所有在线管制员生成区域边界
 * @param {Array} controllers - 管制员列表
 * @returns {Array}
 */
export function getControllerBoundaries(controllers) {
  if (!controllers || !Array.isArray(controllers)) return []
  // 连飞地图不显示 OBS（实习管制）席位：呼号强制带 _OBS 后缀（如 1234_OBS）
  const visible = controllers.filter(c => !/^.*_OBS$/i.test((c.callsign || '').trim()))
  const results = visible
    .map(c => getControllerBoundary(c))
    .filter(b => b && ((b.polygon && b.polygon.length >= 3) || b.point))

  const ctrList = results.filter(b => b.type === 'CTR' && b.polygon?.length >= 3)
  const others = results.filter(b => b.type !== 'CTR')

  if (ctrList.length > 1) {
    try {
      const toRing = p => p.map(pt => [pt.lon, pt.lat])
      const closeRing = r => (r.length && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) ? r : [...r, r[0]]
      let merged = turf.polygon([closeRing(toRing(ctrList[0].polygon))])
      for (let i = 1; i < ctrList.length; i++) {
        merged = turf.union(merged, turf.polygon([closeRing(toRing(ctrList[i].polygon))]))
      }
      const outer = merged.geometry.coordinates[0]
      const center = turf.center(merged).geometry.coordinates
      const mergedCtr = {
        callsign: 'CTR', type: 'CTR',
        label: '管制区边界',
        icao: '',
        polygon: outer.map(c => ({ lon: c[0], lat: c[1] })),
        centerPoint: { lat: center[1], lon: center[0] },
        strokeColor: '#2e7d32', strokeWeight: 1.5, strokeOpacity: 0.5,
        fillColor: '#2e7d32', fillOpacity: 0.2, strokeDash: false,
      }
      return [mergedCtr, ...others]
    } catch (e) {
      // union 失败：回退为原样边界
    }
  }
  return results
}
