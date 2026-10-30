/**
 * 机场数据批量导入脚本
 * 运行: node scripts/seed-airports.js
 *
 * 数据来源: OpenFlight / OurAirports 开源数据集
 * 仅包含国内主要机场及常用国际机场
 */

import pkg from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const { PrismaClient } = pkg

const connectionString = (process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/cwfly') + '?allowPublicKeyRetrieval=true'
const adapter = new PrismaMariaDb(connectionString)
const prisma = new PrismaClient({ adapter })

const AIRPORTS = [
  // ========== 华北地区 ==========
  { icao: 'ZBAA', name: '北京首都国际机场', iata: 'PEK', city: '北京', lat: 40.0799, lon: 116.6031, alt: 116 },
  { icao: 'ZBAD', name: '北京大兴国际机场', iata: 'PKX', city: '北京', lat: 39.5098, lon: 116.4105, alt: 98 },
  { icao: 'ZBTJ', name: '天津滨海国际机场', iata: 'TSN', city: '天津', lat: 39.1244, lon: 117.3462, alt: 10 },
  { icao: 'ZBSJ', name: '石家庄正定国际机场', iata: 'SJW', city: '石家庄', lat: 38.2807, lon: 114.6973, alt: 71 },
  { icao: 'ZBHH', name: '呼和浩特白塔国际机场', iata: 'HET', city: '呼和浩特', lat: 40.8500, lon: 111.8233, alt: 1084 },
  { icao: 'ZBYN', name: '太原武宿国际机场', iata: 'TYN', city: '太原', lat: 37.7469, lon: 112.6284, alt: 785 },
  { icao: 'ZBDT', name: '大同云冈机场', iata: 'DAT', city: '大同', lat: 40.0603, lon: 113.4823, alt: 1054 },

  // ========== 华东地区 ==========
  { icao: 'ZSSS', name: '上海虹桥国际机场', iata: 'SHA', city: '上海', lat: 31.1979, lon: 121.3363, alt: 10 },
  { icao: 'ZSPD', name: '上海浦东国际机场', iata: 'PVG', city: '上海', lat: 31.1434, lon: 121.8053, alt: 4 },
  { icao: 'ZSNJ', name: '南京禄口国际机场', iata: 'NKG', city: '南京', lat: 31.7420, lon: 118.8620, alt: 15 },
  { icao: 'ZSHC', name: '杭州萧山国际机场', iata: 'HGH', city: '杭州', lat: 30.2295, lon: 120.4344, alt: 7 },
  { icao: 'ZSNB', name: '宁波栎社国际机场', iata: 'NGB', city: '宁波', lat: 29.8267, lon: 121.4619, alt: 4 },
  { icao: 'ZSOF', name: '合肥新桥国际机场', iata: 'HFE', city: '合肥', lat: 31.9889, lon: 116.9789, alt: 63 },
  { icao: 'ZSQD', name: '青岛胶东国际机场', iata: 'TAO', city: '青岛', lat: 36.2661, lon: 120.3744, alt: 10 },
  { icao: 'ZSJN', name: '济南遥墙国际机场', iata: 'TNA', city: '济南', lat: 36.8572, lon: 117.2161, alt: 23 },
  { icao: 'ZSFZ', name: '福州长乐国际机场', iata: 'FOC', city: '福州', lat: 25.9333, lon: 119.6667, alt: 14 },
  { icao: 'ZSAM', name: '厦门高崎国际机场', iata: 'XMN', city: '厦门', lat: 24.5439, lon: 118.1275, alt: 18 },
  { icao: 'ZSWZ', name: '温州龙湾国际机场', iata: 'WNZ', city: '温州', lat: 27.9122, lon: 120.8517, alt: 6 },
  { icao: 'ZSCN', name: '南昌昌北国际机场', iata: 'KHN', city: '南昌', lat: 28.8650, lon: 115.9000, alt: 44 },

  // ========== 华南地区 ==========
  { icao: 'ZGGG', name: '广州白云国际机场', iata: 'CAN', city: '广州', lat: 23.3925, lon: 113.2988, alt: 50 },
  { icao: 'ZGSZ', name: '深圳宝安国际机场', iata: 'SZX', city: '深圳', lat: 22.6394, lon: 113.8142, alt: 13 },
  { icao: 'ZGHA', name: '长沙黄花国际机场', iata: 'CSX', city: '长沙', lat: 28.1892, lon: 113.2200, alt: 66 },
  { icao: 'ZGNN', name: '南宁吴圩国际机场', iata: 'NNG', city: '南宁', lat: 22.6083, lon: 108.1725, alt: 128 },
  { icao: 'ZGSD', name: '珠海金湾机场', iata: 'ZUH', city: '珠海', lat: 22.0069, lon: 113.3747, alt: 7 },
  { icao: 'ZGHK', name: '海口美兰国际机场', iata: 'HAK', city: '海口', lat: 19.7933, lon: 110.4525, alt: 23 },
  { icao: 'ZJHK', name: '海口美兰国际机场', iata: 'HAK', city: '海口', lat: 19.9349, lon: 110.4590, alt: 23 },
  { icao: 'ZJSY', name: '三亚凤凰国际机场', iata: 'SYX', city: '三亚', lat: 18.3029, lon: 109.4122, alt: 28 },
  { icao: 'ZGKL', name: '桂林两江国际机场', iata: 'KWL', city: '桂林', lat: 25.2181, lon: 110.0392, alt: 174 },

  // ========== 华中地区 ==========
  { icao: 'ZHHH', name: '武汉天河国际机场', iata: 'WUH', city: '武汉', lat: 30.7838, lon: 114.2081, alt: 34 },
  { icao: 'ZHCC', name: '郑州新郑国际机场', iata: 'CGO', city: '郑州', lat: 34.5197, lon: 113.8408, alt: 151 },
  { icao: 'ZGDY', name: '张家界荷花国际机场', iata: 'DYG', city: '张家界', lat: 29.1028, lon: 110.4417, alt: 218 },

  // ========== 西南地区 ==========
  { icao: 'ZUUU', name: '成都天府国际机场', iata: 'TFU', city: '成都', lat: 30.3197, lon: 104.4417, alt: 440 },
  { icao: 'ZUCK', name: '重庆江北国际机场', iata: 'CKG', city: '重庆', lat: 29.7192, lon: 106.6417, alt: 416 },
  { icao: 'ZPPP', name: '昆明长水国际机场', iata: 'KMG', city: '昆明', lat: 25.1019, lon: 102.9292, alt: 2103 },
  { icao: 'ZUGY', name: '贵阳龙洞堡国际机场', iata: 'KWE', city: '贵阳', lat: 26.5383, lon: 106.8014, alt: 1139 },
  { icao: 'ZPLJ', name: '丽江三义机场', iata: 'LJG', city: '丽江', lat: 26.6792, lon: 100.2461, alt: 2240 },
  { icao: 'ZPDQ', name: '迪庆香格里拉机场', iata: 'DIG', city: '香格里拉', lat: 27.7936, lon: 99.6772, alt: 3280 },
  { icao: 'ZLXY', name: '西安咸阳国际机场', iata: 'XIY', city: '西安', lat: 34.4471, lon: 108.7516, alt: 479 },
  { icao: 'ZLLL', name: '兰州中川国际机场', iata: 'LHW', city: '兰州', lat: 36.5152, lon: 103.6200, alt: 1947 },
  { icao: 'ZLIC', name: '银川河东国际机场', iata: 'INC', city: '银川', lat: 38.3217, lon: 106.3925, alt: 1115 },
  { icao: 'ZLXN', name: '西宁曹家堡机场', iata: 'XNN', city: '西宁', lat: 36.5275, lon: 102.0431, alt: 2162 },

  // ========== 西北地区 ==========
  { icao: 'ZWWW', name: '乌鲁木齐地窝堡国际机场', iata: 'URC', city: '乌鲁木齐', lat: 43.9072, lon: 87.4742, alt: 648 },
  { icao: 'ZWSH', name: '喀什徕宁国际机场', iata: 'KHG', city: '喀什', lat: 39.5433, lon: 76.0200, alt: 1389 },

  // ========== 东北地区 ==========
  { icao: 'ZYHB', name: '哈尔滨太平国际机场', iata: 'HRB', city: '哈尔滨', lat: 45.6234, lon: 126.2504, alt: 139 },
  { icao: 'ZYCC', name: '长春龙嘉国际机场', iata: 'CGQ', city: '长春', lat: 43.9959, lon: 125.6850, alt: 216 },
  { icao: 'ZYTX', name: '沈阳桃仙国际机场', iata: 'SHE', city: '沈阳', lat: 41.6401, lon: 123.4834, alt: 60 },
  { icao: 'ZYTL', name: '大连周水子国际机场', iata: 'DLC', city: '大连', lat: 38.9657, lon: 121.5386, alt: 33 },

  // ========== 热门国际 ==========
  { icao: 'VHHH', name: '香港国际机场', iata: 'HKG', city: '香港', lat: 22.3080, lon: 113.9185, alt: 6, country: '中国香港' },
  { icao: 'VMMC', name: '澳门国际机场', iata: 'MFM', city: '澳门', lat: 22.1495, lon: 113.5914, alt: 6, country: '中国澳门' },
  { icao: 'RCTP', name: '台湾桃园国际机场', iata: 'TPE', city: '台北', lat: 25.0764, lon: 121.2239, alt: 33, country: '中国台湾' },
  { icao: 'RCSS', name: '台北松山机场', iata: 'TSA', city: '台北', lat: 25.0697, lon: 121.5525, alt: 6, country: '中国台湾' },
  { icao: 'RJTT', name: '东京羽田机场', iata: 'HND', city: '东京', lat: 35.5494, lon: 139.7798, alt: 6, country: '日本' },
  { icao: 'RJBB', name: '大阪关西国际机场', iata: 'KIX', city: '大阪', lat: 34.4320, lon: 135.2304, alt: 5, country: '日本' },
  { icao: 'RKSI', name: '首尔仁川国际机场', iata: 'ICN', city: '首尔', lat: 37.4602, lon: 126.4407, alt: 7, country: '韩国' },
  { icao: 'RKSS', name: '首尔金浦国际机场', iata: 'GMP', city: '首尔', lat: 37.5583, lon: 126.7906, alt: 18, country: '韩国' },
  { icao: 'WSSS', name: '新加坡樟宜机场', iata: 'SIN', city: '新加坡', lat: 1.3592, lon: 103.9894, alt: 7, country: '新加坡' },
  { icao: 'VTBS', name: '曼谷素万那普机场', iata: 'BKK', city: '曼谷', lat: 13.6811, lon: 100.7472, alt: 2, country: '泰国' },
  { icao: 'WMKK', name: '吉隆坡国际机场', iata: 'KUL', city: '吉隆坡', lat: 2.7456, lon: 101.7099, alt: 21, country: '马来西亚' },
  { icao: 'KLAX', name: '洛杉矶国际机场', iata: 'LAX', city: '洛杉矶', lat: 33.9416, lon: -118.4085, alt: 38, country: '美国' },
  { icao: 'KJFK', name: '纽约肯尼迪机场', iata: 'JFK', city: '纽约', lat: 40.6413, lon: -73.7781, alt: 4, country: '美国' },
  { icao: 'KSFO', name: '旧金山国际机场', iata: 'SFO', city: '旧金山', lat: 37.6213, lon: -122.3790, alt: 4, country: '美国' },
  { icao: 'EGLL', name: '伦敦希思罗机场', iata: 'LHR', city: '伦敦', lat: 51.4700, lon: -0.4543, alt: 25, country: '英国' },
  { icao: 'LFPG', name: '巴黎戴高乐机场', iata: 'CDG', city: '巴黎', lat: 49.0097, lon: 2.5478, alt: 119, country: '法国' },
  { icao: 'EDDF', name: '法兰克福机场', iata: 'FRA', city: '法兰克福', lat: 50.0333, lon: 8.5705, alt: 111, country: '德国' },
  { icao: 'UAAA', name: '阿拉木图机场', iata: 'ALA', city: '阿拉木图', lat: 43.3521, lon: 77.0405, alt: 681, country: '哈萨克斯坦' },
  { icao: 'ZMUB', name: '乌兰巴托成吉思汗机场', iata: 'UBN', city: '乌兰巴托', lat: 47.6469, lon: 106.8197, alt: 1300, country: '蒙古' },
]

async function main() {
  console.log(`开始导入 ${AIRPORTS.length} 个机场...`)
  let imported = 0, skipped = 0

  for (const ap of AIRPORTS) {
    try {
      await prisma.airport.upsert({
        where: { icao: ap.icao },
        update: {
          name: ap.name,
          iata: ap.iata,
          city: ap.city,
          country: ap.country || '中国',
          lat: ap.lat,
          lon: ap.lon,
          elevation: ap.alt || 0,
          timezone: 'Asia/Shanghai',
        },
        create: {
          icao: ap.icao,
          name: ap.name,
          iata: ap.iata,
          city: ap.city,
          country: ap.country || '中国',
          lat: ap.lat,
          lon: ap.lon,
          elevation: ap.alt || 0,
          timezone: 'Asia/Shanghai',
        },
      })
      imported++
      process.stdout.write('.')
    } catch (e) {
      skipped++
      if (skipped <= 3) process.stdout.write(`\n[ERR] ${ap.icao}: ${e.message}`)
      else process.stdout.write('x')
    }
  }

  console.log(`\n✅ 完成！导入 ${imported} 个，跳过 ${skipped} 个`)
  await prisma.$disconnect()
}

main()
