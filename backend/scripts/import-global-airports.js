/**
 * 全球机场数据导入脚本
 *
 * 数据来源: OurAirports (https://ourairports.com/data/)
 * 许可证: Public Domain
 *
 * 运行: node scripts/import-global-airports.js
 *
 * 仅导入有机场 ICAO 代码的机场（large/medium/small airport）
 */

import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import pkg from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const { PrismaClient } = pkg

const connectionString = (process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/cwfly') + '?allowPublicKeyRetrieval=true'
const adapter = new PrismaMariaDb(connectionString)
const prisma = new PrismaClient({ adapter })

const CSV_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv'

// 只导入这些类型的机场（有实际跑道/设施的）
const VALID_TYPES = new Set([
  'large_airport',
  'medium_airport',
  'small_airport',
  // 可选: 'heliport', 'seaplane_base', 'closed' 等不导入
])

const COUNTRY_NAMES = {
  CN: '中国', US: '美国', JP: '日本', KR: '韩国', GB: '英国',
  FR: '法国', DE: '德国', IT: '意大利', ES: '西班牙', NL: '荷兰',
  CH: '瑞士', SE: '瑞典', NO: '挪威', DK: '丹麦', FI: '芬兰',
  RU: '俄罗斯', AU: '澳大利亚', NZ: '新西兰', CA: '加拿大',
  BR: '巴西', AR: '阿根廷', IN: '印度', TH: '泰国', SG: '新加坡',
  MY: '马来西亚', ID: '印度尼西亚', PH: '菲律宾', VN: '越南',
  AE: '阿联酋', SA: '沙特阿拉伯', TR: '土耳其', IL: '以色列',
  EG: '埃及', ZA: '南非', MX: '墨西哥', PT: '葡萄牙',
  AT: '奥地利', BE: '比利时', PL: '波兰', CZ: '捷克', HU: '匈牙利',
  IE: '爱尔兰', GR: '希腊', RO: '罗马尼亚', UA: '乌克兰',
  HK: '中国香港', MO: '中国澳门', TW: '中国台湾',
  KZ: '哈萨克斯坦', MN: '蒙古', LA: '老挝', KH: '柬埔寨',
  MM: '缅甸', NP: '尼泊尔', LK: '斯里兰卡', BD: '孟加拉国',
  PK: '巴基斯坦', UZ: '乌兹别克斯坦', QA: '卡塔尔', KW: '科威特',
  OM: '阿曼', BH: '巴林', KE: '肯尼亚', NG: '尼日利亚', MA: '摩洛哥',
  CL: '智利', CO: '哥伦比亚', PE: '秘鲁',
}

async function* streamCSV() {
  console.log('正在流式下载机场数据 (airports.csv)...')
  const resp = await fetch(CSV_URL, { signal: AbortSignal.timeout(120000) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) yield line
  }
  if (buffer.trim()) yield buffer
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += ch
  }
  result.push(current.trim())
  return result
}

async function main() {
  let imported = 0, errors = 0, total = 0, header = true
  const batch = []
  const batchSize = 100

  const stream = streamCSV()
  for await (const line of stream) {
    if (!line.trim()) continue
    const fields = parseCSVLine(line)
    if (header) { header = false; continue }

    const type = fields[2]
    const icao = (fields[12] || '').toUpperCase().trim()

    if (!icao || !VALID_TYPES.has(type)) continue
    if (!/^[A-Z]{4}$/.test(icao)) continue

    const iata = (fields[13] || '').trim()
    const name = fields[3] || ''
    const lat = parseFloat(fields[4]) || 0
    const lon = parseFloat(fields[5]) || 0
    const elevM = Math.round((parseFloat(fields[6]) || 0) * 0.3048)
    const country = COUNTRY_NAMES[fields[8]] || fields[8]
    const city = fields[10] || ''

    batch.push({
      icao, name, iata, city, country, lat, lon, elevation: elevM,
    })
    total++

    if (batch.length >= batchSize) {
      const results = await Promise.allSettled(
        batch.map(ap =>
          prisma.airport.upsert({
            where: { icao: ap.icao },
            update: { name: ap.name, iata: ap.iata, city: ap.city, country: ap.country, lat: ap.lat, lon: ap.lon, elevation: ap.elevation },
            create: { icao: ap.icao, name: ap.name, iata: ap.iata, city: ap.city, country: ap.country, lat: ap.lat, lon: ap.lon, elevation: ap.elevation, timezone: '' },
          })
        )
      )
      for (const r of results) {
        if (r.status === 'fulfilled') imported++
        else { errors++; if (errors <= 3) console.log(`\n[ERR] ${r.reason?.message?.slice(0, 80)}`) }
      }
      batch.length = 0
      process.stdout.write(`\r  处理: ${total} 个 | 导入: ${imported} | 错误: ${errors}`)
    }
  }

  // 处理最后一批
  if (batch.length > 0) {
    const results = await Promise.allSettled(
      batch.map(ap =>
        prisma.airport.upsert({
          where: { icao: ap.icao },
          update: { name: ap.name, iata: ap.iata, city: ap.city, country: ap.country, lat: ap.lat, lon: ap.lon, elevation: ap.elevation },
          create: { icao: ap.icao, name: ap.name, iata: ap.iata, city: ap.city, country: ap.country, lat: ap.lat, lon: ap.lon, elevation: ap.elevation, timezone: '' },
        })
      )
    )
    for (const r of results) {
      if (r.status === 'fulfilled') imported++
      else errors++
    }
  }

  console.log(`\n✅ 完成！共 ${total} 个机场, 导入 ${imported} 个${errors > 0 ? `, ${errors} 个错误` : ''}`)
  await prisma.$disconnect()
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
