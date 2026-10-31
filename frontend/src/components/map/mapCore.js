/**
 * mapCore.js —— 在线地图页共用常量与地理坐标工具（无状态、纯前置依赖）
 *
 * 职责：
 *  - 高德 / Mapbox / OpenWeatherMap 的访问密钥与静态资源地址；
 *  - 地图初始中心 / 缩放、上下拖动边界；
 *  - WGS84 → GCJ-02（高德火星坐标）转换；
 *  - 地图源分组（3D Mapbox / 2D 平面源）与 is3D 判定。
 *
 * 入参：无。返回：均为具名导出常量/函数。
 * 副作用：无（不触碰 DOM、不注册监听、无定时器），因此无需清理。
 */
import { hasMapboxToken } from '@/utils/mapboxHealth'

export const AMAP_KEY = '89b5c51a7622408a444f2c62a7de6113'
export const AMAP_SECURITY_CODE = 'a20594f2f5e875560ec09be0fca30a1a'
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

/**
 * 当前构建是否配置了「可尝试使用」的 Mapbox 令牌（纯函数，便于单测）。
 * 仅判断非空/非占位符，不代表令牌真实有效；真实有效性由 useOnlineMapInteraction
 * 的 Mapbox error（401/invalid token）监听兜底并回退 2D。
 * @returns {boolean}
 */
export function isMapboxConfigured() {
  return hasMapboxToken(MAPBOX_TOKEN)
}
// OpenWeatherMap 天气雷达（降水图层, 2D/3D 所有地图源通用叠加）
export const OWM_KEY = import.meta.env.VITE_OWM_KEY || ''
export const OWM_RADAR_URL = (z, x, y) => `https://tile.openweathermap.org/map/precipitation_new/${z}/${x}/${y}.png?appid=${OWM_KEY}`
// Mapbox GL 脚本：优先加载本地打包文件（public/vendor/mapbox-gl/），若不存在则使用 CDN
export const MAPBOX_LOCAL_JS = '/vendor/mapbox-gl/mapbox-gl.js'
export const MAPBOX_LOCAL_CSS = '/vendor/mapbox-gl/mapbox-gl.css'
export const MAPBOX_CDN_JS = 'https://api.mapbox.com/mapbox-gl-js/v3.16.0/mapbox-gl.js'
export const MAPBOX_CDN_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.16.0/mapbox-gl.css'
export const REFRESH_INTERVAL = 5000   // 机组位置轮询刷新间隔(5s)
export const MAP_CENTER = [110, 30]    // AMap 使用 [lng, lat]
export const MAP_ZOOM = 5

// ---------------------------------------------------------------------------
// WGS84 -> GCJ-02（高德火星坐标）: Mapbox3D 用 WGS84 准确, 高德底图用 GCJ-02
// 直接传 WGS84 会整体偏移; 基准点验证: WGS84(31.126172,121.794128) -> GCJ02(31.124277,121.798325)
// ---------------------------------------------------------------------------
export const GCJ_A = 6378245.0
export const GCJ_EE = 0.00669342162296594323
export function gcjTransformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0
  return ret
}
export function gcjTransformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0
  return ret
}
// WGS84 经纬度 -> GCJ-02（高德）; 返回 [lng, lat]; 境外(不适用 GCJ) 原样返回
export function toGcj02(lng, lat) {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lng, lat]
  let dLat = gcjTransformLat(lng - 105.0, lat - 35.0)
  let dLng = gcjTransformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - GCJ_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI)
  dLng = (dLng * 180.0) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI)
  return [lng + dLng, lat + dLat]
}

// 地图拖动边界：限制上下
export const BOTTOM_LAT = -85    // 底部（南）边界纬度
export const TOP_LAT = 85      // 顶部（北）边界纬度

// 地图源分组：3D（Mapbox）/ 2D（四个平面地图）
export const layers3D = [
  { id: 'mapbox3d', label: 'MapBox3D' },
  { id: 'mapbox3d_sat', label: 'MapBox3D 卫星' },
]
export const flatLayers = [
  { id: 'gaode', label: '高德地图' },
  { id: 'gaode_sat', label: '高德卫星' },
  { id: 'mapbox', label: 'Mapbox 卫星' },
  { id: 'arcgis', label: 'ArcGIS 卫星' },
]

// 判断是否为 3D 引擎（Mapbox GL globe）
export function is3D(id) { return id === 'mapbox3d' || id === 'mapbox3d_sat' }
