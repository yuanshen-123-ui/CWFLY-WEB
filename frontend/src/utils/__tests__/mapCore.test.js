/**
 * mapCore.js 单元测试（地图页纯常量 / 坐标换算 / 图层定义）
 *
 * 覆盖点：
 * - 密钥与静态资源常量、Mapbox 本地/CDN 地址、轮询间隔与地图初始中心/缩放
 * - VITE_MAPBOX_TOKEN / VITE_OWM_KEY 的 env 读取（含空值回退空串）—— 用 vi.stubEnv + 模块重载验证
 * - GCJ-02 换算：gcjTransformLat/Lng 的真实数值、toGcj02 在上海/北京基准点的偏移量、
 *   境外与经纬度边界（72.004~137.8347 / 0.8293~55.8271）原样返回、确定性（同一入参结果稳定）
 * - 图层分组结构（3D 两条 / 2D 四条、id 唯一、label 非空）与 is3D 判定
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  AMAP_KEY,
  AMAP_SECURITY_CODE,
  MAPBOX_TOKEN,
  OWM_KEY,
  OWM_RADAR_URL,
  MAPBOX_LOCAL_JS,
  MAPBOX_LOCAL_CSS,
  MAPBOX_CDN_JS,
  MAPBOX_CDN_CSS,
  REFRESH_INTERVAL,
  MAP_CENTER,
  MAP_ZOOM,
  isMapboxConfigured,
  GCJ_A,
  GCJ_EE,
  gcjTransformLat,
  gcjTransformLng,
  toGcj02,
  BOTTOM_LAT,
  TOP_LAT,
  layers3D,
  flatLayers,
  is3D,
} from '@/components/map/mapCore.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('常量与静态资源', () => {
  it('高德密钥为 32 位小写十六进制字符串', () => {
    expect(AMAP_KEY).toMatch(/^[0-9a-f]{32}$/)
    expect(AMAP_SECURITY_CODE).toMatch(/^[0-9a-f]{32}$/)
    expect(AMAP_KEY).not.toBe(AMAP_SECURITY_CODE)
  })

  it('Mapbox 本地路径与 CDN 地址固定（CDN 带版本号 v3.16.0）', () => {
    expect(MAPBOX_LOCAL_JS).toBe('/vendor/mapbox-gl/mapbox-gl.js')
    expect(MAPBOX_LOCAL_CSS).toBe('/vendor/mapbox-gl/mapbox-gl.css')
    expect(MAPBOX_CDN_JS).toBe('https://api.mapbox.com/mapbox-gl-js/v3.16.0/mapbox-gl.js')
    expect(MAPBOX_CDN_CSS).toBe('https://api.mapbox.com/mapbox-gl-js/v3.16.0/mapbox-gl.css')
  })

  it('轮询间隔 5s、初始中心 [110,30]、缩放 5、上下拖动边界 ±85', () => {
    expect(REFRESH_INTERVAL).toBe(5000)
    expect(MAP_CENTER).toEqual([110, 30])
    expect(MAP_ZOOM).toBe(5)
    expect(BOTTOM_LAT).toBe(-85)
    expect(TOP_LAT).toBe(85)
    expect(BOTTOM_LAT).toBeLessThan(TOP_LAT)
  })

  it('OWM 雷达瓦片 URL 按 z/x/y 拼接且携带 appid', () => {
    expect(OWM_RADAR_URL(3, 4, 5)).toBe(
      `https://tile.openweathermap.org/map/precipitation_new/3/4/5.png?appid=${OWM_KEY}`,
    )
    expect(OWM_RADAR_URL(0, 0, 0)).toContain('/precipitation_new/0/0/0.png?appid=')
  })
})

describe('env 读取（VITE_MAPBOX_TOKEN / VITE_OWM_KEY）', () => {
  it('未配置时回退空串，isMapboxConfigured() 为 false', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')
    vi.stubEnv('VITE_OWM_KEY', '')
    vi.resetModules()
    const core = await import('@/components/map/mapCore.js')
    expect(core.MAPBOX_TOKEN).toBe('')
    expect(core.OWM_KEY).toBe('')
    expect(core.isMapboxConfigured()).toBe(false)
  })

  it('配置后从 import.meta.env 读取到真实值，isMapboxConfigured() 为 true', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test-token-123')
    vi.stubEnv('VITE_OWM_KEY', 'owm-key-abc')
    vi.resetModules()
    const core = await import('@/components/map/mapCore.js')
    expect(core.MAPBOX_TOKEN).toBe('pk.test-token-123')
    expect(core.OWM_KEY).toBe('owm-key-abc')
    expect(core.isMapboxConfigured()).toBe(true)
    expect(core.OWM_RADAR_URL(1, 2, 3)).toBe(
      'https://tile.openweathermap.org/map/precipitation_new/1/2/3.png?appid=owm-key-abc',
    )
  })

  it('isMapboxConfigured() 复用 mapboxHealth 的占位符判定：占位符 token 视为未配置', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'your-token')
    vi.resetModules()
    const core = await import('@/components/map/mapCore.js')
    expect(core.MAPBOX_TOKEN).toBe('your-token')
    expect(core.isMapboxConfigured()).toBe(false)
  })

  it('静态导入的 MAPBOX_TOKEN 与当前 env 状态一致（默认无 token）', () => {
    // 该文件在 env 未 stub 时被静态导入，默认值应为空串而不是 undefined
    expect(MAPBOX_TOKEN).toBe('')
    expect(OWM_KEY).toBe('')
    expect(isMapboxConfigured()).toBe(false)
  })
})

describe('GCJ-02 换算', () => {
  it('GCJ 椭球常量与国测局公开值一致', () => {
    expect(GCJ_A).toBe(6378245.0)
    // 写成最短往返表示（0.00669342162296594323 与 0.006693421622965943 是同一个 double），
    // 避免全站 lint 的 no-loss-of-precision 误报
    expect(GCJ_EE).toBe(0.006693421622965943)
  })

  it('gcjTransformLat / gcjTransformLng 在原点返回真实数值', () => {
    // x = lng-105, y = lat-35；x=y=0 时只剩常数项与 sin(0) 项
    expect(gcjTransformLat(0, 0)).toBe(-100)
    expect(gcjTransformLng(0, 0)).toBe(300)
  })

  it('gcjTransformLat / gcjTransformLng 在一般入参下的精确值', () => {
    expect(gcjTransformLat(1, 2)).toBeCloseTo(29.981838142040331, 10)
    expect(gcjTransformLng(1, 2)).toBeCloseTo(375.28160793136783, 10)
    expect(gcjTransformLat(-3, 4.5)).toBeCloseTo(92.611533573821063, 10)
    expect(gcjTransformLng(-3, 4.5)).toBeCloseTo(173.20912808711265, 10)
  })

  it('上海基准点：WGS84(121.794128,31.126172) → GCJ-02 偏移约 +0.0043 / -0.0021', () => {
    const [lng, lat] = toGcj02(121.794128, 31.126172)
    expect(lng).toBeCloseTo(121.79844082621837, 10)
    expect(lat).toBeCloseTo(31.124070238547009, 10)
    // 偏移量方向：东偏、南偏，且国内偏移量级在 0.001~0.01 度之间
    expect(lng - 121.794128).toBeGreaterThan(0.001)
    expect(lng - 121.794128).toBeLessThan(0.01)
    expect(lat - 31.126172).toBeLessThan(-0.001)
    expect(lat - 31.126172).toBeGreaterThan(-0.01)
  })

  it('北京基准点换算结果与参考实现一致', () => {
    const [lng, lat] = toGcj02(116.397128, 39.916527)
    expect(lng).toBeCloseTo(116.40337249402477, 10)
    expect(lat).toBeCloseTo(39.917930749245947, 10)
  })

  it('境外坐标（0,0 / 美国 / 欧洲）原样返回', () => {
    expect(toGcj02(0, 0)).toEqual([0, 0])
    expect(toGcj02(-122.4194, 37.7749)).toEqual([-122.4194, 37.7749])
    expect(toGcj02(2.3522, 48.8566)).toEqual([2.3522, 48.8566])
  })

  it('中国范围边界：含边界值做偏移，越界 1e-4 度原样返回', () => {
    // 下界
    expect(toGcj02(72.004, 30)[0]).not.toBe(72.004)
    expect(toGcj02(72.0039, 30)).toEqual([72.0039, 30])
    expect(toGcj02(110, 0.8293)[1]).not.toBe(0.8293)
    expect(toGcj02(110, 0.8292)).toEqual([110, 0.8292])
    // 上界
    expect(toGcj02(137.8347, 30)[0]).not.toBe(137.8347)
    expect(toGcj02(137.8348, 30)).toEqual([137.8348, 30])
    expect(toGcj02(110, 55.8271)[1]).not.toBe(55.8271)
    expect(toGcj02(110, 55.8272)).toEqual([110, 55.8272])
  })

  it('换算确定：同一坐标多次调用结果完全一致；越界不做任何舍入', () => {
    const a = toGcj02(110, 30)
    const b = toGcj02(110, 30)
    expect(a).toEqual(b)
    expect(a[0]).toBeCloseTo(110.00485783364245, 10)
    expect(a[1]).toBeCloseTo(29.997396065782176, 10)
    // 越界分支是恒等映射（不是只差 float 精度）
    expect(toGcj02(180, 89)).toEqual([180, 89])
  })
})

describe('图层分组与 is3D', () => {
  it('3D 分组两条，2D 分组四条，id/label 结构完整且 id 全局唯一', () => {
    expect(layers3D).toHaveLength(2)
    expect(flatLayers).toHaveLength(4)

    const all = [...layers3D, ...flatLayers]
    all.forEach((layer) => {
      expect(typeof layer.id).toBe('string')
      expect(layer.id.length).toBeGreaterThan(0)
      expect(typeof layer.label).toBe('string')
      expect(layer.label.length).toBeGreaterThan(0)
    })
    const ids = all.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('分组内容与产品定义一致', () => {
    expect(layers3D.map((l) => l.id)).toEqual(['mapbox3d', 'mapbox3d_sat'])
    expect(layers3D.map((l) => l.label)).toEqual(['MapBox3D', 'MapBox3D 卫星'])
    expect(flatLayers.map((l) => l.id)).toEqual(['gaode', 'gaode_sat', 'mapbox', 'arcgis'])
    expect(flatLayers.map((l) => l.label)).toEqual([
      '高德地图',
      '高德卫星',
      'Mapbox 卫星',
      'ArcGIS 卫星',
    ])
  })

  it('is3D 仅对两个 Mapbox 3D 源返回 true，其它输入一律 false', () => {
    expect(is3D('mapbox3d')).toBe(true)
    expect(is3D('mapbox3d_sat')).toBe(true)
    flatLayers.forEach((l) => expect(is3D(l.id)).toBe(false))
    expect(is3D('')).toBe(false)
    expect(is3D(undefined)).toBe(false)
    expect(is3D(null)).toBe(false)
    expect(is3D('mapbox3d ')).toBe(false)
  })
})
