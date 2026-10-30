<template>
  <div class="map-full">
    <div class="map-switcher" @mouseleave="scheduleCollapse">
      <button
        class="sw-btn sw-main"
        @mouseenter="showPanel"
        @click="showPanel"
      >{{ mainBtnLabel }} <span class="sw-caret">▾</span></button>
      <Transition name="panel">
        <div v-if="panelOpen" class="sw-panel" @mouseenter="cancelCollapse">
          <div class="sw-group">
            <span class="sw-group-title">3D</span>
            <button
              v-for="m in layers3D" :key="m.id"
              class="sw-btn sw-item"
              :class="{ active: activeLayer === m.id }"
              @click="selectLayer(m.id)"
            >{{ m.label }}</button>
          </div>
          <div class="sw-group">
            <span class="sw-group-title">2D</span>
            <button
              v-for="m in flatLayers" :key="m.id"
              class="sw-btn sw-item"
              :class="{ active: activeLayer === m.id }"
              @click="selectLayer(m.id)"
            >{{ m.label }}</button>
          </div>
        </div>
      </Transition>
    </div>
    <div v-if="loading" class="map-loading">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>
    <div v-if="mapError" class="map-error">
      <span>{{ mapError }}</span>
    </div>
    <div ref="mapContainer" class="map-container" :class="{ 'dev-cross': isDevToolActive() }"></div>
    <div v-if="cursorPos" class="cursor-coord" :style="{ left: cursorPos.x + 14 + 'px', top: cursorPos.y - 6 + 'px' }">
      {{ cursorPos.lat.toFixed(5) }}, {{ cursorPos.lng.toFixed(5) }}
    </div>
    <!-- 机场编辑悬浮工具栏（可拖动，深浅色自适应） -->
    <div
      v-if="aptToolbarVisible"
      class="apt-toolbar"
      :style="{ left: aptToolbarPos.x + 'px', top: aptToolbarPos.y + 'px' }"
    >
      <div class="apt-toolbar-handle" title="拖动工具栏" @mousedown.prevent="startAptToolbarDrag">⋮⋮</div>
      <!-- 道路类：绘制跑道/滑行道（hover 垂直弹出，移出 500ms 防抖收起） -->
      <div class="apt-drop" @mouseenter="aptDropEnter(0)" @mouseleave="aptDropLeave(0)">
        <button class="apt-toolbar-btn apt-drop-trigger" title="道路类：绘制跑道/滑行道">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M2 8h20v3H2V8zm0 5h20v3H2v-3z"/></svg>
          <span>道路类</span><span class="apt-drop-caret">▾</span>
        </button>
        <div class="apt-drop-menu" :class="{ open: aptDropOpen === 0 }">
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-runway' }" title="绘制跑道（单击加点，双击结束）" @click="toggleAptToolMode('add-runway')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M2 8h20v3H2V8zm0 5h20v3H2v-3z"/></svg>跑道
          </button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-taxi' }" title="绘制滑行道（单击加点，双击结束）" @click="toggleAptToolMode('add-taxi')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M4 20l6-6-2.5-2.5L4 15V20zm7.5-9.5L14 8l2 2-2.5 2.5L16 15l4-4-7-7-4 4 2.5 2.5z"/></svg>滑行道
          </button>
        </div>
      </div>
      <!-- 标签类：放置编号标签 -->
      <div class="apt-drop" @mouseenter="aptDropEnter(1)" @mouseleave="aptDropLeave(1)">
        <button class="apt-toolbar-btn apt-drop-trigger" title="标签类：放置编号标签">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M4 4h9l7 7-9 9-7-7V4zm4 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>
          <span>标签类</span><span class="apt-drop-caret">▾</span>
        </button>
        <div class="apt-drop-menu" :class="{ open: aptDropOpen === 1 }">
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-runway-label' }" title="放置跑道编号标签" @click="toggleAptToolMode('add-runway-label')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M2 8h20v3H2V8zm0 5h20v3H2v-3z"/></svg>跑道
          </button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-taxi-label' }" title="放置滑行道编号标签" @click="toggleAptToolMode('add-taxi-label')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M4 20l6-6-2.5-2.5L4 15V20zm7.5-9.5L14 8l2 2-2.5 2.5L16 15l4-4-7-7-4 4 2.5 2.5z"/></svg>滑行道
          </button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-stand' }" title="放置停机位标签" @click="toggleAptToolMode('add-stand')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M12 2a3 3 0 013 3c0 1.3-.84 2.4-2 2.82V9h4a2 2 0 010 4h-4v7a1 1 0 01-2 0v-7H7a2 2 0 010-4h4V7.82A3.001 3.001 0 0112 2z"/></svg>停机位
          </button>
        </div>
      </div>
      <!-- 区域类：放置区域标记 -->
      <div class="apt-drop" @mouseenter="aptDropEnter(2)" @mouseleave="aptDropLeave(2)">
        <button class="apt-toolbar-btn apt-drop-trigger" title="区域类：放置区域标记">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M4 5h16v14H4V5zm2 2v10h12V7H6z"/></svg>
          <span>区域类</span><span class="apt-drop-caret">▾</span>
        </button>
        <div class="apt-drop-menu" :class="{ open: aptDropOpen === 2 }">
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-area-gnd' }" title="放置地面区域标记" @click="toggleAptToolMode('add-area-gnd')">地面区域</button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-area-apron' }" title="放置机坪区域标记" @click="toggleAptToolMode('add-area-apron')">机坪区域</button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-area-tower' }" title="放置塔台区域标记" @click="toggleAptToolMode('add-area-tower')">塔台区域</button>
        </div>
      </div>
      <button class="apt-toolbar-btn apt-toolbar-submit" title="提交到服务器" @click="aptEditSubmit">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3l-6 6h4v6h4V9h4l-6-6zm-6 14h12v2H6v-2z"/></svg>
      </button>
      <button class="apt-toolbar-btn apt-toolbar-cancel" title="取消所有修改" @click="aptEditCancel">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
    <div class="map-status">
      <span :class="connected ? 'status-ok' : 'status-err'">● {{ connected ? '实时' : '轮询' }}</span>
      <span v-if="lastUpdate" class="status-time">更新 {{ lastUpdate }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { flightplanApi, adminApi } from '@/api'
import { isDarkTheme } from '@/utils/theme'
import { showBanner } from '@/utils/banner'
import { showActionBanner, hideActionBanner } from '@/utils/bannerAction'
import { useMapSettingsStore } from '@/store/mapSettings'
import { createAircraft3DLayer, updateAircraft3D, destroyAircraft3D } from '@/utils/aircraft3d'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------
const AMAP_KEY = '89b5c51a7622408a444f2c62a7de6113'
const AMAP_SECURITY_CODE = 'a20594f2f5e875560ec09be0fca30a1a'
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''
// OpenWeatherMap 天气雷达（降水图层, 2D/3D 所有地图源通用叠加）
const OWM_KEY = import.meta.env.VITE_OWM_KEY || ''
const OWM_RADAR_URL = (z, x, y) => `https://tile.openweathermap.org/map/precipitation_new/${z}/${x}/${y}.png?appid=${OWM_KEY}`
// 地图设置全局状态（header 齿轮面板控制）
const mapSettings = useMapSettingsStore()
// Mapbox GL 脚本：优先加载本地打包文件（public/vendor/mapbox-gl/），若不存在则使用 CDN
const MAPBOX_LOCAL_JS = '/vendor/mapbox-gl/mapbox-gl.js'
const MAPBOX_LOCAL_CSS = '/vendor/mapbox-gl/mapbox-gl.css'
const MAPBOX_CDN_JS = 'https://api.mapbox.com/mapbox-gl-js/v3.16.0/mapbox-gl.js'
const MAPBOX_CDN_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.16.0/mapbox-gl.css'
const REFRESH_INTERVAL = 5000   // 机组位置轮询刷新间隔(5s)
const MAP_CENTER = [110, 30]    // AMap 使用 [lng, lat]
const MAP_ZOOM = 5

// ---------------------------------------------------------------------------
// WGS84 -> GCJ-02（高德火星坐标）: Mapbox3D 用 WGS84 准确, 高德底图用 GCJ-02
// 直接传 WGS84 会整体偏移; 基准点验证: WGS84(31.126172,121.794128) -> GCJ02(31.124277,121.798325)
// ---------------------------------------------------------------------------
const GCJ_A = 6378245.0
const GCJ_EE = 0.00669342162296594323
function gcjTransformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0
  return ret
}
function gcjTransformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0
  return ret
}
// WGS84 经纬度 -> GCJ-02（高德）; 返回 [lng, lat]; 境外(不适用 GCJ) 原样返回
function toGcj02(lng, lat) {
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
const BOTTOM_LAT = -85    // 底部（南）边界纬度
const TOP_LAT = 85      // 顶部（北）边界纬度

// 地图源分组：3D（Mapbox）/ 2D（四个平面地图）
const layers3D = [
  { id: 'mapbox3d', label: 'MapBox3D' },
  { id: 'mapbox3d_sat', label: 'MapBox3D 卫星' },
]
const flatLayers = [
  { id: 'gaode', label: '高德地图' },
  { id: 'gaode_sat', label: '高德卫星' },
  { id: 'mapbox', label: 'Mapbox 卫星' },
  { id: 'arcgis', label: 'ArcGIS 卫星' },
]

// 判断是否为 3D 引擎（Mapbox GL globe）
function is3D(id) { return id === 'mapbox3d' || id === 'mapbox3d_sat' }

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
const mapContainer = ref(null)
// 默认 3D 地球
const activeLayer = ref('mapbox3d')
const pilots = ref([])
const boundaries = ref([])
const loading = ref(true)
const mapError = ref('')

// 地图选择下拉状态
const panelOpen = ref(false)
let panelTimer = null
const mainBtnLabel = computed(() => {
  const all = [...layers3D, ...flatLayers]
  const cur = all.find(m => m.id === activeLayer.value)
  return cur ? cur.label : '地图'
})

let map = null            // AMap 实例
let mapboxMap = null      // Mapbox GL 实例
let mapboxReady = false   // Mapbox GL 脚本是否已加载
// 3D 地球自动旋转（编辑模式时停止，避免地图持续转动导致标签/端点拖不动）
let mapboxSpinning = false
const mapboxSpinFn = () => {
  if (!mapboxMap) return
  const center = mapboxMap.getCenter()
  center.lng -= 360 / 240
  mapboxMap.easeTo({ center, duration: 1000, easing: (n) => n })
}
function mapboxStartSpin() {
  if (mapboxMap && !mapboxSpinning) { mapboxSpinning = true; mapboxMap.on('move', mapboxSpinFn) }
}
function mapboxStopSpin() {
  if (mapboxMap) mapboxMap.off('move', mapboxSpinFn)
  mapboxSpinning = false
}
// 引擎版本令牌：每次 switchEngine 递增。async 初始化(initMapbox3D)完成后检查令牌，
// 若已过期(期间切换过引擎)则放弃创建，避免“切到高德又被 Mapbox 覆盖/残留”
let engineToken = 0
let defaultLayers = null
let satLayer = null
let arcLayer = null
let mapboxLayer = null
// 当前激活的第三方底图(卫星/Mapbox/ArcGIS), 切换时先移除避免残留叠加
let currentTileLayer = null
let markers = []
let boundaryLayers = []
let mapboxMarkers = []    // Mapbox 标记（HTML Marker）
let mapboxSources = []    // Mapbox 已添加的 source 名（用于清理）
let timer = null
let heartbeatTimer = null
const connected = ref(false)
const lastUpdate = ref('')

// ---------------------------------------------------------------------------
// 地图初始化
// ---------------------------------------------------------------------------
function initMap() {
  if (!mapContainer.value || map || !window.AMap) return

  // 清除容器内 Mapbox/上一次引擎残留的 canvas/元素
  // 此处兜底清理 mapboxgl 元素，避免高德瓦片加载慢时露出旧画面）
  const c = mapContainer.value
  c.querySelectorAll('canvas').forEach(n => n.remove())
  c.querySelectorAll('[class*="mapboxgl-"]').forEach(n => n.remove())

  // 卫星 zIndex=50: 位于高德街道底图(1)之上、高德道路/标注层(100/110)之下
  // 效果: 卫星替代街道底图, 高德 3 个覆盖层(Os/$i/ss 道路+标注)叠加在卫星上
  satLayer = new AMap.TileLayer.Satellite({ minZoom: 3, maxZoom: 18, zIndex: 50 })
  arcLayer = new AMap.TileLayer({
    getTileUrl: function(x, y, z) {
      // ArcGIS 使用标准 XYZ 坐标（y=0 顶部），与 AMap 一致，无需翻转
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    },
    minZoom: 3,
    maxZoom: 19,
    zIndex: 50,
  })

  mapboxLayer = new AMap.TileLayer({
    getTileUrl: function(x, y, z) {
      // Mapbox 使用标准 Slippy Map 坐标（y=0 顶部），与 AMap 一致，无需翻转
      return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/${z}/${x}/${y}@2x?access_token=${MAPBOX_TOKEN}`
    },
    minZoom: 3,
    maxZoom: 20,
    zIndex: 50,
  })

  map = new AMap.Map(mapContainer.value, {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    zooms: [3, 18],
    minZoom: 3,
    viewMode: '2D',
    doubleClickZoom: false,
    // 跟随主题深浅色: 深色 grey / 浅色 macaron（auto 由 theme.js 按北京时间决定）
    mapStyle: isDarkTheme() ? 'amap://styles/grey' : 'amap://styles/macaron',
    // 注: mapStyle 仅作用于默认底图(gaode 模式); 卫星模式由上层 TileLayer 覆盖, 不受影响
  })

  // 调试用: 暴露 map 实例到全局, 便于控制台验证图层状态 (保留无副作用)
  window.__cwMap = map

  map.on('complete', () => {
    // 保存拷贝(而非引用), 避免后续 setLayers 污染该数组导致切回失败
    defaultLayers = [...map.getLayers()]
    updateAirportLayersAMap()
  })

  map.on('moveend', () => { clampViewportLat(); updateAirportLayersAMap() })
  map.on('moving', clampViewportLat)

  // 地图拖动光标：正常抓手，拖动中抓取
  map.on('dragstart', () => { try { map.setDefaultCursor('grabbing') } catch {} })
  map.on('dragend', applyDevCursor)
  applyDevCursor()

  applyLayer()
  loadPilots()
}

// 基于当前视口（像素映射）钳制上下边界：视口顶部纬度 ≤ TOP_LAT、底部纬度 ≥ BOTTOM_LAT
function clampViewportLat() {
  if (!map) return
  const bounds = map.getBounds()
  const center = map.getCenter()
  let lat = center.getLat()
  // 高德 2.0 的 Bounds 用 getNorthEast/getSouthWest（返回 LngLat）
  const north = bounds.getNorthEast().getLat()
  if (north > TOP_LAT) lat -= (north - TOP_LAT)
  const south = bounds.getSouthWest().getLat()
  if (south < BOTTOM_LAT) lat += (BOTTOM_LAT - south)
  if (Math.abs(lat - center.getLat()) > 0.000001) {
    map.setCenter([center.getLng(), lat])
  }
}

function applyLayer() {
  if (!map) return
  // 先移除上一个第三方底图, 避免 setLayers 数组替换不干净导致图层残留/叠加
  if (currentTileLayer) {
    map.removeLayer(currentTileLayer)
    currentTileLayer = null
  }
  if (activeLayer.value === 'gaode') {
    // 高德默认底图(含文字/POI标注): 移除第三方图层后即恢复默认, 无需 addLayer
  } else if (activeLayer.value === 'gaode_sat') {
    map.addLayer(satLayer)
    currentTileLayer = satLayer
  } else if (activeLayer.value === 'mapbox') {
    map.addLayer(mapboxLayer)
    currentTileLayer = mapboxLayer
  } else {
    map.addLayer(arcLayer)
    currentTileLayer = arcLayer
  }
  renderPilots()
  renderBoundaries()
  // 高德底图(GCJ-02) 与 WGS84 底图之间切换时，机场地面数据需按新坐标系重载
  const gcj = amapNeedsGcj()
  if (gcj !== amapAirportGcjMode) {
    for (const icao of Object.keys(amapAirportLayers)) removeAirportLayerAMap(icao)
    amapAirportGcjMode = gcj
  }
  updateAirportLayersAMap()
  // 气象雷达: 若开关开启则同步添加(地图重建后自动重新挂载)
  if (mapSettings.weatherRadar) setRadar(true)
}

// ---------------------------------------------------------------------------
// 地图引擎切换：3D（Mapbox GL globe）/ 2D（AMap 平面）
// 仅更新 activeLayer，实际引擎切换统一由 watch(activeLayer) 处理
// ---------------------------------------------------------------------------
function selectLayer(id) {
  activeLayer.value = id
}

// Mapbox 3D 风格映射：
//  - mapbox3d     → standard（globe 投影，低缩放是地球，放大后显示 3D 建筑，与 ISFP 一致）
//  - mapbox3d_sat → 卫星地球（globe，satellite-streets）
function mapbox3DStyle() {
  return activeLayer.value === 'mapbox3d_sat'
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : 'mapbox://styles/mapbox/standard'
}

// 加载 Mapbox GL 脚本（CDN，避免服务器重新 npm install）
function loadMapboxGL() {
  return new Promise((resolve, reject) => {
    if (window.mapboxgl) { mapboxReady = true; resolve(); return }
    if (mapboxReady) { resolve(); return }
    // CSS（本地优先，失败回退 CDN）
    if (!document.querySelector('link[data-mapbox-css]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = MAPBOX_LOCAL_CSS
      link.setAttribute('data-mapbox-css', '')
      link.onerror = () => { link.href = MAPBOX_CDN_CSS }
      document.head.appendChild(link)
    }
    // 按顺序尝试加载 JS：本地 → CDN
    const candidates = [MAPBOX_LOCAL_JS, MAPBOX_CDN_JS]
    let idx = 0
    const tryLoad = () => {
      const script = document.createElement('script')
      script.src = candidates[idx]
      script.onload = () => { mapboxReady = true; resolve() }
      script.onerror = () => {
        idx++
        if (idx < candidates.length) {
          tryLoad()
        } else {
          mapError.value = 'Mapbox GL 加载失败'
          reject(new Error('mapbox load fail'))
        }
      }
      document.head.appendChild(script)
    }
    tryLoad()
  })
}

// 初始化 Mapbox 3D 地球
async function initMapbox3D() {
  if (!mapContainer.value) return
  const myToken = ++engineToken
  try {
    await loadMapboxGL()
  } catch {
    loading.value = false
    return
  }
  // await 期间可能已切换引擎(如切到高德)：令牌过期则放弃创建 Mapbox
  if (myToken !== engineToken || !is3D(activeLayer.value)) {
    loading.value = false
    return
  }
  mapboxgl.accessToken = MAPBOX_TOKEN
  // 局部引用：回调闭包用 thisMap 而非全局 mapboxMap（后者在引擎切换时会被置空/重建，
  // 若 load 回调晚于切换触发，用全局变量会误判/操作到新地图）
  const thisMap = new mapboxgl.Map({
    container: mapContainer.value,
    style: mapbox3DStyle(),
    center: MAP_CENTER,
    zoom: 1.5,
    projection: 'globe',   // 3D 地球
    minZoom: 0,
    // 不限制最大缩放
    attributionControl: false,
    doubleClickZoom: false,
  })
  mapboxMap = thisMap
  // 拖动结束恢复开发者工具光标(十字准星)
  thisMap.on('dragend', applyDevCursor)
  const tokenAtCreate = myToken
  thisMap.on('load', () => {
    // 若地图在加载期间已被切换/移除（令牌过期），放弃本次 load 初始化
    if (tokenAtCreate !== engineToken || mapboxMap !== thisMap || !is3D(activeLayer.value)) return
    // 地图标注语言：简体中文（国内地名显示中文而非拼音/英文）
    // 仅 standard 样式支持语言切换；卫星样式无文字标注，调用无害
    try {
      if (typeof mapboxMap.setLanguage === 'function') {
        mapboxMap.setLanguage('zh-Hans')
      }
    } catch { /* 语言切换失败不影响地图 */ }
    // 开启大气层效果（3D 地球氛围）；深色模式时屏蔽球体发出的白色光
    applyMapboxFog(isDarkTheme(), false)  // 初始加载直接应用目标态
    // 启用最新 3D 地形（terrain-rgb-v2 高程数据，globe 投影下也有地形起伏）
    try {
      mapboxMap.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.terrain-rgb-v2',
        tileSize: 512,
        maxzoom: 14,
      })
      mapboxMap.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
    } catch { /* 地形源加载失败不影响地图 */ }
    // 自动旋转：缓慢自转展示地球（机场编辑模式时停止，避免标签/端点拖不动）
    mapboxMap.on('load', () => { if (!aptEdit.active) mapboxStartSpin() })
    mapboxStartSpin()
    mapboxMap.on('movestart', mapboxStopSpin)
    mapboxMap.on('moveend', () => { if (!aptEdit.active) mapboxStartSpin() })

    // 渲染飞行器 + 边界
    if (mapSettings.weatherRadar) setRadar(true)
    renderMapboxPilots()
    renderMapboxBoundaries()
    // 机场地面图层：首次加载 + 视口变化时懒加载
    thisMap.on('moveend', updateAirportLayers)
    updateAirportLayers()
    // 3D 飞机模型层（Three.js custom layer，在 symbol 图标之上）
    try {
      if (!mapboxMap.getLayer('aircraft-3d-layer')) {
        mapboxMap.addLayer(createAircraft3DLayer(mapboxMap))
      }
      updateAircraft3D(pilots.value)
    } catch (e) { console.warn('[Aircraft3D] 初始化失败:', e?.message) }
    // 地图就绪后应用开发者工具光标(十字准星)
    applyDevCursor()
    loading.value = false
  })
  window.__cwMap3D = mapboxMap
}

// 销毁当前地图引擎并切换到目标引擎
function switchEngine() {
  panelOpen.value = false
  // 递增令牌：使进行中的 async 初始化(如 await loadMapboxGL 后)失效
  const myToken = ++engineToken
  const target3D = is3D(activeLayer.value)
  // 3D ↔ 3D（mapbox3d ↔ mapbox3d_sat）：不销毁重建，直接换 style 并重挂数据层
  // （相机/缩放/旋转保持，无需刷新浏览器）
  if (target3D && mapboxMap && !map) {
    const thisMap = mapboxMap
    thisMap.setStyle(mapbox3DStyle())
    thisMap.once('style.load', () => {
      if (engineToken !== myToken || mapboxMap !== thisMap) return
      // 中文标注
      try { if (typeof thisMap.setLanguage === 'function') thisMap.setLanguage('zh-Hans') } catch {}
      // 大气/主题
      applyMapboxFog(isDarkTheme(), false)
      // 重挂地形
      try {
        if (!thisMap.getSource('mapbox-dem')) {
          thisMap.addSource('mapbox-dem', {
            type: 'raster-dem', url: 'mapbox://mapbox.terrain-rgb-v2', tileSize: 512, maxzoom: 14,
          })
        }
        thisMap.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
      } catch { /* 地形失败不影响 */ }
      // setStyle 会清空所有自定义 source/layer，全部重挂
      mapboxMarkers = []
      mapboxSources = []
      resetAirportLayers()
      if (mapSettings.weatherRadar) setRadar(true)
      renderMapboxPilots()
      renderMapboxBoundaries()
      updateAirportLayers()
      // 重挂 3D 飞机模型层
      destroyAircraft3D()
      try {
        if (!thisMap.getLayer('aircraft-3d-layer')) thisMap.addLayer(createAircraft3DLayer(thisMap))
        updateAircraft3D(pilots.value)
      } catch (e) { console.warn('[Aircraft3D] 样式切换重挂失败:', e?.message) }
      applyDevCursor()
    })
    return
  }
  if (target3D) {
    // 3D 模式：销毁 AMap，重建 Mapbox（换 style 时直接重建）
    if (map) { map.destroy(); map = null; window.__cwMap = null }
    amapAirportLayers = {}          // AMap 已销毁，其上的机场图层一并清空
    amapAirportLabelsLayer = null
    amapAirportGcjMode = null
    markers = []
    boundaryLayers = []
    if (mapboxMap) {
      mapboxMap.remove()
      mapboxMap = null
      window.__cwMap3D = null
    }
    destroyAircraft3D()   // 释放 Three.js 资源（模型/渲染器/图层）
    mapboxMarkers = []
    mapboxSources = []
    resetAirportLayers()
    initMapbox3D()
  } else {
    // 2D 模式：销毁 Mapbox，初始化 AMap
    if (mapboxMap) {
      mapboxMap.remove()
      mapboxMap = null
      window.__cwMap3D = null
    }
    destroyAircraft3D()
    mapboxMarkers = []
    mapboxSources = []
    resetAirportLayers()
    if (!map) {
      // 高德 SDK/插件就绪则直接初始化；否则动态加载(带令牌守卫：期间切回 3D 则放弃)
      const tokenAtSwitch = myToken
      const initGaode = () => {
        if (tokenAtSwitch !== engineToken || is3D(activeLayer.value) || map) return
        initMap()
      }
      if (window.AMap && AMap.TileLayer && AMap.TileLayer.Satellite) {
        initGaode()
      } else if (window.AMap) {
        AMap.plugin(['AMap.TileLayer', 'AMap.TileLayer.Satellite'], initGaode)
      } else {
        loadAMap(initGaode)
      }
    } else {
      applyLayer()
    }
  }
}

// 清理 Mapbox 上的标记与数据源
function clearMapboxOverlays() {
  if (!mapboxMap) return
  mapboxMarkers.forEach(m => { try { m.remove() } catch {} })
  mapboxMarkers = []
  const layerIds = new Set()
  layerIds.add('pilots-layer')
  for (const name of mapboxSources) {
    if (name === 'pilots-src') continue
    layerIds.add(name)            // trail-* / bnd-* 图层
    layerIds.add(name + '-line')  // 边界线图层
  }
  for (const id of layerIds) {
    try { if (mapboxMap.getLayer(id)) mapboxMap.removeLayer(id) } catch {}
  }
  for (const name of mapboxSources) {
    try { if (mapboxMap.getSource(name)) mapboxMap.removeSource(name) } catch {}
  }
  mapboxSources = []
}

// ===== 机场地面图层（跑道/滑行道/停机坪，GeoJSON 懒加载）=====
// 数据来源: X-Plane Scenery Gateway apt.dat → tools/apt2geojson.py 转换
// 文件: /airports/{icao}.json；zoom >= APT_ZOOM_MIN 且视口靠近机场时才加载
const APT_ZOOM_MIN = 10.5
let airportLayersLoaded = new Set()   // 已加载的 ICAO
let airportMoveHandlerBound = false

/** 内置机场索引: ICAO -> [lng, lat]（用于视口判定；由 tools/apt2geojson.py 生成, 含 EAIP 全部 81 机场） */
const AIRPORT_INDEX = {
  ZBAA: [116.5946, 40.0796],
  ZBAD: [116.4164, 39.5012],
  ZBDS: [109.9907, 40.6604],
  ZBDT: [113.4768, 40.0639],
  ZBER: [112.0863, 43.4253],
  ZBHH: [111.8204, 40.8487],
  ZBLA: [119.8244, 49.2058],
  ZBMZ: [117.3259, 49.5675],
  ZBOW: [109.9958, 40.5609],
  ZBSJ: [114.6950, 38.2833],
  ZBTJ: [117.3561, 39.1300],
  ZBYC: [111.0279, 35.1175],
  ZBYN: [112.6272, 37.7476],
  ZGDY: [110.4411, 29.1023],
  ZGGG: [113.3017, 23.3843],
  ZGHA: [113.2213, 28.1950],
  ZGKL: [110.0393, 25.2171],
  ZGNN: [108.1732, 22.6065],
  ZGOW: [116.5026, 23.5511],
  ZGSZ: [113.8003, 22.6421],
  ZGZJ: [110.5922, 21.4862],
  ZHCC: [113.8464, 34.5275],
  ZHES: [109.4850, 30.3191],
  ZHHH: [114.2173, 30.7718],
  ZHYC: [111.4799, 30.5565],
  ZJHK: [110.4588, 19.9442],
  ZJQH: [110.4512, 19.1440],
  ZJSY: [109.4091, 18.3025],
  ZLDH: [94.8086, 40.1616],
  ZLIC: [106.3903, 38.3183],
  ZLLL: [103.6303, 36.5174],
  ZLXN: [102.0355, 36.5314],
  ZLXY: [108.7558, 34.4405],
  ZPJH: [100.7615, 21.9766],
  ZPLJ: [100.2439, 26.6745],
  ZPMS: [98.5302, 24.3970],
  ZPPP: [102.9343, 25.1079],
  ZSAM: [118.1250, 24.5422],
  ZSCG: [119.7718, 31.9215],
  ZSCN: [115.9013, 28.8620],
  ZSFZ: [119.6619, 25.9319],
  ZSHC: [120.4260, 30.2359],
  ZSJN: [117.2160, 36.8541],
  ZSLG: [119.1772, 34.4108],
  ZSLY: [118.4119, 35.0498],
  ZSNB: [121.4592, 29.8283],
  ZSNJ: [118.8599, 31.7304],
  ZSNT: [120.9799, 32.0772],
  ZSOF: [116.9747, 31.9911],
  ZSPD: [121.8119, 31.1447],
  ZSQD: [120.3735, 36.2690],
  ZSQZ: [118.5880, 24.7951],
  ZSSH: [119.1246, 33.7903],
  ZSSS: [121.3341, 31.2011],
  ZSTX: [118.2540, 29.7351],
  ZSWH: [122.2280, 37.1847],
  ZSWX: [120.4295, 31.4947],
  ZSWZ: [120.8507, 27.9059],
  ZSXZ: [117.5528, 34.0591],
  ZSYA: [119.7180, 32.5697],
  ZSYN: [120.2034, 33.4263],
  ZSYT: [120.9760, 37.6576],
  ZSYW: [120.0306, 29.3401],
  ZSZS: [122.3625, 29.9371],
  ZUCK: [106.6559, 29.7234],
  ZUGY: [106.8029, 26.5370],
  ZULS: [90.9063, 29.2997],
  ZUUU: [103.9440, 30.5535],
  ZUXC: [102.1841, 27.9922],
  ZWSH: [76.0163, 39.5422],
  ZWTN: [79.8598, 37.0333],
  ZWWW: [87.4692, 43.9187],
  ZWYN: [81.3280, 43.9550],
  ZYCC: [125.6821, 43.9944],
  ZYHB: [126.2342, 45.6043],
  ZYJM: [130.4630, 46.8420],
  ZYMD: [129.5676, 44.5226],
  ZYQQ: [123.9112, 47.2357],
  ZYTL: [121.5347, 38.9659],
  ZYTX: [123.4806, 41.6381],
  ZYYJ: [129.4482, 42.8825],
  ZHEC: [114.9470, 30.3320],
  ZUTF: [104.4415, 30.3055],
}

function updateAirportLayers() {
  if (!mapboxMap || !is3D(activeLayer.value)) return
  try { if (!mapboxMap.isStyleLoaded()) return } catch { return }
  if (mapboxMap.getZoom() < APT_ZOOM_MIN) {
    // 缩小到全球视角时移除机场图层（避免遮挡/浪费）
    for (const icao of [...airportLayersLoaded]) removeAirportLayer(icao)
    return
  }
  const bounds = mapboxMap.getBounds()
  for (const [icao, pos] of Object.entries(AIRPORT_INDEX)) {
    if (airportLayersLoaded.has(icao)) continue
    if (bounds && pos[0] > bounds.getWest() - 0.5 && pos[0] < bounds.getEast() + 0.5 &&
        pos[1] > bounds.getSouth() - 0.5 && pos[1] < bounds.getNorth() + 0.5) {
      loadAirportLayer(icao)
    }
  }
}

// ===== 跑道号自定义字体图标（HOOG0554 方正字体，Canvas 渲染成 Mapbox icon-image，可拖动）=====
let runwayNoFontReady = false
async function loadRunwayNoFont() {
  if (runwayNoFontReady) return true
  try {
    if (!('FontFace' in window)) return false
    const font = new FontFace('HOOG0554', 'url(/fonts/HOOG0554.TTF)')
    await font.load()
    document.fonts.add(font)
    runwayNoFontReady = true
    return true
  } catch { return false }
}

/** 用 Canvas + HOOG0554 渲染跑道号数字为图标（白字深描边，方正方正）。
/** 用 Canvas + HOOG0554 渲染跑道号数字为图标（纯白字，无描边）。
 *  关键：HOOG0554 的 advance metrics 异常（measureText 宽度远大于实际字形），textAlign 居中会把字形
 *  推偏导致左侧被裁切；故先绘制后按实际像素包围盒裁剪。字形不缩放（保持原始像素），输出 canvas
 *  宽高分别取 2 的幂以容纳字形——若按高度比例缩放，两位数字宽高比 ~2.3 会把宽度撑出画布导致
 *  左右两侧同时被裁切。Mapbox addImage 需 ImageData，尺寸必须 2 的幂。 */
function renderRunwayNoIcon(num) {
  const S = 1024
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, S, S)
  ctx.font = 'bold 400px HOOG0554, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(String(num), 10, S / 2)
  // 按实际非透明像素包围盒裁剪（不信任 measureText / textAlign 居中）
  const img = ctx.getImageData(0, 0, S, S)
  const d = img.data
  let minX = S, minY = S, maxX = -1, maxY = -1
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (d[(y * S + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const pad = 32   // 字形四周留边距
  const OW = Math.min(1024, 1 << Math.ceil(Math.log2(w + pad)))
  const OH = Math.min(1024, 1 << Math.ceil(Math.log2(h + pad)))
  const out = document.createElement('canvas')
  out.width = OW; out.height = OH
  const o = out.getContext('2d')
  o.clearRect(0, 0, OW, OH)
  o.drawImage(canvas, minX, minY, w, h, Math.max(0, (OW - w) / 2), Math.max(0, (OH - h) / 2), Math.min(w, OW), Math.min(h, OH))
  return o.getImageData(0, 0, OW, OH)
}

/** 确保跑道号数字的图标已注册到地图（符号层 icon-image 使用），新增后触发重绘 */
async function ensureRunwayNoIcons(nums) {
  if (!mapboxMap || !nums || !nums.length) return
  const ok = await loadRunwayNoFont()
  if (!ok) return
  let added = false
  for (const raw of new Set(nums)) {
    const num = String(raw)
    const id = `rn-${num}`
    if (mapboxMap.hasImage(id)) continue
    try { mapboxMap.addImage(id, renderRunwayNoIcon(num)); added = true } catch { /* ignore */ }
  }
  // 有新增图标时重绘，使当前机场源里的跑道号立即显示
  if (added && aptEdit.icao) {
    try {
      const s = mapboxMap.getSource(`apt-${aptEdit.icao}`)
      if (s && s._data) s.setData(s._data)
    } catch { /* ignore */ }
  }
}

// 机场 GeoJSON 内存缓存：3D↔3D 卫星切换（setStyle）时复用，避免重新 fetch
const airportGjCache = new Map()   // icao -> FeatureCollection

async function loadAirportLayer(icao) {
  if (!mapboxMap || airportLayersLoaded.has(icao)) return
  airportLayersLoaded.add(icao)   // 先占位防重复请求
  try {
    let gj = null
    if (airportGjCache.has(icao)) {
      gj = airportGjCache.get(icao)
    } else {
      try { gj = await fetch(`/uploads/airports/${icao}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null) } catch { gj = null }
      if (!gj) gj = await fetch(`/airports/${icao}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      if (gj) airportGjCache.set(icao, gj)
    }
    if (!gj || !mapboxMap || !is3D(activeLayer.value)) { airportLayersLoaded.delete(icao); return }
    const srcId = `apt-${icao}`
    if (mapboxMap.getSource(srcId)) return   // 已存在（并发保护）
    // 预生成跑道号自定义字体图标（HOOG0554），供 runway-no 符号层 icon-image 使用
    try {
      const rnNums = (gj.features || []).filter(f => f.properties.kind === 'runway-no').map(f => f.properties.num)
      if (rnNums.length) await ensureRunwayNoIcons(rnNums)
    } catch { /* 图标失败不影响加载 */ }
    // 注：不渲染停机坪多边形（XP 数据含不规则大面会形成黑色阴影，底图已有停机坪纹理）
    mapboxMap.addSource(srcId, { type: 'geojson', data: gj })
    // 跑道（深色多边形 + 白色描边；材质沥青深灰/混凝土浅灰，默认沥青）
    mapboxMap.addLayer({
      id: `${srcId}-runway`, type: 'fill', source: srcId,
      filter: ['==', ['get', 'kind'], 'runway'],
      paint: {
        'fill-color': ['case', ['==', ['get', '_material'], 'concrete'], '#a3adb5', '#4b5563'],
        'fill-opacity': 0.9,
      },
    })
    mapboxMap.addLayer({
      id: `${srcId}-runway-line`, type: 'line', source: srcId,
      filter: ['==', ['get', 'kind'], 'runway'],
      paint: { 'line-color': '#f9fafb', 'line-width': 1, 'line-opacity': 0.7 },
    })
    // 手动滑行道（矩形区域面 + 描边，位于跑道之上）
    mapboxMap.addLayer({
      id: `${srcId}-taxiway-fill`, type: 'fill', source: srcId,
      filter: ['all', ['==', ['get', 'kind'], 'taxiway'], ['==', ['get', '_addedInEdit'], true]],
      paint: { 'fill-color': '#8f9aa6', 'fill-opacity': 0.85, 'fill-outline-color': '#6b7280' },
    })
    // 注：不渲染滑行道线（底图已有），仅保留滑行道编号标注
    // 注：跑道号标注已按需求移除（不显示）
    // 滑行道编号标注（OSM 独立编号点，如 J3/Q2/K5）
    // 配色随主题：深色=黄字深描边；浅色=黄字白描边
    const dark = isDarkTheme()
    mapboxMap.addLayer({
      id: `${srcId}-taxiway-label`, type: 'symbol', source: srcId,
      filter: ['==', ['get', 'kind'], 'taxi-label'],
      minzoom: 13.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10,
      },
      paint: {
        'text-color': dark ? '#ffff00' : '#ffff00',
        'text-halo-color': dark ? '#2f2f3f' : '#222938',
        'text-halo-width': 1,
      },
    })
    // 手动放置的跑道编号标签（标签类"跑道"，编辑模式新增，黄色描边）
    mapboxMap.addLayer({
      id: `${srcId}-runway-label`, type: 'symbol', source: srcId,
      filter: ['all', ['==', ['get', 'kind'], 'runway-label'], ['==', ['get', '_addedInEdit'], true]],
      minzoom: 13.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
      },
      paint: {
        'text-color': dark ? '#fde047' : '#f59e0b',
        'text-halo-color': dark ? '#2f2f3f' : '#ffffff',
        'text-halo-width': 1.4,
      },
    })
    // 停机位/推出线标注（机位号）：深色=灰字深描边；浅色=灰字白描边
    mapboxMap.addLayer({
      id: `${srcId}-stand-label`, type: 'symbol', source: srcId,
      filter: ['all', ['in', ['get', 'kind'], ['literal', ['stand', 'pushback']]], ['!=', ['get', 'name'], '']],
      minzoom: 14,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10,
        'text-offset': [0, 0.8],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': dark ? '#9ca3af' : '#9ca3af',
        'text-halo-color': dark ? '#f0f0f0' : '#ffffff',
        'text-halo-width': 1.2,
      },
    })
    // 跑道号（编辑生成，两端尾部 20m，大号白色，垂直跑道旋转、两端镜像）
    // 跑道号（编辑生成，两端尾部 20m，HOOG0554 方正字体 Canvas 图标，垂直跑道旋转）
    mapboxMap.addLayer({
      id: `${srcId}-runway-no`, type: 'symbol', source: srcId,
      filter: ['==', ['get', 'kind'], 'runway-no'],
      minzoom: 13,
      layout: {
        'icon-image': ['concat', 'rn-', ['get', 'num']],
        // 随地图缩放：map 对齐下用 zoom 表达式。低 zoom 的 size 调大保证缩小后跑道号仍可见，
        // 高 zoom（20 及以上）保持不变
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          13, 0.001,
          15, 0.015,
          17, 0.06,
          19, 0.15,
          20, 0.5,
          21, 0.7,
          22, 1,
        ],
        'icon-rotate': ['get', 'rot'],
        'icon-anchor': 'center',
        // 相对地图对齐：无论地图旋转到何种角度，编号始终朝向跑道方向（垂直跑道，两端镜像）
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
      },
      paint: {},
    })
    // 中心线（白色虚线，位于跑道之上）
    mapboxMap.addLayer({
      id: `${srcId}-centerline`, type: 'line', source: srcId,
      filter: ['==', ['get', 'kind'], 'centerline'],
      paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.9, 'line-dasharray': [50, 4] },
    })
    // 停止线（白色竖条，位于跑道之上）
    mapboxMap.addLayer({
      id: `${srcId}-stop-bar`, type: 'line', source: srcId,
      filter: ['==', ['get', 'kind'], 'stop-bar'],
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 1,
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          13, 0.1,
          15, 0.4,
          17, 2,
          19, 8,
          20, 15,
          21, 21,
          22, 22,
        ],
      },
    })
    // 防吹坪材质区域（矩形填充，材质沥青深灰/混凝土浅灰，黄色描边，位于跑道之上）
    mapboxMap.addLayer({
      id: `${srcId}-blast-pad-area`, type: 'fill', source: srcId,
      filter: ['==', ['get', 'kind'], 'blast-pad-area'],
      paint: {
        'fill-color': ['case', ['==', ['get', '_material'], 'concrete'], '#a3adb5', '#4b5563'],
        'fill-opacity': 0.85,
        'fill-outline-color': '#facc15',
      },
    })
    // 防吹坪黄色 ^ 条纹（位于材质区域之上，不被覆盖）
    mapboxMap.addLayer({
      id: `${srcId}-blast-pad`, type: 'line', source: srcId,
      filter: ['==', ['get', 'kind'], 'blast-pad'],
      paint: { 'line-color': '#facc15', 'line-width': 3.5, 'line-opacity': 1 },
    })
    // 地面刻槽（白色半透明面，位于跑道之上）
    mapboxMap.addLayer({
      id: `${srcId}-groove`, type: 'fill', source: srcId,
      filter: ['==', ['get', 'kind'], 'groove'],
      paint: { 'fill-color': '#f8fafc', 'fill-opacity': 0.45, 'fill-outline-color': '#e2e8f0' },
    })
  } catch { airportLayersLoaded.delete(icao) }
}

function removeAirportLayer(icao) {
  if (!mapboxMap) return
  const srcId = `apt-${icao}`
  for (const l of ['-runway', '-runway-line', '-runway-label', '-taxiway-label', '-stand-label', '-taxiway-fill', '-runway-no', '-centerline', '-stop-bar', '-blast-pad', '-blast-pad-area', '-groove']) {
    try { if (mapboxMap.getLayer(srcId + l)) mapboxMap.removeLayer(srcId + l) } catch {}
  }
  try { if (mapboxMap.getSource(srcId)) mapboxMap.removeSource(srcId) } catch {}
  airportLayersLoaded.delete(icao)
}


/** 引擎切换时清空机场图层状态（新地图实例需重新加载） */
function resetAirportLayers() {
  airportLayersLoaded.clear()
}

// ===== 机场地面数据在 AMap 平面源上的渲染（所有 2D 地图均显示地面数据）=====
// 文本标签用 AMap.LabelsLayer（canvas 合并渲染，避免逐个 DOM 标签导致卡顿）
let amapAirportLayers = {}          // { icao: { polys: [], lines: [], labels: [] } }
let amapAirportLabelsLayer = null   // 共享的标签层实例
let amapAirportGcjMode = null       // 当前机场图层是否按 GCJ-02（高德底图）放置，底图切换时据此重载

/** 当前 2D 底图是否高德（火星坐标 GCJ-02）：高德/高德卫星需转换，Mapbox卫星/ArcGIS 为 WGS84 */
function amapNeedsGcj() {
  return activeLayer.value === 'gaode' || activeLayer.value === 'gaode_sat'
}

function updateAirportLayersAMap() {
  if (!map || is3D(activeLayer.value)) return
  const zoom = map.getZoom()
  if (zoom < APT_ZOOM_MIN) {
    for (const icao of Object.keys(amapAirportLayers)) removeAirportLayerAMap(icao)
    return
  }
  const bounds = map.getBounds()
  for (const [icao, pos] of Object.entries(AIRPORT_INDEX)) {
    if (amapAirportLayers[icao]) continue
    if (bounds &&
        pos[0] > bounds.getSouthWest().getLng() - 0.5 && pos[0] < bounds.getNorthEast().getLng() + 0.5 &&
        pos[1] > bounds.getSouthWest().getLat() - 0.5 && pos[1] < bounds.getNorthEast().getLat() + 0.5) {
      loadAirportLayerAMap(icao)
    }
  }
}

async function loadAirportLayerAMap(icao) {
  if (!map || amapAirportLayers[icao]) return
  let gj = null
  try { gj = await fetch(`/uploads/airports/${icao}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null) } catch { gj = null }
  if (!gj) gj = await fetch(`/airports/${icao}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
  if (!gj || !map || is3D(activeLayer.value)) return
  // 懒创建共享标签层（canvas 高性能渲染）
  if (!amapAirportLabelsLayer) {
    amapAirportLabelsLayer = new AMap.LabelsLayer({ zooms: [3, 20] })
    map.add(amapAirportLabelsLayer)
  }
  const gcj = amapNeedsGcj()
  const toPos = (c) => gcj ? toGcj02(c[0], c[1]) : [c[0], c[1]]
  const isStand = (k) => k === 'stand' || k === 'pushback'
  const polys = [], lines = [], labels = []
  for (const f of (gj.features || [])) {
    const p = f.properties || {}
    const kind = p.kind
    const name = p.name != null ? String(p.name) : ''
    try {
      if (kind === 'runway') {
        const ring = f.geometry.coordinates && f.geometry.coordinates[0]
        if (!ring || ring.length < 4) continue
        polys.push(new AMap.Polygon({
          path: ring.map(toPos),
          strokeColor: '#f9fafb', strokeWeight: 1, strokeOpacity: 0.7,
          fillColor: p._material === 'concrete' ? '#a3adb5' : '#4b5563', fillOpacity: 0.9,
        }))
      } else if (kind === 'taxiway' && p._addedInEdit) {
        // 手动滑行道：矩形区域面（兼容旧 LineString 用线渲染）
        if (f.geometry.type === 'Polygon') {
          const ring = f.geometry.coordinates && f.geometry.coordinates[0]
          if (!ring || ring.length < 4) continue
          polys.push(new AMap.Polygon({
            path: ring.map(toPos),
            strokeColor: '#6b7280', strokeWeight: 1, strokeOpacity: 0.9,
            fillColor: '#8f9aa6', fillOpacity: 0.85,
          }))
        } else {
          const coords = f.geometry.coordinates
          if (!coords || coords.length < 2) continue
          lines.push(new AMap.Polyline({
            path: coords.map(toPos),
            strokeColor: '#8f9aa6', strokeWeight: 6, strokeOpacity: 0.85,
          }))
        }
      } else if (kind === 'centerline') {
        const coords = f.geometry.coordinates
        if (!coords || coords.length < 2) continue
        lines.push(new AMap.Polyline({
          path: coords.map(toPos),
          strokeColor: '#ffffff', strokeWeight: 1.5, strokeOpacity: 0.9, strokeStyle: 'dashed',
        }))
      } else if (kind === 'stop-bar') {
        const coords = f.geometry.coordinates
        if (!coords || coords.length < 2) continue
        lines.push(new AMap.Polyline({
          path: coords.map(toPos),
          strokeColor: '#ffffff', strokeWeight: 2.5, strokeOpacity: 0.95,
        }))
      } else if (kind === 'blast-pad') {
        const coords = f.geometry.coordinates
        if (!coords || coords.length < 2) continue
        lines.push(new AMap.Polyline({
          path: coords.map(toPos),
          strokeColor: '#facc15', strokeWeight: 2.5, strokeOpacity: 0.95,
        }))
      } else if (kind === 'blast-pad-area') {
        const ring = f.geometry.coordinates && f.geometry.coordinates[0]
        if (!ring || ring.length < 4) continue
        polys.push(new AMap.Polygon({
          path: ring.map(toPos),
          strokeColor: '#facc15', strokeWeight: 1, strokeOpacity: 0.8,
          fillColor: p._material === 'concrete' ? '#a3adb5' : '#4b5563', fillOpacity: 0.85,
        }))
      } else if (kind === 'groove') {
        const ring = f.geometry.coordinates && f.geometry.coordinates[0]
        if (!ring || ring.length < 4) continue
        polys.push(new AMap.Polygon({
          path: ring.map(toPos),
          strokeColor: '#e2e8f0', strokeWeight: 1, strokeOpacity: 0.7,
          fillColor: '#f8fafc', fillOpacity: 0.4,
        }))
      } else if (kind === 'runway-no') {
        const num = p.num != null ? String(p.num) : name
        labels.push(new AMap.LabelMarker({
          position: toPos(f.geometry.coordinates),
          angle: p.rot ? Number(p.rot) : 0,
          text: {
            content: num,
            style: { color: '#ffffff', fontSize: 20, fontWeight: '700', strokeColor: '#111827', strokeWidth: 4 },
          },
        }))
      } else if ((kind === 'taxi-label' || kind === 'runway-label' || kind === 'stand' || kind === 'pushback') && name) {
        labels.push(new AMap.LabelMarker({
          position: toPos(f.geometry.coordinates),
          text: {
            content: name,
            style: {
              color: isStand(kind) ? '#9ca3af' : '#ffff00',
              fontSize: isStand(kind) ? 10 : 11,
              fontWeight: '600',
              strokeColor: '#000000',
              strokeWidth: 3,
            },
          },
        }))
      }
    } catch { /* 单条异常忽略 */ }
  }
  const layer = { polys, lines, labels }
  amapAirportLayers[icao] = layer
  polys.forEach(o => map.add(o))
  lines.forEach(o => map.add(o))
  if (labels.length) amapAirportLabelsLayer.add(labels)
}

function removeAirportLayerAMap(icao) {
  const layer = amapAirportLayers[icao]
  if (!layer) return
  layer.polys.forEach(o => { try { map.remove(o) } catch {} })
  layer.lines.forEach(o => { try { map.remove(o) } catch {} })
  if (layer.labels.length && amapAirportLabelsLayer) {
    try { amapAirportLabelsLayer.remove(layer.labels) } catch {}
  }
  delete amapAirportLayers[icao]
}

// ===== 机场编辑模式（开发者工具 'airport-edit'）=====
// 功能：同名牌滑行道合并为一条可编辑折线；末端绿色端点可拖动延伸；
//       双击标签/折线改名；拖动标签调整位置。编辑结果存 localStorage。
const APT_EDIT_STORE_KEY = 'cw_apt_edit_v1'   // { [icao]: { taxiLines: {name: coords[]}, labelPos: {name: [lon,lat]} } }
let aptEdit = { active: false, icao: null, lines: {}, labelPos: {}, labelCount: {}, curves: {}, stopBarPos: {}, drag: null, activeGrooveRwy: null }
const APT_HISTORY_LIMIT = 10   // 撤销/重做最大步数
let aptUndoStack = []          // 撤销栈（每个元素为一个历史快照，存操作前的状态）
let aptRedoStack = []          // 重做栈
let aptPendingSnap = null      // 上一次操作完成时的状态，下次操作时入撤销栈
let aptInlineEditEl = null        // 内联编辑输入框 DOM
let aptEditSnapshot = null        // 进入编辑模式时的机场源快照（取消时回滚用）
let aptDrawPts = []
let aptDrawTimer = null
let aptDrawLastClick = 0
function clearAptDrawState() {
  aptDrawPts = []
  clearTimeout(aptDrawTimer); aptDrawTimer = null
  aptDrawLastClick = 0
  if (mapboxMap) {
    try { if (mapboxMap.getLayer('apt-draw-line-layer')) mapboxMap.removeLayer('apt-draw-line-layer') } catch {}
    try { if (mapboxMap.getSource('apt-draw-line')) mapboxMap.removeSource('apt-draw-line') } catch {}
    try { if (mapboxMap.getLayer('apt-draw-points-layer')) mapboxMap.removeLayer('apt-draw-points-layer') } catch {}
    try { if (mapboxMap.getSource('apt-draw-points')) mapboxMap.removeSource('apt-draw-points') } catch {}
  }
}

function aptEditLoad(icao) {
  try {
    const all = JSON.parse(localStorage.getItem(APT_EDIT_STORE_KEY) || '{}')
    return all[icao] || { taxiLines: {}, labelPos: {}, labelCount: {}, curves: {}, stopBarPos: {} }
  } catch { return { taxiLines: {}, labelPos: {}, labelCount: {}, curves: {}, stopBarPos: {} } }
}

/** 保存编辑到本地，并把上一个稳定状态记入撤销历史（供 Ctrl+Z 还原） */
function aptEditSave() {
  try { syncRunwayPolygons() } catch { /* ignore */ }
  try {
    const all = JSON.parse(localStorage.getItem(APT_EDIT_STORE_KEY) || '{}')
    all[aptEdit.icao] = { taxiLines: aptEdit.lines, labelPos: aptEdit.labelPos, labelCount: aptEdit.labelCount, curves: aptEdit.curves, stopBarPos: aptEdit.stopBarPos }
    localStorage.setItem(APT_EDIT_STORE_KEY, JSON.stringify(all))
  } catch { /* 存储失败静默 */ }
  aptHistoryPush()
}

/** 捕获当前机场编辑状态（机场源 features + 编辑线等），用于撤销/重做 */
function aptHistoryCapture() {
  const src = mapboxMap ? mapboxMap.getSource(`apt-${aptEdit.icao}`) : null
  return {
    features: JSON.parse(JSON.stringify(src?._data?.features || [])),
    lines: JSON.parse(JSON.stringify(aptEdit.lines || {})),
    labelPos: JSON.parse(JSON.stringify(aptEdit.labelPos || {})),
    labelCount: JSON.parse(JSON.stringify(aptEdit.labelCount || {})),
    curves: JSON.parse(JSON.stringify(aptEdit.curves || {})),
    stopBarPos: JSON.parse(JSON.stringify(aptEdit.stopBarPos || {})),
  }
}

/** 记录一个编辑历史点：把上一次稳定状态入撤销栈（与当前相同则跳过），最多保留 APT_HISTORY_LIMIT 步，新操作清空重做栈 */
function aptHistoryPush() {
  if (!aptEdit.icao) return
  const cur = aptHistoryCapture()
  const prev = aptPendingSnap
  aptPendingSnap = cur   // 立即更新待入栈状态，避免同一次操作重复入栈
  if (!prev) return
  if (JSON.stringify(prev) !== JSON.stringify(cur)) {
    aptUndoStack.push(prev)
    if (aptUndoStack.length > APT_HISTORY_LIMIT) aptUndoStack.shift()
    aptRedoStack = []   // 新操作使重做分支失效
  }
}

/** 把某历史快照恢复到机场源与编辑状态（撤销/重做共用） */
function aptHistoryRestore(snap) {
  if (!mapboxMap || !aptEdit.icao) return
  const src = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!src) return
  src._data.features = JSON.parse(JSON.stringify(snap.features))
  src.setData(src._data)
  aptEdit.lines = JSON.parse(JSON.stringify(snap.lines || {}))
  aptEdit.labelPos = JSON.parse(JSON.stringify(snap.labelPos || {}))
  aptEdit.labelCount = JSON.parse(JSON.stringify(snap.labelCount || {}))
  aptEdit.curves = JSON.parse(JSON.stringify(snap.curves || {}))
  aptEdit.stopBarPos = JSON.parse(JSON.stringify(snap.stopBarPos || {}))
  try {
    const all = JSON.parse(localStorage.getItem(APT_EDIT_STORE_KEY) || '{}')
    all[aptEdit.icao] = { taxiLines: aptEdit.lines, labelPos: aptEdit.labelPos, labelCount: aptEdit.labelCount, curves: aptEdit.curves, stopBarPos: aptEdit.stopBarPos }
    localStorage.setItem(APT_EDIT_STORE_KEY, JSON.stringify(all))
  } catch { /* 存储失败静默 */ }
  rebuildAptEditData()
}

/** Ctrl+Z 还原：当前状态入重做栈，弹出撤销栈顶恢复，最多 10 步 */
function aptUndo() {
  if (!aptEdit.active || !aptEdit.icao) return
  if (!aptUndoStack.length) { showBanner('没有可还原的操作', { duration: 1200 }); return }
  removeRunwayToolbar()
  aptRedoStack.push(aptHistoryCapture())
  const snap = aptUndoStack.pop()
  aptPendingSnap = snap   // 待入栈 = 恢复后的状态
  aptHistoryRestore(snap)
  showBanner(`已还原（可重做 ${aptRedoStack.length} 步）`, { duration: 1400 })
}

/** Ctrl+Y 重做：当前状态入撤销栈，弹出重做栈恢复，步数取决于已还原次数 */
function aptRedo() {
  if (!aptEdit.active || !aptEdit.icao) return
  if (!aptRedoStack.length) { showBanner('没有可重做的操作', { duration: 1200 }); return }
  removeRunwayToolbar()
  aptUndoStack.push(aptHistoryCapture())
  if (aptUndoStack.length > APT_HISTORY_LIMIT) aptUndoStack.shift()
  const snap = aptRedoStack.pop()
  aptPendingSnap = snap
  aptHistoryRestore(snap)
  showBanner(`已重做（可还原 ${aptUndoStack.length} 步）`, { duration: 1400 })
}

/** 编辑模式全局快捷键：Ctrl+Z 还原 / Ctrl+Y 或 Ctrl+Shift+Z 重做（输入框内不拦截，保留原生文本撤销） */
function onAptEditKeydown(e) {
  if (!aptEdit.active || !aptEdit.icao) return
  if (!(e.ctrlKey || e.metaKey)) return
  // 焦点在输入框/文本域/可编辑元素时不拦截，保留浏览器原生文本撤销/重做
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  const k = (e.key || '').toLowerCase()
  if (k === 'z') {
    e.preventDefault()
    if (e.shiftKey) aptRedo()
    else aptUndo()
  } else if (k === 'y') {
    e.preventDefault()
    aptRedo()
  }
}

/** 弧线控制点：curves[name] = { idx: [lon,lat] }，idx 为该端点在折线中的下标，
 *  控制点坐标即"黄色端点"位置；折线经该端点相邻两段以二次贝塞尔弯曲 */
function curveKey(name, idx) { return `${name}:${idx}` }
function isCurved(name, idx) {
  const c = aptEdit.curves || {}
  return !!(c[name] && c[name][idx])
}

/** 删除某端点的弧线控制记录 */
function deleteAptCurveIndex(name, idx) {
  if (aptEdit.curves && aptEdit.curves[name]) {
    delete aptEdit.curves[name][idx]
    if (!Object.keys(aptEdit.curves[name]).length) delete aptEdit.curves[name]
  }
}

/** 单击右键端点：弧线切换（绿→黄生成箭头 / 黄→绿恢复直线重算轨迹） */
function toggleCurveEndpoint(name, idx) {
  const line = aptEdit.lines[name]
  if (!line || Number.isNaN(idx)) return
  if (isRunwayName(name) || line.length < 2 || (idx === 0 && idx === line.length - 1)) {
    if (isRunwayName(name)) showBanner('跑道端点不支持弧线', { duration: 1400 })
    return
  }
  if (isCurved(name, idx)) {
    // 黄点 → 恢复绿色，删除控制点（重算为直线轨迹）
    deleteAptCurveIndex(name, idx)
    aptEditSave(); rebuildAptEditData()
    showBanner('已恢复直线', { duration: 1200 })
    return
  }
  // 绿点 → 黄点：控制点默认在段中垂线方向偏移
  const prev = line[idx - 1] || line[idx + 1]
  const next = line[idx + 1] || line[idx - 1]
  const mx = (prev[0] + next[0]) / 2, my = (prev[1] + next[1]) / 2
  const dx = next[0] - prev[0], dy = next[1] - prev[1]
  const mag = Math.hypot(dx, dy) || 1e-9
  const [mLon, mLat] = mToDeg(40, my)
  const ctrl = [mx - (dy / mag) * mLon, my + (dx / mag) * mLat]
  ;(aptEdit.curves[name] = aptEdit.curves[name] || {})[idx] = ctrl
  aptEditSave(); rebuildAptEditData()
  showBanner('已设为弧线端点，拖动箭头调节弧度', { duration: 1800 })
}

/** 双击右键端点：删除该顶点（弧线控制点随下标移位）；仅剩两端点时降级为单点滑行道 */
function deleteAptEndpoint(name, idx) {
  const line = aptEdit.lines[name]
  if (!line || Number.isNaN(idx)) return
  if (isRunwayName(name) || isBlastPadName(name)) {
    showBanner(isRunwayName(name) ? '跑道端点不可删除，请拖动端点调整' : '防吹坪端点不可删除，请拖动端点调整', { duration: 1800 })
    return
  }
  if (line.length === 2) {
    // 只有两个端点：删除一个后仅剩 1 点 → 降级为单点滑行道
    const keep = line[idx === 0 ? 1 : 0]   // 保留的另一端点
    removeAutoFillLabels(name)             // 清掉该滑行道全部自动标签
    const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
    if (aptSrc && aptSrc._data) {
      aptSrc._data.features.push({
        type: 'Feature',
        properties: { kind: 'taxi-label', name, _addedInEdit: true },
        geometry: { type: 'Point', coordinates: keep },
      })
      aptSrc.setData(aptSrc._data)
    }
    aptEdit.lines[name] = [keep]           // 降级为单点（不画端点绿点）
    aptEdit.labelPos[name] = keep
    deleteAptCurveIndex(name, idx)
    aptEditSave(); rebuildAptEditData()
    return
  }
  line.splice(idx, 1)
  // 弧线控制点下标移位：被删端点自身控制点移除，后续点下标 -1
  if (aptEdit.curves && aptEdit.curves[name]) {
    const shifted = {}
    for (const [k, v] of Object.entries(aptEdit.curves[name])) {
      const ki = Number(k)
      if (ki === idx) continue
      shifted[ki > idx ? ki - 1 : ki] = v
    }
    if (Object.keys(shifted).length) aptEdit.curves[name] = shifted
    else delete aptEdit.curves[name]
  }
  // 删除后按该线标签模式重排（手动 N 或默认 200m）
  reflowTaxiLabels(name)
  aptEditSave(); rebuildAptEditData()
}

/** 进入/退出机场编辑模式 */
function setAirportEditMode(on) {
  aptEdit.active = on
  aptToolbarVisible.value = on
  if (on) mapboxStopSpin()   // 编辑模式停止地球自转（否则标签/端点拖不动）
  else mapboxStartSpin()     // 退出编辑恢复自转
  if (on && mapboxMap) {
    clearAptDrawState()
    // 取当前已加载机场中距视口中心最近的一个
    const loaded = [...airportLayersLoaded]
    if (loaded.length) {
      try {
        const center = mapboxMap.getCenter()
        aptEdit.icao = loaded.reduce((best, icao) => {
          const p = AIRPORT_INDEX[icao]
          if (!p) return best
          const d = (p[0] - center.lng) ** 2 + (p[1] - center.lat) ** 2
          return d < best.d ? { icao, d } : best
        }, { icao: loaded[0], d: Infinity }).icao
      } catch { aptEdit.icao = loaded[0] }
    } else {
      aptEdit.icao = null
    }
    if (aptEdit.icao) {
      showBanner(`正在编辑机场 ${aptEdit.icao}`, { duration: 2200 })
      initAptEditForIcao()
    } else {
      // 视口内无匹配机场：弹输入框让用户输入 ICAO，定位后编辑
      askEditAirportIcao()
    }
  } else {
    clearAptDrawState()
    removeRunwayToolbar()
    try { mapboxMap && mapboxMap.doubleClickZoom.enable() } catch {}
    clearAptEditOverlays()
    aptEdit.icao = null
    aptEdit.lines = {}
    aptEdit.labelPos = {}
    aptEdit.labelCount = {}
    aptEdit.curves = {}
    aptEdit.stopBarPos = {}
    aptEdit.activeGrooveRwy = null
    aptToolMode.value = null
    aptUndoStack = []
    aptRedoStack = []
    aptPendingSnap = null
    applyDevCursor()
  }
}

/** ICAO 确定后初始化编辑状态（快照/本地编辑记录/编辑图层） */
function initAptEditForIcao() {
  if (!mapboxMap || !aptEdit.icao) return
  clearAptEditOverlays()
  const src = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  aptEditSnapshot = src && src._data ? JSON.parse(JSON.stringify(src._data)) : null
  const saved = aptEditLoad(aptEdit.icao)
  aptEdit.lines = saved.taxiLines || {}
  aptEdit.labelPos = saved.labelPos || {}
  aptEdit.labelCount = saved.labelCount || {}
  aptEdit.curves = saved.curves || {}
  aptEdit.stopBarPos = saved.stopBarPos || {}
  // 撤销/重做：以进入编辑时的状态为历史基线（Ctrl+Z 最多退回此处）
  aptUndoStack = []
  aptRedoStack = []
  aptPendingSnap = aptHistoryCapture()
  buildAptEditOverlays()
  applyDevCursor()
}

/** 视口无匹配机场：弹输入框输入 ICAO，定位到该机场后进入编辑 */
function askEditAirportIcao() {
  showActionBanner({
    type: 'text',
    title: '没有匹配到机场，请输入 ICAO',
    placeholder: '如 ZHEC',
    onConfirm: (icao) => {
      const code = (icao || '').toUpperCase().replace(/\s/g, '')
      if (!code) return
      const pos = AIRPORT_INDEX[code]
      if (!pos) {
        showBanner(`机场 ${code} 不存在`, { duration: 2500 })
        setAirportEditMode(false)   // 输入机场不存在：弹出横幅并关闭机场编辑
        return
      }
      aptEdit.icao = code
      try { mapboxMap.flyTo({ center: pos, zoom: 12, duration: 1200 }) } catch {}
      waitAirportLoaded(code, () => {
        showBanner(`正在编辑机场 ${code}`, { duration: 2200 })
        initAptEditForIcao()
      })
    },
  })
}

/** 等待指定机场加载完成（自动触发加载），超时提示数据不存在 */
function waitAirportLoaded(code, cb) {
  if (airportLayersLoaded.has(code)) { cb(); return }
  let tries = 0
  loadAirportLayer(code)   // 主动加载（不依赖视口判定）
  const check = () => {
    if (airportLayersLoaded.has(code)) { cb(); return }
    if (++tries > 25) { showBanner(`机场 ${code} 数据不存在`, { duration: 2500 }); return }
    setTimeout(check, 300)
  }
  setTimeout(check, 300)
}

// ===== 机场编辑悬浮工具栏 =====
const aptToolbarVisible = ref(false)
const aptToolbarPos = ref({ x: window.innerWidth - 376, y: 180 })
const aptToolMode = ref(null)   // 'add-runway'|'add-taxi'|'add-runway-label'|'add-taxi-label'|'add-stand'|'add-area-*'
const APT_POLY_MODES = ['add-runway', 'add-taxi', 'add-runway-label', 'add-taxi-label', 'add-groove']   // 折线绘制类：单击加点/双击结束
const APT_DRAW_MODES = ['add-runway', 'add-taxi']   // 生成几何的绘制（需至少两个点）

// 下拉分组展开/收起：移出后 500ms 防抖隐藏
const aptDropOpen = ref(null)   // 当前展开的分组索引 0/1/2
let aptDropTimer = null
function aptDropEnter(i) {
  clearTimeout(aptDropTimer)
  aptDropOpen.value = i
}
function aptDropLeave(i) {
  clearTimeout(aptDropTimer)
  aptDropTimer = setTimeout(() => { if (aptDropOpen.value === i) aptDropOpen.value = null }, 500)
}

function toggleAptToolMode(mode) {
  aptToolMode.value = aptToolMode.value === mode ? null : mode
  clearAptDrawState()   // 切换工具时清空未完成的绘制
  removeRunwayToolbar()
  // 绘制模式禁用双击缩放（双击用于结束绘制），退出绘制模式恢复
  if (mapboxMap) {
    try {
      if (APT_POLY_MODES.includes(aptToolMode.value)) mapboxMap.doubleClickZoom.disable()
      else mapboxMap.doubleClickZoom.enable()
    } catch {}
  }
  // 切换放置模式时改变地图光标为十字
  applyDevCursor()
}

/** 工具栏拖动手柄 */
function startAptToolbarDrag(e) {
  const startX = e.clientX - aptToolbarPos.value.x
  const startY = e.clientY - aptToolbarPos.value.y
  const onMove = (ev) => {
    aptToolbarPos.value = {
      x: Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - startX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - startY)),
    }
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

/** 确认：TODO 后续对接服务器保存接口；当前先持久化本地 */
function aptEditConfirm() {
  aptEditSave()
  showBanner('机场编辑已保存（本地）', { duration: 2000 })
}

/** 提交到服务器：把当前机场编辑后的完整 GeoJSON POST 给后端，需输入 WEB_SECRET 密码校验
 *  密码输入用全局动作横幅（右侧滑入，提交后缩回） */
async function aptEditSubmit() {
  if (!aptEdit.active || !aptEdit.icao) return
  const icao = aptEdit.icao
  const src = mapboxMap.getSource(`apt-${icao}`)
  if (!src || !src._data) return showBanner('未找到机场数据', { duration: 2000 })
  showActionBanner({
    type: 'secret',
    title: '输入提交密码',
    placeholder: '提交密码',
    onConfirm: async (password) => {
      try {
        const res = await adminApi.submitAirport(icao, { secret: password, geojson: src._data })
        showBanner(res.data?.message || '提交成功', { duration: 2500 })
        reloadAirportLayer(icao)   // 提交后立即重载该机场，优先使用新提交版（无需刷新页面）
      } catch (e) {
        const msg = e.response?.data?.message || e.message
        showBanner('提交失败: ' + msg, { duration: 3000 })
      }
    },
  })
}

/** 强制重新加载某机场图层 */
function reloadAirportLayer(icao) {
  if (!mapboxMap) return
  airportGjCache.delete(icao)   // 提交后数据已变，清掉内存缓存强制重新 fetch
  removeAirportLayer(icao)   // 删除源/图层并清空 airportLayersLoaded 标记
  loadAirportLayer(icao)     // 重新 fetch
}

/** 取消：丢弃本次所有编辑，恢复进入编辑前的状态（含编号改名/新增标牌/折线） */
function aptEditCancel() {
  hideActionBanner()   // 取消所有更改时同时收起密码/动作横幅
  if (!aptEdit.icao) return
  // 清空该机场的本地编辑记录
  try {
    const all = JSON.parse(localStorage.getItem(APT_EDIT_STORE_KEY) || '{}')
    delete all[aptEdit.icao]
    localStorage.setItem(APT_EDIT_STORE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
  // 恢复进入编辑模式时的机场源快照（回滚改名/新增标牌等一切改动）
  const src = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (src && aptEditSnapshot) {
    src._data = JSON.parse(JSON.stringify(aptEditSnapshot))
    src.setData(src._data)
  }
  // 退出再重进编辑模式以刷新
  mapSettings.setDevTool('airport-edit')   // toggle off
}

/** 把同名牌的 taxi-label 点按名称分组，生成初始折线（点排序后连线） */
function buildAptEditOverlays() {
  if (!mapboxMap || !aptEdit.icao) return
  const srcId = `apt-edit-${aptEdit.icao}`
  if (!mapboxMap.getSource(srcId)) {
    mapboxMap.addSource(srcId, { type: 'geojson', data: emptyFC() })
    // 折线（青色）
    mapboxMap.addLayer({
      id: `${srcId}-line`, type: 'line', source: srcId,
      filter: ['==', ['get', 'kind'], 'line'],
      paint: { 'line-color': '#22d3ee', 'line-width': 2.5, 'line-opacity': 0.9 },
    })
    // 端点小绿点（可拖动延伸）；中间顶点小号绿点；弧线控制点黄色
    mapboxMap.addLayer({
      id: `${srcId}-handle`, type: 'circle', source: srcId,
      filter: ['==', ['get', 'kind'], 'handle'],
      paint: {
        'circle-radius': ['case', ['==', ['get', 'mid'], true], 3.5, 6],
        'circle-color': ['case', ['==', ['get', 'curve'], true], '#eab308', '#22c55e'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.2,
      },
    })
    // 弧线控制箭头（细长三角，从黄色端点沿弯曲方向延伸，可拖动调节弧度）
    mapboxMap.addLayer({
      id: `${srcId}-curve-arrow`, type: 'circle', source: srcId,
      filter: ['==', ['get', 'kind'], 'curve-arrow'],
      paint: {
        'circle-radius': 4,
        'circle-color': '#eab308',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    })
    bindAptEditEvents(srcId)
  }
  rebuildAptEditData()
}

function emptyFC() {
  return { type: 'FeatureCollection', features: [] }
}

/** 根据当前 GeoJSON 中同名牌编号点 + 已保存编辑，重建折线/端点数据 */
function rebuildAptEditData() {
  if (!mapboxMap || !aptEdit.icao) return
  const srcId = `apt-edit-${aptEdit.icao}`
  // 已编辑过的线以 aptEdit.lines 为准（拖动中不被原始点覆盖）；
  // 仅对尚未编辑过的名称从机场源收集同名牌编号点生成初始折线。
  // 注意：用 source._data（完整数据）而非 querySourceFeatures（仅视口内瓦片缓存，
  // 视口外的同名点会丢失导致连线断开）
  const groups = {}
  try {
    const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
    const allFeats = aptSrc?._data?.features || []
    for (const f of allFeats) {
      if (f.properties.kind === 'runway') {
        const name = f.properties.ids
        if (!name) continue
        if (aptEdit.lines[name] || (aptEdit.drag && aptEdit.drag.name === name)) continue
        const ring = f.geometry.coordinates?.[0]
        if (!ring || ring.length < 4) continue
        aptEdit.lines[name] = [ring[0], ring[1], ring[2], ring[3]]   // 矩形四角（可拖动调整）
        continue
      }
      if (f.properties.kind === 'centerline') {
        const clName = f.properties.name
        if (!clName) continue
        if (aptEdit.lines[clName] || (aptEdit.drag && aptEdit.drag.name === clName)) continue
        const coords = f.geometry.coordinates
        if (coords && coords.length >= 2) {
          aptEdit.lines[clName] = [coords[0], coords[coords.length - 1]]
        }
        continue
      }
      if (f.properties.kind !== 'taxi-label') continue
      const name = f.properties.name
      if (!name) continue
      // 该名称已有编辑记录（或正在拖动）→ 跳过原始点收集
      if (aptEdit.lines[name] || (aptEdit.drag && aptEdit.drag.name === name)) continue
      const c = f.geometry.coordinates
      ;(groups[name] = groups[name] || []).push(c)
    }
  } catch { /* ignore */ }
  for (const [name, coords] of Object.entries(groups)) {
    if (coords.length >= 2) aptEdit.lines[name] = orderPoints(coords)
  }
  // 标签补齐不在 rebuild 内自动触发：拖动中频繁重算会卡顿且间距抖动，
  // 由具体编辑动作（拖动结束/删除端点/新增端点）显式调用 fillTaxiLabelsAlongLines()
  const features = []
  // 收集机场源中各名称标签的真实位置（用于选中连线指向）
  const labelPos = {}
  try {
    const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
    for (const f of (aptSrc?._data?.features || [])) {
      if (f.properties.kind === 'taxi-label' && f.properties.name) {
        labelPos[f.properties.name] = f.geometry.coordinates
      }
    }
  } catch { /* ignore */ }
  for (const [name, rawPts] of Object.entries(aptEdit.lines)) {
    if (name.endsWith('·sb')) continue
    // 去重相邻重复点
    const pts = (rawPts || []).filter((p, i) => i === 0 || Math.abs(p[0] - rawPts[i-1][0]) > 1e-9 || Math.abs(p[1] - rawPts[i-1][1]) > 1e-9)
    if (!pts.length) continue
    // 防吹坪外端角点（`跑道·bp`）：只显示 4 个可拖动端点，不生成连线
    if (name.endsWith('·bp')) {
      aptEdit.lines[name] = pts
      for (let idx = 0; idx < pts.length; idx++) {
        features.push({
          type: 'Feature',
          properties: { kind: 'handle', name, idx, mid: false, curve: false },
          geometry: { type: 'Point', coordinates: pts[idx] },
        })
      }
      continue
    }
    aptEdit.lines[name] = pts
    if (pts.length === 1) {
      // 单点滑行道：不生成绿色端点（仅保留标签本身；单击改编号/拖动移动/双击变线段）
      continue
    }
    const isRw = isRunwayName(name) || isGrooveName(name) || isTaxiwayName(name)
    // 弧线：对每个带控制点的顶点，其相邻两段用二次贝塞尔（P0-控制点-P1）采样（跑道/刻槽/滑行道矩形不弯曲）
    const curved = aptEdit.curves && aptEdit.curves[name] ? aptEdit.curves[name] : null
    let lineCoords
    if (isRw) {
      lineCoords = [...pts.map(p => [...p]), [...pts[0]]]   // 跑道矩形闭合线
    } else {
      lineCoords = []
      const N_CURVE = 16   // 每段弧采样数
      for (let i = 0; i < pts.length; i++) {
        const hasCtrl = curved && curved[i] && (i > 0 || i < pts.length - 1)
        if (hasCtrl && i > 0) {
          const ctrl = curved[i]
          for (let t = 1; t <= N_CURVE; t++) {
            const u = t / N_CURVE
            lineCoords.push([
              (1-u)*(1-u)*pts[i-1][0] + 2*(1-u)*u*ctrl[0] + u*u*pts[i][0],
              (1-u)*(1-u)*pts[i-1][1] + 2*(1-u)*u*ctrl[1] + u*u*pts[i][1],
            ])
          }
        } else if (i > 0) {
          lineCoords.push(pts[i])
        }
        if (i === 0) lineCoords.push(pts[0])
      }
    }
    features.push({
      type: 'Feature',
      properties: { kind: 'line', name },
      geometry: { type: 'LineString', coordinates: lineCoords },
    })
    // 所有顶点显示绿点（弧线控制点黄色）；跑道矩形四角全为大点；中间顶点小号
    for (let idx = 0; idx < pts.length; idx++) {
      const isEnd = isRw ? false : (idx === 0 || idx === pts.length - 1)
      const isCurve = !!(curved && curved[idx])
      features.push({
        type: 'Feature',
        properties: { kind: 'handle', name, idx, mid: !isEnd, curve: isCurve },
        geometry: { type: 'Point', coordinates: pts[idx] },
      })
      // 弧线控制箭头：从端点沿"端点→控制点"方向延伸的细箭头（小圆点表示，可拖动）
      if (isCurve && curved[idx]) {
        features.push({
          type: 'Feature',
          properties: { kind: 'curve-arrow', name, idx },
          geometry: { type: 'Point', coordinates: curved[idx] },
        })
      }
    }
  }
  mapboxMap.getSource(srcId).setData({ type: 'FeatureCollection', features })
}

/** 沿折线按间隔均匀排列同名标签。
 *  调用前需先用 removeAllLabels(name) 清除该滑行道全部旧标签，
 *  然后从折线起点起按累计里程每 TAXI_LABEL_SPACING 米放一个
 *  同名 taxi-label 点（写入机场源，打 _addedInEdit 标记可随取消回滚）。 */
const TAXI_LABEL_SPACING = 400   // 米

function fillTaxiLabelsAlongLines() {
  if (!mapboxMap || !aptEdit.icao) return
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  let added = false
  for (const [name, pts] of Object.entries(aptEdit.lines)) {
    if (!pts || pts.length < 2) continue
    if (isRunwayName(name) || isGrooveName(name) || isCenterlineName(name) || isStopBarName(name) || isBlastPadName(name) || isTaxiwayName(name)) continue   // 跑道/刻槽/中心线/停止线/防吹坪/滑行道矩形不生成滑行道标签
    const midLat = pts.reduce((s, p) => s + p[1], 0) / pts.length
    const mLat = 1 / 111320.0
    const mLon = 1 / (111320.0 * Math.cos(midLat * Math.PI / 180))
    // 预计算各段长度
    const segs = []
    let total = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const segLenM = Math.hypot((b[0] - a[0]) / mLon, (b[1] - a[1]) / mLat)
      if (segLenM < 1e-6) continue
      segs.push({ a, b, len: segLenM })
      total += segLenM
    }
    if (!segs.length) continue
    // 沿折线累计里程均匀走：nextAt 是下一个标签的里程位置，跨段连续
    let placed = 0
    let nextAt = TAXI_LABEL_SPACING
    let carried = 0
    for (const { a, b, len } of segs) {
      while (nextAt <= carried + len) {
        const t = (nextAt - carried) / len
        aptSrc._data.features.push({
          type: 'Feature',
          properties: { kind: 'taxi-label', name, _addedInEdit: true },
          geometry: { type: 'Point', coordinates: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] },
        })
        placed++
        added = true
        nextAt += TAXI_LABEL_SPACING
      }
      carried += len
    }
    // 线段总长不足一个间距时也保证至少一个标签（放在折线中点，避免删除后标签消失）
    if (placed === 0) {
      let walk = total / 2
      for (const { a, b, len } of segs) {
        if (walk <= len) {
          const t = len ? walk / len : 0
          aptSrc._data.features.push({
            type: 'Feature',
            properties: { kind: 'taxi-label', name, _addedInEdit: true },
            geometry: { type: 'Point', coordinates: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] },
          })
          added = true
          break
        }
        walk -= len
      }
    }
  }
  if (added) aptSrc.setData(aptSrc._data)
}

/** 清除某滑行道的自动标签（保留手动 _fixed 标签），供重算前清理。
 *  手动拖动/添加的标签带 _fixed 标记，重排时不被删除 */
function removeAutoFillLabels(name) {
  if (!mapboxMap || !aptEdit.icao) return
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  aptSrc._data.features = aptSrc._data.features.filter(f =>
    !(f.properties.kind === 'taxi-label' && f.properties.name === name && !f.properties._fixed))
  aptSrc.setData(aptSrc._data)
}

// ===== 跑道设置工具栏：点击跑道端点弹出（功能复选框+按钮 / 材质互斥），每变更一个重渲染 =====
let runwayToolbar = null        // 当前跑道设置工具栏 DOM
let runwayToolbarClose = null   // 外部点击关闭监听
let lastRunwayShow = 0          // 最近一次显示时间（区分端点点击与空白点击产生的 click）

/** 在鼠标旁显示跑道设置工具栏：功能（跑道号/停止线/防吹坪复选框 + 中心线/地面刻槽按钮）与材质（跑道/防吹坪沥青/混凝土互斥），每变更一个重渲染 */
function showRunwayToolbar(clientX, clientY, name) {
  removeRunwayToolbar()
  if (clientX == null || clientY == null) return
  lastRunwayShow = Date.now()
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  const rw = aptSrc?._data?.features.find(f => f.properties.kind === 'runway' && f.properties.ids === name)
  if (!rw) return
  const p = rw.properties
  const bar = document.createElement('div')
  bar.className = 'apt-runway-bar'
  bar.style.left = (clientX + 14) + 'px'
  bar.style.top = (clientY - 12) + 'px'
  const title = document.createElement('div')
  title.className = 'apt-runway-title'
  title.textContent = `跑道 ${name} 设置`
  bar.appendChild(title)
  // 变更后统一重算附属要素并重渲染/保存
  const refresh = () => {
    syncRunwayExtras(name, aptEdit.lines[name])
    aptSrc.setData(aptSrc._data)
    aptEditSave()
    rebuildAptEditData()
  }
  const countExtras = (k) => aptSrc._data.features.filter(f =>
    f.properties.rwy === name && f.properties._addedInEdit && (
      (k === 'runway-no' && f.properties.kind === 'runway-no')
      || (k === 'stop-bar' && f.properties.kind === 'stop-bar')
      || (k === 'blast-pad' && (f.properties.kind === 'blast-pad' || f.properties.kind === 'blast-pad-area'))
    )
  ).length

  // —— 功能分组：复选框（跑道号/停止线/防吹坪）+ 按钮（中心线/地面刻槽）——
  const funcGroup = document.createElement('div')
  funcGroup.className = 'apt-runway-group'
  const funcTitle = document.createElement('div')
  funcTitle.className = 'apt-runway-group-title'
  funcTitle.textContent = '功能'
  funcGroup.appendChild(funcTitle)
  const bpMatBtns = []
  for (const o of [
    { key: '_runwayNo', label: '跑道号', kind: 'runway-no' },
    { key: '_stopBar', label: '停止线', kind: 'stop-bar' },
    { key: '_blastPad', label: '防吹坪', kind: 'blast-pad' },
  ]) {
    const label = document.createElement('label')
    label.className = 'apt-runway-opt'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = !!p[o.key]
    cb.onchange = () => {
      p[o.key] = cb.checked
      if (o.key === '_blastPad') {
        // 防吹坪未勾选时禁用防吹坪材质按钮
        for (const b of bpMatBtns) b.disabled = !cb.checked
      }
      refresh()
      if (cb.checked) showBanner(`已生成${o.label}纹理（${countExtras(o.kind)} 处）`, { duration: 1800 })
      else showBanner(`已移除${o.label}纹理`, { duration: 1500 })
    }
    label.appendChild(cb)
    label.appendChild(document.createTextNode(o.label))
    funcGroup.appendChild(label)
  }
  // 按钮：中心线 / 地面刻槽（点击切换开/关，开启态高亮）
  const btnRow = document.createElement('div')
  btnRow.className = 'apt-runway-btn-row'
  const makeBtn = (key, label, onEnable, onDisable) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'apt-runway-btn' + (p[key] ? ' active' : '')
    b.textContent = label
    b.title = `${label}（${p[key] ? '点击关闭' : '点击开启'}）`
    b.onclick = () => {
      const next = !p[key]
      p[key] = next
      b.classList.toggle('active', next)
      b.title = `${label}（${next ? '点击关闭' : '点击开启'}）`
      if (next && onEnable) onEnable()
      if (!next && onDisable) onDisable()
      refresh()
      showBanner(next ? `已开启${label}` : `已关闭${label}`, { duration: 1200 })
    }
    return b
  }
  btnRow.appendChild(makeBtn('_centerline', '中心线'))
  btnRow.appendChild(makeBtn('_groove', '地面刻槽',
    () => {
      // 勾选进入绘制模式
      aptEdit.activeGrooveRwy = name
      aptToolMode.value = 'add-groove'
      try { mapboxMap.doubleClickZoom.disable() } catch {}
      applyDevCursor()
      showBanner('单击绘制地面刻槽，双击结束', { duration: 2200 })
    },
    () => {
      // 取消移除全部刻槽
      aptEdit.activeGrooveRwy = null
      if (aptToolMode.value === 'add-groove') aptToolMode.value = null
      try { mapboxMap.doubleClickZoom.enable() } catch {}
      applyDevCursor()
      removeRunwayGrooves(name)
      showBanner('已移除地面刻槽', { duration: 1500 })
    }))
  funcGroup.appendChild(btnRow)
  bar.appendChild(funcGroup)

  // —— 材质分组：跑道材质 / 防吹坪材质（沥青/混凝土互斥）——
  const matGroup = document.createElement('div')
  matGroup.className = 'apt-runway-group'
  const matTitle = document.createElement('div')
  matTitle.className = 'apt-runway-group-title'
  matTitle.textContent = '材质'
  matGroup.appendChild(matTitle)
  const addMaterialRow = (rowTitle, getMat, setMat) => {
    const lab = document.createElement('div')
    lab.className = 'apt-runway-mat-label'
    lab.textContent = rowTitle
    matGroup.appendChild(lab)
    const row = document.createElement('div')
    row.className = 'apt-runway-mat-row'
    const btns = []
    const cur = getMat()
    for (const v of ['asphalt', 'concrete']) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'apt-runway-mat-btn' + (cur === v ? ' active' : '')
      b.textContent = v === 'asphalt' ? '沥青材质' : '混凝土材质'
      b.onclick = () => {
        setMat(v)
        for (const x of row.children) x.classList.remove('active')
        b.classList.add('active')
        refresh()
      }
      row.appendChild(b)
      btns.push(b)
    }
    matGroup.appendChild(row)
    return btns
  }
  addMaterialRow('跑道材质', () => p._material || 'asphalt', (v) => { p._material = v })
  for (const b of addMaterialRow('防吹坪材质', () => p._blastPadMaterial || 'asphalt', (v) => { p._blastPadMaterial = v })) bpMatBtns.push(b)
  // 防吹坪未勾选时禁用防吹坪材质按钮
  for (const b of bpMatBtns) b.disabled = !p._blastPad
  bar.appendChild(matGroup)

  document.body.appendChild(bar)
  runwayToolbar = bar
  runwayToolbarClose = (ev) => {
    if (!bar.contains(ev.target)) removeRunwayToolbar()
  }
  setTimeout(() => document.addEventListener('mousedown', runwayToolbarClose), 0)
}

function removeRunwayToolbar() {
  if (runwayToolbarClose) { document.removeEventListener('mousedown', runwayToolbarClose); runwayToolbarClose = null }
  if (runwayToolbar) { runwayToolbar.remove(); runwayToolbar = null }
}

// ===== 标签数量工具栏：点击端点选中整条线段，鼠标右上角弹 1-5，按数量均分标签 =====
let labelCountBar = null        // 当前显示的标签数量工具栏 DOM
let lastLabelCountShow = 0      // 最近一次显示时间（用于区分“端点点击”与“空白点击”产生的 click）

/** 在鼠标右上角显示 1-5 标签数量工具栏 */
function showLabelCountToolbar(clientX, clientY, name) {
  removeLabelCountToolbar()
  if (clientX == null || clientY == null) return
  lastLabelCountShow = Date.now()
  const bar = document.createElement('div')
  bar.className = 'apt-label-count-bar'
  bar.style.left = (clientX + 14) + 'px'
  bar.style.top = (clientY - 46) + 'px'
  const title = document.createElement('span')
  title.className = 'apt-label-count-title'
  title.textContent = '标签'
  bar.appendChild(title)
  for (let n = 1; n <= 5; n++) {
    const b = document.createElement('button')
    b.className = 'apt-label-count-btn'
    b.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17"><rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${n}</text></svg>`
    b.title = `整条线段生成 ${n} 个标签（按长度均分）`
    b.onclick = () => {
      removeLabelCountToolbar()
      placeTaxiLabelsByCount(name, n)
    }
    bar.appendChild(b)
  }
  document.body.appendChild(bar)
  labelCountBar = bar
}

function removeLabelCountToolbar() {
  if (labelCountBar) {
    labelCountBar.remove()
    labelCountBar = null
  }
}

/** 沿整条折线按长度平均分生成 count 个同名标签（清空旧标签后重排），并记住该线的手动标签数 */
function placeTaxiLabelsByCount(name, count) {
  if (!mapboxMap || !aptEdit.icao) return
  if (isRunwayName(name) || isGrooveName(name) || isCenterlineName(name) || isStopBarName(name) || isBlastPadName(name) || isTaxiwayName(name)) return   // 跑道/刻槽/中心线/停止线/防吹坪/滑行道矩形不做标签均分
  const line = aptEdit.lines[name]
  if (!line || line.length < 2) return
  const N = Math.max(1, Math.floor(Number(count) || 1))
  aptEdit.labelCount[name] = N   // 记住手动数量，后续拖动/加点/删点仍按 N 均分
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  // 主动均分：清空该线全部标签（含手动 _fixed），重新按 N 均分
  aptSrc._data.features = aptSrc._data.features.filter(f =>
    !(f.properties.kind === 'taxi-label' && f.properties.name === name))
  const midLat = line.reduce((s, p) => s + p[1], 0) / line.length
  const mLat = 1 / 111320.0
  const mLon = 1 / (111320.0 * Math.cos(midLat * Math.PI / 180))
  // 各段长度
  const segs = []
  let total = 0
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1]
    const len = Math.hypot((b[0] - a[0]) / mLon, (b[1] - a[1]) / mLat)
    if (len < 1e-6) continue
    segs.push({ a, b, len })
    total += len
  }
  if (!segs.length) return
  // 均分：第 i 个标签放在 total*(i+0.5)/N 处（各段中点，避开两端点）
  for (let i = 0; i < N; i++) {
    let walk = total * (i + 0.5) / N
    let placed = null
    for (const { a, b, len } of segs) {
      if (walk <= len) {
        const t = len ? walk / len : 0
        placed = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        break
      }
      walk -= len
    }
    if (!placed) placed = [...line[line.length - 1]]
    aptSrc._data.features.push({
      type: 'Feature',
      properties: { kind: 'taxi-label', name, _addedInEdit: true },
      geometry: { type: 'Point', coordinates: placed },
    })
  }
  aptSrc.setData(aptSrc._data)
  aptEditSave()
  rebuildAptEditData()
}

/** 按线的标签模式重排：手动选过 N（labelCount）则按 N 均分，否则默认 200m 间隔 */
function reflowTaxiLabels(name) {
  if (!mapboxMap || !aptEdit.icao) return
  removeAutoFillLabels(name)
  const n = aptEdit.labelCount ? aptEdit.labelCount[name] : 0
  if (n) placeTaxiLabelsByCount(name, n)
  else fillTaxiLabelsAlongLines()
}

/** 贪心最近邻把散点串成折线。
 *  策略：先找相距最远的两点作为折线两端，然后从两端同时向内
 *  各自吸附最近的剩余点——比单端贪心更贴合滑行道真实走向。 */
function orderPoints(pts) {
  if (pts.length <= 2) return [...pts]
  const remaining = pts.map(p => [...p])
  // 1. 找最远点对作为初始两端
  let a = remaining[0], b = remaining[1], bestD = -1, bestI = [0, 1]
  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const d = (remaining[i][0] - remaining[j][0]) ** 2 + (remaining[i][1] - remaining[j][1]) ** 2
      if (d > bestD) { bestD = d; bestI = [i, j] }
    }
  }
  const head = [remaining[bestI[0]]]
  const tail = [remaining[bestI[1]]]
  remaining.splice(Math.max(bestI[0], bestI[1]), 1)
  remaining.splice(Math.min(bestI[0], bestI[1]), 1)
  // 2. 从两端交替吸附最近点（每次吸到距离更近的一端）
  while (remaining.length) {
    let side = null, bi = 0, bd = Infinity
    remaining.forEach((p, i) => {
      const dh = (p[0] - head[head.length - 1][0]) ** 2 + (p[1] - head[head.length - 1][1]) ** 2
      const dt = (p[0] - tail[tail.length - 1][0]) ** 2 + (p[1] - tail[tail.length - 1][1]) ** 2
      if (dh < dt && dh < bd) { bd = dh; side = 'head'; bi = i }
      else if (dt <= dh && dt < bd) { bd = dt; side = 'tail'; bi = i }
    })
    const p = remaining.splice(bi, 1)[0]
    ;(side === 'head' ? head : tail).push(p)
  }
  return [...head, ...tail.reverse()]
}

/** 编辑层交互：端点拖动(移动) / 双击线条加点 / 双击空白新增标牌 / 双击端点改名 */
function bindAptEditEvents(srcId) {
  const canvas = mapboxMap.getCanvas()

  // 点击空白处关闭标签数量/跑道设置工具栏（排除端点刚点击产生的 click，300ms 内不关）
  mapboxMap.on('click', () => {
    if (aptEdit.active && labelCountBar && Date.now() - lastLabelCountShow > 300) {
      removeLabelCountToolbar()
    }
    if (aptEdit.active && runwayToolbar && Date.now() - lastRunwayShow > 300) {
      removeRunwayToolbar()
    }
  })

  // ===== 绘制跑道/滑行道（add-runway / add-taxi：单击放起点/中间点，双击终点结束 → 输入名称生成）=====
  const removeAptDrawPreview = () => {
    try {
      if (mapboxMap.getLayer('apt-draw-line-layer')) mapboxMap.removeLayer('apt-draw-line-layer')
      if (mapboxMap.getSource('apt-draw-line')) mapboxMap.removeSource('apt-draw-line')
      if (mapboxMap.getLayer('apt-draw-points-layer')) mapboxMap.removeLayer('apt-draw-points-layer')
      if (mapboxMap.getSource('apt-draw-points')) mapboxMap.removeSource('apt-draw-points')
    } catch {}
  }
  const updateAptDrawPreview = () => {
    if (!mapboxMap || !aptDrawPts.length) return
    const coords = aptDrawPts.length === 1 ? [aptDrawPts[0], aptDrawPts[0]] : aptDrawPts
    const ptFC = {
      type: 'FeatureCollection',
      features: aptDrawPts.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })),
    }
    if (!mapboxMap.getSource('apt-draw-line')) {
      mapboxMap.addSource('apt-draw-line', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } })
      mapboxMap.addLayer({ id: 'apt-draw-line-layer', type: 'line', source: 'apt-draw-line', paint: { 'line-color': '#22d3ee', 'line-width': 2, 'line-dasharray': [2, 2] } })
      mapboxMap.addSource('apt-draw-points', { type: 'geojson', data: ptFC })
      mapboxMap.addLayer({ id: 'apt-draw-points-layer', type: 'circle', source: 'apt-draw-points', paint: { 'circle-radius': 5, 'circle-color': '#22d3ee', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } })
    } else {
      mapboxMap.getSource('apt-draw-line')?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
      mapboxMap.getSource('apt-draw-points')?.setData(ptFC)
    }
  }
  const finishAptDraw = () => {
    const pts = aptDrawPts
    aptDrawPts = []
    clearTimeout(aptDrawTimer); aptDrawTimer = null
    aptDrawLastClick = 0
    removeAptDrawPreview()
    const mode = aptToolMode.value
    // 几何绘制（跑道/滑行道）需至少两个点；标签类单点可只放一个标签
    if (pts.length < 2 && APT_DRAW_MODES.includes(mode)) {
      showBanner('至少需要两个点才能绘制', { duration: 1600 })
      return
    }
    if (mode === 'add-runway') askRunwayName(pts)
    else if (mode === 'add-taxi') askTaxiwayName(pts)
    else if (mode === 'add-runway-label') askRunwayLabelName(pts)
    else if (mode === 'add-taxi-label') askTaxiLabelName(pts)
    else if (mode === 'add-groove') addGrooveFromLine(pts)
  }
  // 单击放置起点/中间点；双击结束绘制
  mapboxMap.on('click', (e) => {
    if (!aptEdit.active || !aptEdit.icao) return
    if (!APT_POLY_MODES.includes(aptToolMode.value)) return
    // 落在编辑层要素上不参与绘制
    const hit = mapboxMap.queryRenderedFeatures(e.point) || []
    if (hit.some(f => f.properties && ['handle', 'line', 'taxi-label', 'stand-label'].includes(f.properties.kind))) return
    aptDrawPts.push([e.lngLat.lng, e.lngLat.lat])
    updateAptDrawPreview()
  })
  mapboxMap.on('dblclick', (e) => {
    if (!aptEdit.active || !aptEdit.icao) return
    if (!APT_POLY_MODES.includes(aptToolMode.value)) return
    const hit = mapboxMap.queryRenderedFeatures(e.point) || []
    if (hit.some(f => f.properties && ['handle', 'line', 'taxi-label', 'stand-label'].includes(f.properties.kind))) return
    if (aptDrawPts.length) aptDrawPts.pop()
    finishAptDraw()
  })

  // 悬停端点/折线变手势
  mapboxMap.on('mouseenter', `${srcId}-handle`, () => { canvas.style.cursor = 'grab' })
  mapboxMap.on('mouseleave', `${srcId}-handle`, () => { canvas.style.cursor = '' })
  // 悬停弧线箭头变手势
  mapboxMap.on('mouseenter', `${srcId}-curve-arrow`, () => { canvas.style.cursor = 'grab' })
  mapboxMap.on('mouseleave', `${srcId}-curve-arrow`, () => { canvas.style.cursor = '' })

  // 拖动弧线控制箭头 → 移动该端点的弧线控制点（实时重算弧线轨迹）
  mapboxMap.on('mousedown', `${srcId}-curve-arrow`, (e) => {
    if (!aptEdit.active) return
    if (e.originalEvent && e.originalEvent.button !== 0) return   // 仅左键拖动（右键取消弧线）
    e.preventDefault()
    const feat = e.features && e.features[0]
    if (!feat) return
    const name = feat.properties.name
    const idx = Number(feat.properties.idx)
    if (!aptEdit.curves[name] || !aptEdit.curves[name][idx]) return
    try { mapboxMap.dragPan.disable() } catch {} 
    canvas.style.cursor = 'grabbing'
    const onMove = (ev) => {
      if (!aptEdit.curves[name]) return
      aptEdit.curves[name][idx] = [ev.lngLat.lng, ev.lngLat.lat]
      rebuildAptEditData()
    }
    const onUp = () => {
      try { mapboxMap.dragPan.enable() } catch {} 
      canvas.style.cursor = ''
      aptEditSave()
      rebuildAptEditData()
      mapboxMap.off('mousemove', onMove)
      mapboxMap.off('mouseup', onUp)
    }
    mapboxMap.on('mousemove', onMove)
    mapboxMap.on('mouseup', onUp)
  })

  // 端点按下 → 拖动即移动该端点（不新增）；单击（未拖动）→ 选中线段显示标签数量工具栏
  mapboxMap.on('mousedown', `${srcId}-handle`, (e) => {
    if (!aptEdit.active) return
    if (e.originalEvent && e.originalEvent.button !== 0) return   // 仅左键（右键走 contextmenu 删除端点）
    e.preventDefault()
    const feat = e.features && e.features[0]
    if (!feat) return
    const name = feat.properties.name
    const idx = Number(feat.properties.idx)
    const line = aptEdit.lines[name]
    if (!line || Number.isNaN(idx)) return
    try { mapboxMap.dragPan.disable() } catch {} 
    aptEdit.drag = { name, idx }
    canvas.style.cursor = 'grabbing'
    let dragged = false
    const dragStartPt = { x: e.point.x, y: e.point.y }
    const onMove = (ev) => {
      if (!aptEdit.drag) return
      if (!dragged && Math.hypot(ev.point.x - dragStartPt.x, ev.point.y - dragStartPt.y) > 3) {
        dragged = true
      }
      if (!dragged) return
      const ln = aptEdit.lines[aptEdit.drag.name]
      if (!ln) return
      // 直接移动被拖的端点（idx 精确定位，不新增点）
      ln[aptEdit.drag.idx] = [ev.lngLat.lng, ev.lngLat.lat]
      rebuildAptEditData()
    }
    const onUp = () => {
      try { mapboxMap.dragPan.enable() } catch {} 
      const dragName = aptEdit.drag ? aptEdit.drag.name : null
      aptEdit.drag = null
      canvas.style.cursor = ''
      if (!dragged && dragName && aptEdit.active) {
        const oe = e.originalEvent
        if (isRunwayName(dragName)) {
          // 跑道端点：弹出"跑道设置"工具栏
          showRunwayToolbar(oe && oe.clientX, oe && oe.clientY, dragName)
        } else if (!isGrooveName(dragName) && !isCenterlineName(dragName) && !isStopBarName(dragName) && !isBlastPadName(dragName) && !isTaxiwayName(dragName)) {
          // 滑行道端点：鼠标右上角显示"标签数量"工具栏
          showLabelCountToolbar(oe && oe.clientX, oe && oe.clientY, dragName)
        }
        mapboxMap.off('mousemove', onMove)
        mapboxMap.off('mouseup', onUp)
        return
      }
      // 拖动结束：按该线标签模式重排（跑道/刻槽/中心线/停止线/防吹坪/滑行道矩形不重排）
      if (dragName && !isRunwayName(dragName) && !isGrooveName(dragName) && !isCenterlineName(dragName) && !isStopBarName(dragName) && !isBlastPadName(dragName) && !isTaxiwayName(dragName)) reflowTaxiLabels(dragName)
      // 停止线锚点：拖动结束后用新锚点重建竖条（按跑道 corners 重算方向向量）
      if (dragName && isStopBarName(dragName)) {
        const rwyN = String(dragName).replace(/·sb$/, '')
        const rwFeat = (mapboxMap.getSource(`apt-${aptEdit.icao}`)?._data?.features || []).find(f => f.properties.kind === 'runway' && f.properties.ids === rwyN)
        const ring = rwFeat?.geometry?.coordinates?.[0]
        if (ring && ring.length >= 4) syncRunwayExtras(rwyN, [ring[0], ring[1], ring[2], ring[3]])
      }
      // 防吹坪外端角点：拖动结束后用新角点重建材质矩形（按跑道 corners 重算）
      if (dragName && isBlastPadName(dragName)) {
        const rwyN = String(dragName).replace(/·bp$/, '')
        const rwFeat = (mapboxMap.getSource(`apt-${aptEdit.icao}`)?._data?.features || []).find(f => f.properties.kind === 'runway' && f.properties.ids === rwyN)
        const ring = rwFeat?.geometry?.coordinates?.[0]
        if (ring && ring.length >= 4) syncRunwayExtras(rwyN, [ring[0], ring[1], ring[2], ring[3]])
      }
      rebuildAptEditData()
      aptEditSave()
      mapboxMap.off('mousemove', onMove)
      mapboxMap.off('mouseup', onUp)
    }
    mapboxMap.on('mousemove', onMove)
    mapboxMap.on('mouseup', onUp)
  })

  // 单击滑行道标签/停机位标签 → 编辑编号
  bindLabelClickEdit()

  // 右键黄点（弧线控制箭头）→ 取消该端点弧线，恢复绿色直线
  mapboxMap.on('contextmenu', `${srcId}-curve-arrow`, (e) => {
    if (!aptEdit.active) return
    e.preventDefault()
    const feat = e.features && e.features[0]
    if (!feat) return
    const name = feat.properties.name
    const idx = Number(feat.properties.idx)
    if (aptEdit.curves && aptEdit.curves[name]) {
      deleteAptCurveIndex(name, idx)
      aptEditSave()
      rebuildAptEditData()
      showBanner('已恢复直线', { duration: 1200 })
    }
  })
  // 右键端点：单击 → 弧线切换（绿↔黄）；双击右键 → 删除该端点
  let handleCtxTimer = null, handleCtxInfo = null
  mapboxMap.on('contextmenu', `${srcId}-handle`, (e) => {
    if (!aptEdit.active) return
    e.preventDefault()
    const feat = e.features && e.features[0]
    if (!feat) return
    const name = feat.properties.name
    const idx = Number(feat.properties.idx)
    const line = aptEdit.lines[name]
    if (!line || Number.isNaN(idx)) return
    const now = Date.now()
    if (handleCtxInfo && handleCtxInfo.name === name && handleCtxInfo.idx === idx && now - handleCtxInfo.time < 250) {
      // 双击右键 → 删除端点
      clearTimeout(handleCtxTimer); handleCtxTimer = null; handleCtxInfo = null
      deleteAptEndpoint(name, idx)
      return
    }
    clearTimeout(handleCtxTimer)
    handleCtxInfo = { name, idx, time: now }
    handleCtxTimer = setTimeout(() => {
      handleCtxTimer = null; handleCtxInfo = null
      toggleCurveEndpoint(name, idx)
    }, 250)
  })

  // 线段点击：双击 → 插入端点；三击 → 在该位置添加一个该线段编号的标签
  // （用 mousedown+mouseup 计数 + 延迟判定区分双击/三击；拖动地图则重置计数）
  // 拦截线段上的 dblclick，避免冒泡触发地图级"新建滑行道"
  mapboxMap.on('dblclick', `${srcId}-line`, (e) => { if (aptEdit.active) e.preventDefault() })

  // 双击手动滑行道矩形面 → 在点击位置投影到最近中心线段插入端点（即"双击矩形线段加点"）
  const taxiFillLayer = `apt-${aptEdit.icao}-taxiway-fill`
  if (mapboxMap.getLayer(taxiFillLayer)) {
    mapboxMap.on('dblclick', taxiFillLayer, (e) => {
      if (!aptEdit.active || APT_POLY_MODES.includes(aptToolMode.value)) return
      e.preventDefault()
      const feat = e.features && e.features[0]
      if (!feat) return
      const name = feat.properties.name
      const line = aptEdit.lines[name]
      if (!line || line.length < 2) return
      const pt = [e.lngLat.lng, e.lngLat.lat]
      let bestSeg = 0, bestD = Infinity
      for (let i = 0; i < line.length - 1; i++) {
        const d = distToSeg(pt, line[i], line[i + 1])
        if (d < bestD) { bestD = d; bestSeg = i }
      }
      const a = line[bestSeg], b = line[bestSeg + 1]
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const len2 = dx * dx + dy * dy
      let t = len2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2 : 0
      t = Math.max(0, Math.min(1, t))
      line.splice(bestSeg + 1, 0, [a[0] + t * dx, a[1] + t * dy])
      reflowTaxiLabels(name)
      aptEditSave()
      rebuildAptEditData()
    })
  }

  let lineDblTimer = null, lineClicks = 0, lineClickName = null, lineClickLast = 0
  mapboxMap.on('mousedown', `${srcId}-line`, (e) => {
    if (!aptEdit.active) return
    if (e.originalEvent && e.originalEvent.button !== 0) return   // 仅左键
    const feat = e.features && e.features[0]
    if (!feat) return
    const name = feat.properties.name
    const line = aptEdit.lines[name]
    if (!line || line.length < 2) return
    const sx = e.point.x, sy = e.point.y
    let moved = false
    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.point.x - sx, ev.point.y - sy) > 3) moved = true
    }
    const onUp = () => {
      mapboxMap.off('mousemove', onMove)
      mapboxMap.off('mouseup', onUp)
      if (moved) { lineClicks = 0; return }   // 拖动地图，不计为点击
      const now = Date.now()
      if (name !== lineClickName || now - lineClickLast > 400) lineClicks = 0
      lineClicks++
      lineClickLast = now
      lineClickName = name
      const pt = [e.lngLat.lng, e.lngLat.lat]
      // 跑道中心线：不做插点/加标签，仅端点拖动调整
      if (isRunwayName(name)) return
      if (lineClicks >= 3) {
        // 三击：取消待执行的加点，改为在鼠标位置添加该线段编号的标签
        clearTimeout(lineDblTimer); lineDblTimer = null
        lineClicks = 0
        addTaxiLabelOnLine(name, pt)
        return
      }
      // 第二次点击后延迟执行"加点"；若 350ms 内第三次点击则转三击
      clearTimeout(lineDblTimer)
      lineDblTimer = setTimeout(() => {
        lineDblTimer = null
        lineClicks = 0
        let bestSeg = 0, bestD = Infinity
        for (let i = 0; i < line.length - 1; i++) {
          const d = distToSeg(pt, line[i], line[i + 1])
          if (d < bestD) { bestD = d; bestSeg = i }
        }
        line.splice(bestSeg + 1, 0, pt)
        reflowTaxiLabels(name)
        aptEditSave()
        rebuildAptEditData()
      }, 350)
    }
    mapboxMap.on('mousemove', onMove)
    mapboxMap.on('mouseup', onUp)
  })

  // 双击端点 → 重命名该滑行道
  mapboxMap.on('dblclick', `${srcId}-handle`, (e) => {
    if (!aptEdit.active) return
    e.preventDefault()
    const feat = e.features && e.features[0]
    if (!feat) return
    const oldName = feat.properties.name
    showActionBanner({
      type: 'text',
      title: '输入滑行道新名称',
      placeholder: oldName,
      onConfirm: (newName) => {
        if (!newName || newName === oldName) return
        aptEdit.lines[newName] = aptEdit.lines[oldName]
        delete aptEdit.lines[oldName]
        // 跑道：同步 Polygon 的 ids
        if (isRunwayName(oldName)) {
          const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
          const rf = aptSrc?._data?.features.find(x => x.properties.kind === 'runway' && x.properties.ids === oldName)
          if (rf) { rf.properties.ids = newName; aptSrc.setData(aptSrc._data) }
        }
        // 滑行道：同步 taxiway feature 的 name
        if (isTaxiwayName(oldName)) {
          const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
          const tf = aptSrc?._data?.features.find(x => x.properties.kind === 'taxiway' && x.properties._addedInEdit && x.properties.name === oldName)
          if (tf) { tf.properties.name = newName; aptSrc.setData(aptSrc._data) }
        }
        aptEditSave()
        rebuildAptEditData()
        renameTaxiLabels(oldName, newName)
      },
    })
  })

  // 双击地图空白处 → 新增一个滑行道标牌（输入名称，生成单点；再点同名点可连线）
  mapboxMap.on('dblclick', (e) => {
    if (!aptEdit.active || !aptEdit.icao) return
    // 折线绘制模式：双击用于结束绘制，不新增标牌
    if (APT_POLY_MODES.includes(aptToolMode.value)) return
    // 落在编辑层要素上的双击已由上方处理器处理（defaultPrevented）
    if (e.defaultPrevented) return
    // 仅双击纯空白处才新增标牌：命中机场任何地面/标注要素则跳过
    const hit = mapboxMap.queryRenderedFeatures(e.point) || []
    const hitKinds = ['runway', 'taxiway', 'groove', 'centerline', 'blast-pad', 'runway-no', 'taxi-label', 'runway-label', 'stand', 'pushback', 'handle', 'line', 'curve-arrow']
    if (hit.some(f => f.properties && hitKinds.includes(f.properties.kind))) return
    showActionBanner({
      type: 'text',
      title: '输入新滑行道标牌名称',
      placeholder: '滑行道名称',
      onConfirm: (name) => {
        if (!name) return
        addAirportLabel('taxi-label', name, [e.lngLat.lng, e.lngLat.lat])
      },
    })
  })

  // 停机位模式：单击地图放置一个编号标签（跑道/滑行道标签改由折线绘制流程处理）
  mapboxMap.on('click', (e) => {
    if (!aptEdit.active || !aptEdit.icao) return
    const mode = aptToolMode.value
    // 区域类：待实现，提示
    if (mode === 'add-area-gnd' || mode === 'add-area-apron' || mode === 'add-area-tower') {
      showBanner('区域绘制功能待实现', { duration: 1500 })
      return
    }
    if (mode !== 'add-stand') return
    const oe = e.originalEvent
    if (oe && oe.defaultPrevented) return
    showActionBanner({
      type: 'text',
      title: '输入停机位编号',
      placeholder: '停机位编号',
      onConfirm: (name) => {
        if (!name) return
        addAirportLabel('stand', name, [e.lngLat.lng, e.lngLat.lat])
      },
    })
    // 放置后保持模式激活，可连续放置；再次点工具栏按钮退出
  })
}

/** 向机场源添加一个标牌点（打 _addedInEdit 标记供取消时回滚） */
function addAirportLabel(kind, name, coords) {
  if (!mapboxMap || !aptEdit.icao) return
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (aptSrc && aptSrc._data) {
    aptSrc._data.features.push({
      type: 'Feature',
      properties: { kind, name, _addedInEdit: true, _fixed: true },   // 手动添加的标签固定，不被自动重排覆盖
      geometry: { type: 'Point', coordinates: coords },
    })
    aptSrc.setData(aptSrc._data)
  }
  aptEditSave()
}

/** 三击线段：在该位置添加一个该线段编号（name）的标签 */
function addTaxiLabelOnLine(name, pt) {
  if (!mapboxMap || !aptEdit.icao) return
  addAirportLabel('taxi-label', name, pt)
  if (aptEdit.labelCount) delete aptEdit.labelCount[name]   // 手动加标签 → 退出 N 均分模式，保留固定位置
  showBanner(`已在线段添加编号 ${name}`, { duration: 1500 })
}

// ===== 单击加点 / 双击结束绘制：跑道、滑行道生成 =====
function askTaxiwayName(pts) {
  showActionBanner({
    type: 'text',
    title: '输入滑行道名称',
    placeholder: '如 A',
    onConfirm: (name) => { if (name) addTaxiwayLine(name, pts) },
  })
}

function askRunwayName(pts) {
  showActionBanner({
    type: 'text',
    title: '输入跑道编号',
    placeholder: '如 01/19',
    onConfirm: (name) => { if (name) addRunwayFromLine(name, pts) },
  })
}

/** 标签类"跑道"：沿绘制轨迹每个点放置同名跑道编号标签（单点只放一个，不生成线/端点） */
function askRunwayLabelName(pts) {
  showActionBanner({
    type: 'text',
    title: '输入跑道编号',
    placeholder: '如 01',
    onConfirm: (name) => { if (name) addLabelsAlongPts('runway-label', name, pts) },
  })
}

/** 标签类"滑行道"：沿绘制轨迹每个点放置同名滑行道编号标签（单点只放一个，不生成线/端点） */
function askTaxiLabelName(pts) {
  showActionBanner({
    type: 'text',
    title: '输入滑行道名称',
    placeholder: '如 A',
    onConfirm: (name) => { if (name) addLabelsAlongPts('taxi-label', name, pts) },
  })
}

/** 在每个绘制点上放置同名标签（固定 _fixed，不参与自动重排） */
function addLabelsAlongPts(kind, name, pts) {
  if (!mapboxMap || !aptEdit.icao) return
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  if (!pts || !pts.length) return
  for (const c of pts) {
    aptSrc._data.features.push({
      type: 'Feature',
      properties: { kind, name, _addedInEdit: true, _fixed: true },
      geometry: { type: 'Point', coordinates: c },
    })
  }
  aptSrc.setData(aptSrc._data)
  // 多点：同时生成可编辑线段 + 端点（与绘制类一致）；单点只放一个标签，不生成端点
  if (pts.length >= 2 && !aptEdit.lines[name]) {
    aptEdit.lines[name] = pts
  }
  rebuildAptEditData()
  aptEditSave()
  showBanner(`已添加 ${pts.length} 个 ${name} 标签${pts.length >= 2 ? '（含线段端点）' : ''}`, { duration: 1500 })
}

/** 单击加点生成滑行道折线（写入机场源 + 进入编辑折线，两端有绿色端点可拖动调整） */
/** 添加滑行道：生成 30m 宽矩形区域，端点 = 4 + 2*中间点个数（角点直接可拖动调整） */
function addTaxiwayLine(name, pts) {
  if (!mapboxMap || !aptEdit.icao) return
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  if (!pts || pts.length < 2) return
  // 重名：确认覆盖（删除旧同名后新建）
  if (aptSrc._data.features.some(f => f.properties.kind === 'taxiway' && f.properties.name === name)) {
    showActionBanner({
      type: 'confirm',
      title: `滑行道 ${name} 已存在，是否覆盖？`,
      onConfirm: () => overwriteTaxiway(name, pts),
    })
    return
  }
  createTaxiway(name, pts)
}

function createTaxiway(name, pts) {
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  // 30m 宽矩形区域（带状多边形）
  const band = taxiwayBand(pts, 30)
  // 角点 = 去掉闭合点（left + right 反转），点数 = 4 + 2*中间点个数
  const corners = band ? band.slice(0, -1) : null
  aptSrc._data.features.push({
    type: 'Feature',
    properties: { kind: 'taxiway', name, _addedInEdit: true },
    geometry: { type: 'Polygon', coordinates: band ? [band] : [] },
  })
  aptSrc.setData(aptSrc._data)
  // 角点进入编辑折线 → 每个角点一个绿色端点，可拖动调整形状/大小
  aptEdit.lines[name] = corners || pts
  rebuildAptEditData()
  aptEditSave()
  showBanner(`已添加滑行道 ${name}`, { duration: 1500 })
}

/** 覆盖同名滑行道：删除旧的（含其标签/编辑记录）后新建 */
function overwriteTaxiway(name, pts) {
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  aptSrc._data.features = aptSrc._data.features.filter(f => !(f.properties.kind === 'taxiway' && f.properties.name === name))
  delete aptEdit.lines[name]
  delete aptEdit.labelPos[name]
  delete aptEdit.labelCount[name]
  aptSrc.setData(aptSrc._data)
  createTaxiway(name, pts)
}

/** 由中心线两端点计算 45m 宽跑道矩形环（含闭合点） */
function runwayRing(p1, p2) {
  return rectFromLine(p1, p2, 45)
}

/** 由线段两端点计算 widthM 米宽矩形环（含闭合点） */
function rectFromLine(p1, p2, widthM) {
  const midLat = (p1[1] + p2[1]) / 2
  const cosLat = Math.cos(midLat * Math.PI / 180)
  const halfW = (widthM / 2) / 111320.0
  const vx = p2[0] - p1[0], vy = p2[1] - p1[1]
  const mag = Math.hypot(vx, vy)
  if (mag < 1e-9) return null
  const px = -vy / mag, py = vx / mag   // 垂直方向
  const hx = px * halfW / cosLat, hy = py * halfW
  return [
    [p1[0] + hx, p1[1] + hy],
    [p2[0] + hx, p2[1] + hy],
    [p2[0] - hx, p2[1] - hy],
    [p1[0] - hx, p1[1] - hy],
    [p1[0] + hx, p1[1] + hy],
  ]
}

/** 沿中心线折线生成固定宽度（米）的带状多边形环（含闭合点），用于滑行道矩形区域。
 *  使用 miter（斜接）顶点法线：转折处保持宽度，避免 90° 转角被压缩 */
function taxiwayBand(pts, widthM) {
  if (!pts || pts.length < 2) return null
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const [mLon, mLat] = mToDeg(widthM / 2, lat)
  // 顶点 i 处的 left 侧偏移方向与 miter 长度因子
  const miter = (i) => {
    const cur = pts[i]
    const px = i > 0 ? pts[i - 1][0] : cur[0], py = i > 0 ? pts[i - 1][1] : cur[1]
    const nx = i < pts.length - 1 ? pts[i + 1][0] : cur[0], ny = i < pts.length - 1 ? pts[i + 1][1] : cur[1]
    let d1x = cur[0] - px, d1y = cur[1] - py
    let d2x = nx - cur[0], d2y = ny - cur[1]
    const m1 = Math.hypot(d1x, d1y) || 1e-9, m2 = Math.hypot(d2x, d2y) || 1e-9
    const u1x = d1x / m1, u1y = d1y / m1, u2x = d2x / m2, u2y = d2y / m2
    const n1x = -u1y, n1y = u1x, n2x = -u2y, n2y = u2x   // left 法线
    let mx = n1x + n2x, my = n1y + n2y
    let f = 1
    const mm = Math.hypot(mx, my)
    if (mm > 1e-9) {
      mx /= mm; my /= mm
      // sin(θ/2) = |n1+n2|/2 = mm/2；miter 长度 = 1/sin(θ/2)（限制最小角度避免爆尖角）
      const sinH = Math.sqrt(Math.max(0, 1 - mm * mm / 4))
      f = sinH > 0.25 ? 1 / sinH : 3
    } else { mx = n1x; my = n1y; f = 1 }   // 180° 折返用单段法线
    return { x: mx, y: my, f }
  }
  const left = [], right = []
  for (let i = 0; i < pts.length; i++) {
    const { x, y, f } = miter(i)
    const c = pts[i]
    const ox = x * mLon * f, oy = y * mLat * f
    left.push([c[0] + ox, c[1] + oy])
    right.push([c[0] - ox, c[1] - oy])
  }
  return [...left, ...right.reverse(), [...left[0]]]
}

/** 判断名称是否对应机场源中的跑道（kind:'runway'，ids===name） */
function isRunwayName(name) {
  if (!mapboxMap || !aptEdit.icao || !name) return false
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  const feats = aptSrc?._data?.features || []
  return feats.some(f => f.properties.kind === 'runway' && f.properties.ids === name)
}

/** 判断名称是否对应机场源中的地面刻槽（kind:'groove'，name===name） */
function isGrooveName(name) {
  if (!mapboxMap || !aptEdit.icao || !name) return false
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  const feats = aptSrc?._data?.features || []
  return feats.some(f => f.properties.kind === 'groove' && f.properties.name === name)
}

/** 判断名称是否对应机场源中的跑道中心线（kind:'centerline'，name===name） */
function isCenterlineName(name) {
  if (!mapboxMap || !aptEdit.icao || !name) return false
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  const feats = aptSrc?._data?.features || []
  return feats.some(f => f.properties.kind === 'centerline' && f.properties.name === name)
}

/** 判断名称是否对应停止线锚点（kind:'stop-bar'，name===name） */
function isStopBarName(name) {
  if (!mapboxMap || !aptEdit.icao || !name) return false
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  const feats = aptSrc?._data?.features || []
  return feats.some(f => f.properties.kind === 'stop-bar' && f.properties.name === name)
}

/** 判断名称是否对应防吹坪外端锚点（kind:'blast-pad-area'，name===name） */
function isBlastPadName(name) {
  if (!mapboxMap || !aptEdit.icao || !name) return false
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  const feats = aptSrc?._data?.features || []
  return feats.some(f => f.properties.kind === 'blast-pad-area' && f.properties.name === name)
}

/** 判断名称是否对应手动绘制的滑行道（kind:'taxiway' && _addedInEdit，name===name） */
function isTaxiwayName(name) {
  if (!mapboxMap || !aptEdit.icao || !name) return false
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  const feats = aptSrc?._data?.features || []
  return feats.some(f => f.properties.kind === 'taxiway' && f.properties._addedInEdit && f.properties.name === name)
}

/** 保存时同步：把已编辑跑道的四角铺成机场源里的跑道矩形，并重算跑道号/中心线/防吹坪 */
function syncRunwayPolygons() {
  if (!mapboxMap || !aptEdit.icao) return
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  const feats = aptSrc._data.features
  for (const [name, pts] of Object.entries(aptEdit.lines)) {
    if (!pts || pts.length < 2) continue
    const rw = feats.find(x => x.properties.kind === 'runway' && x.properties.ids === name)
    if (rw) {
      const ring = pts.length === 4 ? [...pts.map(p => [...p]), [...pts[0]]] : runwayRing(pts[0], pts[pts.length - 1])
      if (ring) rw.geometry.coordinates = [ring]
      syncRunwayExtras(name, pts)   // 重算跑道号/中心线/防吹坪
      continue
    }
    const gr = feats.find(x => x.properties.kind === 'groove' && x.properties.name === name)
    if (gr && pts.length === 4) {
      gr.geometry.coordinates = [[...pts.map(p => [...p]), [...pts[0]]]]
      continue
    }
    // 中心线独立端点（`跑道·cl`）：拖动端点更新中心线线段
    const cl = feats.find(x => x.properties.kind === 'centerline' && x.properties.name === name)
    if (cl && pts.length >= 2) {
      cl.geometry.coordinates = [pts[0], pts[pts.length - 1]]
      continue
    }
    // 手动绘制的滑行道（kind:'taxiway' 角点矩形）：拖动角点后用角点闭合重建
    const tw = feats.find(x => x.properties.kind === 'taxiway' && x.properties._addedInEdit && x.properties.name === name)
    if (tw && pts.length >= 4) {
      tw.geometry.coordinates = [[...pts.map(p => [...p]), [...pts[0]]]]
    }
  }
  aptSrc.setData(aptSrc._data)
}

/** 米 → 度（经度按纬度缩放），返回 [degLon, degLat] */
function mToDeg(m, lat) {
  const mLat = 1 / 111320.0
  const mLon = 1 / (111320.0 * Math.cos(lat * Math.PI / 180))
  return [m * mLon, m * mLat]
}

/** 跑道矩形四角 → 中心线两端（沿跑道长度方向） */
function runwayEndpoints(corners) {
  return [
    [(corners[0][0] + corners[3][0]) / 2, (corners[0][1] + corners[3][1]) / 2],
    [(corners[1][0] + corners[2][0]) / 2, (corners[1][1] + corners[2][1]) / 2],
  ]
}

/** 拆分跑道号 "01/19" → ["01","19"] */
function runwayNumbers(ids) {
  const parts = String(ids).split('/').map(s => s.trim())
  if (parts.length >= 2) return [parts[0], parts[1]]
  return [String(ids), String(ids)]
}

/** 根据跑道勾选状态生成/移除附属要素：
 *  跑道号 runway-no / 中心线 centerline / 停止线 stop-bar / 防吹坪 blast-pad */
function syncRunwayExtras(name, corners) {
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  const rw = aptSrc._data.features.find(f => f.properties.kind === 'runway' && f.properties.ids === name)
  if (!rw) return
  const p = rw.properties
  // corners 缺失时从跑道 Polygon 环提取四角（兜底，保证勾选即能生成纹理）
  if (!corners || corners.length < 4) {
    const ring = rw.geometry.coordinates?.[0]
    corners = ring && ring.length >= 4 ? [ring[0], ring[1], ring[2], ring[3]] : null
  }
  if (!corners) return
  // 清理该跑道旧附属（仅当仍勾选跑道号时保留拖动固定的位置；中心线/停止线/防吹坪等按 rwy 关联清理）
  aptSrc._data.features = aptSrc._data.features.filter(f => {
    const k = f.properties.kind
    if (k === 'runway-no' && p._runwayNo && f.properties._fixed && f.properties.rwy === name) return true
    const isExtra = k === 'runway-no' || k === 'centerline' || k === 'blast-pad' || k === 'blast-pad-area' || k === 'stop-bar'
    return !(isExtra && f.properties.rwy === name && f.properties._addedInEdit)
  })
  // 取消中心线时移除其独立 lines 端点
  if (!p._centerline) delete aptEdit.lines[`${name}·cl`]
  // 取消防吹坪时移除其独立 lines 外端锚点
  if (!p._blastPad) delete aptEdit.lines[`${name}·bp`]
  const [e0, e1] = runwayEndpoints(corners)
  const lat = (e0[1] + e1[1]) / 2
  const [mLon, mLat] = mToDeg(1, lat)
  let dxEastM = (e1[0] - e0[0]) / mLon, dyNorthM = (e1[1] - e0[1]) / mLat
  const len = Math.hypot(dxEastM, dyNorthM) || 1
  const cosA = dxEastM / len, sinA = dyNorthM / len   // 方向余弦（无量纲）
  const vx = -sinA * mLon, vy = cosA * mLat   // 垂直方向每米度偏移
  const ux = cosA * mLon, uy = sinA * mLat    // 长度方向每米度偏移
  const push = (ft) => aptSrc._data.features.push(ft)
  // —— 跑道号：两端尾部 20m，大号白字，垂直跑道排列、两端镜像对称（用户拖动固定位置保留）——
  if (p._runwayNo) {
    const nums = runwayNumbers(name)
    const hasFixed = aptSrc._data.features.some(f => f.properties.kind === 'runway-no' && f.properties.rwy === name && f.properties._fixed)
    if (!hasFixed) {
      // 文字垂直跑道：以跑道方位角逆时针旋转 90°，两端镜像对称（差 180°）
      const bearing = Math.atan2(cosA, sinA) * 180 / Math.PI
      const rot0 = bearing
      const rot1 = bearing - 180
      push({ type:'Feature', properties:{ kind:'runway-no', name, rwy:name, idx:0, num:nums[0], rot:rot0, _addedInEdit:true, _fixed:true }, geometry:{ type:'Point', coordinates:[e0[0] + ux * 20, e0[1] + uy * 20] } })
      push({ type:'Feature', properties:{ kind:'runway-no', name, rwy:name, idx:1, num:nums[1], rot:rot1, _addedInEdit:true, _fixed:true }, geometry:{ type:'Point', coordinates:[e1[0] - ux * 20, e1[1] - uy * 20] } })
      ensureRunwayNoIcons(nums)   // 注册跑道号自定义字体图标（HOOG0554）
    }
  }
  // —— 中心线：白色虚线，两端生成可拖动端点 ——
  if (p._centerline) {
    const clName = `${name}·cl`
    let clPts = aptEdit.lines[clName]
    if (!clPts || clPts.length < 2) { clPts = [e0, e1]; aptEdit.lines[clName] = clPts }
    push({ type:'Feature', properties:{ kind:'centerline', name:clName, rwy:name, _addedInEdit:true, _fixed:true }, geometry:{ type:'LineString', coordinates:[clPts[0], clPts[clPts.length - 1]] } })
  }
  // —— 停止线：两端各一排纵向白色短线，共 12 条，中间留空避让中心线（|||||| |||||| 居中）。
  if (p._stopBar) {
    const saved = (aptEdit.stopBarPos && aptEdit.stopBarPos[name]) || {}
    const eps = [
      { end: 0, c: saved.e0 || [e0[0] + ux * 18, e0[1] + uy * 18] },
      { end: 1, c: saved.e1 || [e1[0] - ux * 18, e1[1] - uy * 18] },
    ]
    const GAP = 2.8      // 中心留空宽度（米，避让中心线）
    const N = 6        // 每侧条数（共 12 条）
    const BW = 32    // 每条纵向短线长度
    const STEP = 3  // 相邻条中心间距
    for (const { end, c } of eps) {
      // 从中心空隙边缘起，左右两侧各 N 条按 STEP 等距排布（居中对称）
      for (const side of [-1, 1]) {
        for (let i = 0; i < N; i++) {
          const off = side * (GAP / 2 + STEP * (i + 0.5))
          const a = [c[0] + vx * off - ux * (BW / 2), c[1] + vy * off - uy * (BW / 2)]
          const b = [c[0] + vx * off + ux * (BW / 2), c[1] + vy * off + uy * (BW / 2)]
          push({ type:'Feature', properties:{ kind:'stop-bar', rwy:name, end, _addedInEdit:true }, geometry:{ type:'LineString', coordinates:[a, b] } })
        }
      }
    }
  }
  // —— 防吹坪：保留两端黄色 ^ 条纹，另在跑道两端各生成一个与末端端点相连的材质矩形区域（外端两个角点作为可拖动端点）——
  if (p._blastPad) {
    // 原有黄色 ^ 条纹：两端尾部外 20m 起，各 3 条，尖端朝跑道内侧
    const ends = [
      { end: e0, dir: -1 },
      { end: e1, dir: 1 },
    ]
    for (const { end, dir } of ends) {
      for (let j = 0; j < 3; j++) {
        const c = [end[0] + ux * dir * (20 + j * 8), end[1] + uy * dir * (20 + j * 8)]
        const w = 12 - j * 2
        const left = [c[0] - vx * w, c[1] - vy * w]
        const right = [c[0] + vx * w, c[1] + vy * w]
        const apex = [c[0] - ux * dir * 6, c[1] - uy * dir * 6]   // 尖端朝跑道内侧
        push({ type:'Feature', properties:{ kind:'blast-pad', rwy:name, _addedInEdit:true }, geometry:{ type:'LineString', coordinates:[left, apex, right] } })
      }
    }
    // 防吹坪材质矩形区域：两端各一个与跑道末端相连的矩形，外端两个角点作为可拖动端点（与跑道等宽）
    const BP_LEN = 60   // 默认防吹坪长度（米，跑道末端外延伸）
    const bpName = `${name}·bp`
    let bpPts = aptEdit.lines[bpName]
    if (!bpPts || bpPts.length < 4) {
      // 默认：外端两角点由跑道末端两角点沿跑道方向向外平移 BP_LEN
      bpPts = [
        [corners[0][0] - ux * BP_LEN, corners[0][1] - uy * BP_LEN],   // e0 端上角
        [corners[3][0] - ux * BP_LEN, corners[3][1] - uy * BP_LEN],   // e0 端下角
        [corners[1][0] + ux * BP_LEN, corners[1][1] + uy * BP_LEN],   // e1 端上角
        [corners[2][0] + ux * BP_LEN, corners[2][1] + uy * BP_LEN],   // e1 端下角
      ]
      aptEdit.lines[bpName] = bpPts
    }
    const bpMat = p._blastPadMaterial || 'asphalt'
    const pushArea = (ring) => {
      push({ type:'Feature', properties:{ kind:'blast-pad-area', name:bpName, rwy:name, _material: bpMat, _addedInEdit:true }, geometry:{ type:'Polygon', coordinates:[[...ring, [...ring[0]]]] } })
    }
    // e0 端矩形：内侧边为跑道末端短边 corners[3]→corners[0]，外侧边为外端角点 bpPts[1]→bpPts[0]
    pushArea([corners[3], corners[0], bpPts[0], bpPts[1]])
    // e1 端矩形：内侧边为跑道末端短边 corners[1]→corners[2]，外侧边为外端角点 bpPts[3]→bpPts[2]
    pushArea([corners[1], corners[2], bpPts[3], bpPts[2]])
  }
}

/** 移除某跑道的全部地面刻槽（取消勾选时） */
function removeRunwayGrooves(rwyName) {
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  for (const f of aptSrc._data.features) {
    if (f.properties.kind === 'groove' && f.properties.rwy === rwyName && f.properties._addedInEdit) {
      delete aptEdit.lines[f.properties.name]
    }
  }
  aptSrc._data.features = aptSrc._data.features.filter(f => !(f.properties.kind === 'groove' && f.properties.rwy === rwyName && f.properties._addedInEdit))
  aptSrc.setData(aptSrc._data)
}

/** 单击加点生成跑道：首尾点中心线 + 垂直 45m 宽矩形 Polygon（编号存 ids），中心线两端生成绿色端点可拖动调整 */
function addRunwayFromLine(ids, pts) {
  if (!mapboxMap || !aptEdit.icao) return
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  if (!pts || pts.length < 2) return
  const p1 = pts[0]
  const p2 = pts[pts.length - 1]
  const ring = runwayRing(p1, p2)
  if (!ring) return
  aptSrc._data.features.push({
    type: 'Feature',
    properties: { kind: 'runway', ids, _addedInEdit: true },
    geometry: { type: 'Polygon', coordinates: [ring] },
  })
  aptSrc.setData(aptSrc._data)
  // 跑道矩形四角进入编辑折线 → 生成 4 个绿色端点，可拖动调整大小/位置
  aptEdit.lines[ids] = [ring[0], ring[1], ring[2], ring[3]]
  rebuildAptEditData()
  aptEditSave()
  showBanner(`已添加跑道 ${ids}`, { duration: 1500 })
}

/** 地面刻槽：绘制线段 → 生成 1m 宽矩形（4 个端点可拖动调整大小），关联当前跑道 */
function addGrooveFromLine(pts) {
  if (!mapboxMap || !aptEdit.icao) return
  const rwy = aptEdit.activeGrooveRwy
  if (!rwy) { showBanner('请先勾选某跑道的"地面刻槽"', { duration: 1800 }); return }
  if (!pts || pts.length < 2) return
  const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!aptSrc || !aptSrc._data) return
  const p1 = pts[0], p2 = pts[pts.length - 1]
  const ring = rectFromLine(p1, p2, 1)   // 宽度默认 1 米
  if (!ring) return
  let n = 0
  for (const f of aptSrc._data.features) if (f.properties.kind === 'groove' && f.properties.rwy === rwy) n++
  const gname = `${rwy}·g${n}`
  aptSrc._data.features.push({
    type: 'Feature',
    properties: { kind: 'groove', rwy, name: gname, _addedInEdit: true },
    geometry: { type: 'Polygon', coordinates: [ring] },
  })
  aptSrc.setData(aptSrc._data)
  aptEdit.lines[gname] = [ring[0], ring[1], ring[2], ring[3]]
  rebuildAptEditData()
  aptEditSave()
  showBanner(`已添加地面刻槽 ${gname}（拖动四角调整大小）`, { duration: 1800 })
}

/** 点到线段距离（度平方近似，用于最近段判断） */
function distToSeg(p, a, b) {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], px = p[0], py = p[1]
  const dx = bx - ax, dy = by - ay
  if (dx === 0 && dy === 0) return (px - ax) ** 2 + (py - ay) ** 2
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
  t = Math.max(0, Math.min(1, t))
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
}

/** 滑行道/停机位标签交互：
 *  - 滑行道标签：按下→拖动即移动该标签位置（>5px 判定拖动）；未拖动→单击内联编辑编号；
 *    双击单点滑行道标签 → 生成两个端点变线段
 *  - 停机位标签：单击内联编辑编号（保持原逻辑） */
function bindLabelClickEdit() {
  if (!mapboxMap || !aptEdit.icao) return
  const icao = aptEdit.icao
  const taxiLayer = `apt-${icao}-taxiway-label`
  const standLayer = `apt-${icao}-stand-label`
  const canvas = mapboxMap.getCanvas()

  // —— 滑行道标签 ——
  if (mapboxMap.getLayer(taxiLayer)) {
    let editTimer = null   // 单击编辑延迟触发：双击(生成端点)时清除，避免冲突
    // 按下：拖动检测 + 未拖动视为单击编辑
    mapboxMap.on('mousedown', taxiLayer, (e) => {
      if (!aptEdit.active) return
      if (e.originalEvent && e.originalEvent.button !== 0) return   // 仅左键（右键不改编号）
      e.preventDefault()
      const feat = e.features && e.features[0]
      if (!feat) return
      const oldName = feat.properties.name
      if (!oldName) return
      try { mapboxMap.dragPan.disable() } catch {} 
      // 直接定位机场源中被拖的标签 feature 引用（按 name+坐标精确找，兜底取最近同名），
      // 拖动时直接改其坐标，最可靠（不依赖后续坐标匹配）
      const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
      const fc = feat.geometry && feat.geometry.coordinates
      let target = null
      if (aptSrc && aptSrc._data && fc) {
        for (const f of aptSrc._data.features) {
          if (f.properties.kind !== 'taxi-label' || f.properties.name !== oldName) continue
          const c = f.geometry.coordinates
          if (Math.abs(c[0] - fc[0]) < 1e-9 && Math.abs(c[1] - fc[1]) < 1e-9) { target = f; break }
        }
        if (!target) {
          let best = null, bd = Infinity
          for (const f of aptSrc._data.features) {
            if (f.properties.kind !== 'taxi-label' || f.properties.name !== oldName) continue
            const c = f.geometry.coordinates
            const d = (c[0] - fc[0]) ** 2 + (c[1] - fc[1]) ** 2
            if (d < bd) { bd = d; best = f }
          }
          target = best
        }
      }
      const startPt = { x: e.point.x, y: e.point.y }
      const fromCoord = fc
      let lastCoord = fromCoord   // 累积上一次位置：每次移动后标签坐标已变，需用最新坐标继续匹配
      let dragging = false
      const onMove = (ev) => {
        if (!dragging && Math.hypot(ev.point.x - startPt.x, ev.point.y - startPt.y) > 5) {
          dragging = true
          canvas.style.cursor = 'grabbing'
        }
        if (!dragging) return
        const to = [ev.lngLat.lng, ev.lngLat.lat]
        if (target) {
          // 直接改目标 feature 坐标（不依赖匹配），并同步单点滑行道端点
          target.geometry.coordinates = to
          target.properties._fixed = true
          if (aptEdit.labelCount) delete aptEdit.labelCount[oldName]
          aptSrc.setData(aptSrc._data)
          aptEdit.labelPos[oldName] = to
          if (aptEdit.lines[oldName] && aptEdit.lines[oldName].length === 1) aptEdit.lines[oldName][0] = to
          rebuildAptEditData()
        } else {
          moveTaxiLabel(oldName, lastCoord, to)
        }
        lastCoord = to
      }
      const onUp = () => {
        try { mapboxMap.dragPan.enable() } catch {} 
        mapboxMap.off('mousemove', onMove)
        mapboxMap.off('mouseup', onUp)
        canvas.style.cursor = ''
        if (!dragging) {
          // 未拖动 → 单击：延迟 250ms 弹出横幅编辑；双击(生成端点)会清除该定时器
          clearTimeout(editTimer)
          editTimer = setTimeout(() => {
            showActionBanner({
              type: 'text',
              title: '编辑滑行道编号',
              placeholder: oldName,
              onConfirm: (newName) => {
                if (!newName || newName === oldName) return
                renameAptLabelByName(icao, oldName, newName, ['taxi-label'])
                if (aptEdit.lines[oldName]) {
                  aptEdit.lines[newName] = aptEdit.lines[oldName]
                  delete aptEdit.lines[oldName]
                }
                if (aptEdit.labelPos[oldName]) {
                  aptEdit.labelPos[newName] = aptEdit.labelPos[oldName]
                  delete aptEdit.labelPos[oldName]
                }
                aptEditSave()
                rebuildAptEditData()
              },
            })
          }, 250)
        } else {
          aptEditSave()
        }
      }
      mapboxMap.on('mousemove', onMove)
      mapboxMap.on('mouseup', onUp)
    })

    // 双击滑行道标签：单点滑行道 → 生成两个端点变线段（原标签保留在中心）
    mapboxMap.on('dblclick', taxiLayer, (e) => {
      if (!aptEdit.active) return
      e.preventDefault()
      if (editTimer) { clearTimeout(editTimer); editTimer = null }  // 取消尚未触发的单击编辑
      const feat = e.features && e.features[0]
      if (!feat) return
      const name = feat.properties.name
      if (!name) return
      let line = aptEdit.lines[name]
      if (!line) {
        // 不在编辑记录：若机场源该名称仅一个点，视为单点滑行道
        const aptSrc = mapboxMap.getSource(`apt-${aptEdit.icao}`)
        const pts = []
        if (aptSrc && aptSrc._data) {
          for (const f of aptSrc._data.features) {
            if (f.properties.kind === 'taxi-label' && f.properties.name === name) {
              pts.push(f.geometry.coordinates)
            }
          }
        }
        if (pts.length === 1) { aptEdit.lines[name] = [pts[0]]; line = aptEdit.lines[name] }
      }
      if (!line || line.length !== 1) return   // 仅单点滑行道可扩展
      const p = line[0]
      const dLon = 150 / (111320 * Math.cos(p[1] * Math.PI / 180))
      aptEdit.lines[name] = [[p[0] - dLon, p[1]], [p[0] + dLon, p[1]]]
      aptEditSave()
      rebuildAptEditData()
    })

    // 右键滑行道标签：单击右键无操作（预留）；双击右键 → 删除该标签
    let taxiCtxTimer = null, taxiCtxInfo = null
    mapboxMap.on('contextmenu', taxiLayer, (e) => {
      if (!aptEdit.active) return
      e.preventDefault()
      const feat = e.features && e.features[0]
      if (!feat) return
      const name = feat.properties.name
      if (!name) return
      const now = Date.now()
      if (taxiCtxInfo && taxiCtxInfo.name === name && now - taxiCtxInfo.time < 250) {
        // 双击右键 → 删除该标签
        clearTimeout(taxiCtxTimer); taxiCtxTimer = null; taxiCtxInfo = null
        deleteTaxiLabel(name, feat)
        return
      }
      clearTimeout(taxiCtxTimer)
      taxiCtxInfo = { name, time: now }
      taxiCtxTimer = setTimeout(() => { taxiCtxTimer = null; taxiCtxInfo = null }, 250)
    })
  }

  // —— 停机位标签：单击编辑 ——
  if (mapboxMap.getLayer(standLayer)) {
    mapboxMap.on('click', standLayer, (e) => {
      if (!aptEdit.active) return
      e.preventDefault()
      const feat = e.features && e.features[0]
      if (!feat) return
      const oldName = feat.properties.name
      if (!oldName) return
      showActionBanner({
        type: 'text',
        title: '编辑停机位编号',
        placeholder: oldName,
        onConfirm: (newName) => {
          if (!newName || newName === oldName) return
          renameAptLabelByName(icao, oldName, newName, ['stand', 'pushback'])
        },
      })
    })
  }

  // —— 跑道号：按下拖动移动（固定位置，重算时保留）——
  const runwayNoLayer = `apt-${icao}-runway-no`
  if (mapboxMap.getLayer(runwayNoLayer)) {
    mapboxMap.on('mousedown', runwayNoLayer, (e) => {
      if (!aptEdit.active) return
      if (e.originalEvent && e.originalEvent.button !== 0) return
      e.preventDefault()
      const feat = e.features && e.features[0]
      if (!feat) return
      const src = mapboxMap.getSource(`apt-${icao}`)
      if (!src || !src._data) return
      // 定位被拖的跑道号（精确坐标匹配，兜底取最近一个）
      const fc = feat.geometry && feat.geometry.coordinates
      let target = null
      if (fc) {
        for (const f of src._data.features) {
          if (f.properties.kind !== 'runway-no') continue
          const c = f.geometry.coordinates
          if (Math.abs(c[0] - fc[0]) < 1e-9 && Math.abs(c[1] - fc[1]) < 1e-9) { target = f; break }
        }
        if (!target) {
          let best = null, bd = Infinity
          for (const f of src._data.features) {
            if (f.properties.kind !== 'runway-no') continue
            const c = f.geometry.coordinates
            const d = (c[0] - fc[0]) ** 2 + (c[1] - fc[1]) ** 2
            if (d < bd) { bd = d; best = f }
          }
          target = best
        }
      }
      if (!target) return
      try { mapboxMap.dragPan.disable() } catch {} 
      canvas.style.cursor = 'grabbing'
      const onMove = (ev) => {
        target.geometry.coordinates = [ev.lngLat.lng, ev.lngLat.lat]
        target.properties._fixed = true
        src.setData(src._data)
      }
      const onUp = () => {
        try { mapboxMap.dragPan.enable() } catch {} 
        canvas.style.cursor = ''
        src.setData(src._data)
        aptEditSave()
        mapboxMap.off('mousemove', onMove)
        mapboxMap.off('mouseup', onUp)
      }
      mapboxMap.on('mousemove', onMove)
      mapboxMap.on('mouseup', onUp)
    })
  }

  // —— 停止线：直接拖动整组停止线（无锚点；判定区域为停止线竖线，按 end 整组平移）——
  const stopBarLayer = `apt-${icao}-stop-bar`
  if (mapboxMap.getLayer(stopBarLayer)) {
    mapboxMap.on('mousedown', stopBarLayer, (e) => {
      if (!aptEdit.active) return
      if (e.originalEvent && e.originalEvent.button !== 0) return
      e.preventDefault()
      const feat = e.features && e.features[0]
      if (!feat) return
      const rwy = feat.properties.rwy
      const end = Number(feat.properties.end)
      if (!rwy || Number.isNaN(end)) return
      const src = mapboxMap.getSource(`apt-${icao}`)
      if (!src || !src._data) return
      const pos = (aptEdit.stopBarPos[rwy] = aptEdit.stopBarPos[rwy] || {})
      // 该端锚点：优先用已保存位置，否则用该端全部竖线中点均值（组中心）
      let startAnchor = pos['e' + end]
      if (!startAnchor) {
        let mx = 0, my = 0, cnt = 0
        for (const f of src._data.features) {
          if (f.properties.kind === 'stop-bar' && f.properties.rwy === rwy && Number(f.properties.end) === end) {
            const c = f.geometry.coordinates
            mx += (c[0][0] + c[1][0]) / 2; my += (c[0][1] + c[1][1]) / 2; cnt++
          }
        }
        if (cnt) startAnchor = [mx / cnt, my / cnt]
        pos['e' + end] = startAnchor
      }
      if (!startAnchor) return
      try { mapboxMap.dragPan.disable() } catch {} 
      canvas.style.cursor = 'grabbing'
      // 纯增量平移：每次按鼠标相对位移平移整组，避免基准累计导致的无限漂移
      let lastLng = e.lngLat.lng, lastLat = e.lngLat.lat
      const onMove = (ev) => {
        const dLng = ev.lngLat.lng - lastLng, dLat = ev.lngLat.lat - lastLat
        lastLng = ev.lngLat.lng; lastLat = ev.lngLat.lat
        let changed = false
        for (const f of src._data.features) {
          if (f.properties.kind === 'stop-bar' && f.properties.rwy === rwy && Number(f.properties.end) === end) {
            f.geometry.coordinates = f.geometry.coordinates.map(p => [p[0] + dLng, p[1] + dLat])
            changed = true
          }
        }
        if (changed) {
          const ap = pos['e' + end]
          if (ap) { ap[0] += dLng; ap[1] += dLat }
          src.setData(src._data)
        }
      }
      const onUp = () => {
        try { mapboxMap.dragPan.enable() } catch {} 
        canvas.style.cursor = ''
        src.setData(src._data)
        aptEditSave()
        mapboxMap.off('mousemove', onMove)
        mapboxMap.off('mouseup', onUp)
      }
      mapboxMap.on('mousemove', onMove)
      mapboxMap.on('mouseup', onUp)
    })
  }
}

/** 机场源中按名称批量改标签名 */
function renameAptLabelByName(icao, oldName, newName, kinds) {
  const src = mapboxMap.getSource(`apt-${icao}`)
  if (!src || !src._data) return
  for (const f of src._data.features) {
    if (kinds.includes(f.properties.kind) && f.properties.name === oldName) {
      f.properties.name = newName
    }
  }
  src.setData(src._data)
}

/** 删除滑行道标签：优先按坐标删除被点的那个，失败兜底删除该名称最后一个；清空则清除编辑记录 */
function deleteTaxiLabel(name, feat) {
  if (!mapboxMap || !aptEdit.icao) return
  const src = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!src || !src._data) return
  const fc = feat && feat.geometry && feat.geometry.coordinates
  let removed = false
  if (fc) {
    src._data.features = src._data.features.filter(f => {
      if (f.properties.kind === 'taxi-label' && f.properties.name === name) {
        const c = f.geometry.coordinates
        if (Math.abs(c[0] - fc[0]) < 1e-9 && Math.abs(c[1] - fc[1]) < 1e-9) { removed = true; return false }
      }
      return true
    })
  }
  if (!removed) {
    let lastIdx = -1
    for (let i = src._data.features.length - 1; i >= 0; i--) {
      if (src._data.features[i].properties.kind === 'taxi-label' && src._data.features[i].properties.name === name) { lastIdx = i; break }
    }
    if (lastIdx >= 0) { src._data.features.splice(lastIdx, 1); removed = true }
  }
  if (!removed) return
  src.setData(src._data)
  // 若该名称标签已清空，清除滑行道编辑记录
  const remain = src._data.features.filter(f => f.properties.kind === 'taxi-label' && f.properties.name === name)
  if (!remain.length) {
    delete aptEdit.lines[name]
    delete aptEdit.labelPos[name]
    delete aptEdit.labelCount[name]
  }
  aptEditSave()
  rebuildAptEditData()
  showBanner(`已删除滑行道标签 ${name}`, { duration: 1500 })
}

/** 拖动滑行道标签：把机场源中 name+坐标匹配的标签点移动到新位置
 *  精确匹配（按原坐标）失败时退化为按名称匹配第一个该名称的标签点（单点滑行道等） */
function moveTaxiLabel(name, fromCoord, toCoord) {
  if (!mapboxMap || !aptEdit.icao) return
  const src = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!src || !src._data) return
  let found = false
  let nearest = null, nearestD = Infinity
  for (const f of src._data.features) {
    if (f.properties.kind === 'taxi-label' && f.properties.name === name) {
      const c = f.geometry.coordinates
      if (fromCoord) {
        const d = (c[0] - fromCoord[0]) ** 2 + (c[1] - fromCoord[1]) ** 2
        if (d < 1e-18) {   // 精确匹配：就是这个标签
          f.geometry.coordinates = toCoord
          f.properties._fixed = true
          found = true
          break
        }
        // 记录距离最近的同名标签（拖哪个就移动哪个，避免多标签拖错）
        if (d < nearestD) { nearestD = d; nearest = f }
      } else if (!nearest) nearest = f
    }
  }
  if (!found && nearest) {
    nearest.geometry.coordinates = toCoord
    nearest.properties._fixed = true
    found = true
  }
  if (!found) return
  if (aptEdit.labelCount) delete aptEdit.labelCount[name]   // 手动移动 → 退出 N 均分模式
  src.setData(src._data)
  aptEdit.labelPos[name] = toCoord
  // 单点滑行道：端点坐标跟随标签移动
  if (aptEdit.lines[name] && aptEdit.lines[name].length === 1) {
    aptEdit.lines[name][0] = toCoord
  }
  rebuildAptEditData()
}

/** 在地图指定屏幕位置显示内联编辑输入框（自动聚焦，Enter 确认 / Esc 取消 / 失焦确认） */
function showInlineEdit(x, y, initialValue, onConfirm) {
  removeInlineEdit()
  const wrap = document.createElement('div')
  wrap.className = 'apt-inline-edit'
  wrap.style.left = x + 'px'
  wrap.style.top = y + 'px'
  const input = document.createElement('input')
  input.type = 'text'
  input.value = initialValue
  wrap.appendChild(input)
  mapContainer.value?.appendChild(wrap)
  aptInlineEditEl = wrap
  // 延迟聚焦保证光标出现
  setTimeout(() => { input.focus(); input.select() }, 30)
  const commit = () => {
    const v = input.value.trim()
    removeInlineEdit()
    if (v && v !== initialValue) onConfirm(v)
  }
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') commit()
    else if (ev.key === 'Escape') removeInlineEdit()
    ev.stopPropagation()
  })
  input.addEventListener('blur', commit)
  input.addEventListener('dblclick', (ev) => ev.stopPropagation())
  input.addEventListener('click', (ev) => ev.stopPropagation())
  input.addEventListener('mousedown', (ev) => ev.stopPropagation())
}

function removeInlineEdit() {
  if (aptInlineEditEl) {
    aptInlineEditEl.remove()
    aptInlineEditEl = null
  }
}

/** 重命名机场源中同名的 taxi-label 点属性 */
function renameTaxiLabels(oldName, newName) {
  if (!mapboxMap || !aptEdit.icao) return
  const src = mapboxMap.getSource(`apt-${aptEdit.icao}`)
  if (!src || !src._data) return
  const data = src._data
  for (const f of data.features) {
    if (f.properties.kind === 'taxi-label' && f.properties.name === oldName) {
      f.properties.name = newName
    }
  }
  src.setData(data)
}

function clearAptEditOverlays() {
  if (!mapboxMap) return
  const srcId = `apt-edit-${aptEdit.icao || ''}`
  for (const l of ['-line', '-handle', '-curve-arrow']) {
    try { if (mapboxMap.getLayer(srcId + l)) mapboxMap.removeLayer(srcId + l) } catch {}
  }
  try { if (mapboxMap.getSource(srcId)) mapboxMap.removeSource(srcId) } catch {}
}

// 加载飞机图标到 mapbox(canvas 渲染用)
async function loadAircraftIcons() {
  const cats = ['plane', 'twin', 'quad', 'single', 'heli']
  const dark = isDarkTheme()
  for (const c of cats) {
    try {
      const svgRaw = await fetch(`/aircraft-icons/${c}.svg`).then(r => r.text())
      // 深色模式: 图标转纯白(Font Awesome 默认黑色 path, 加 fill="#fff")
      const svg = dark ? svgRaw.replace(/<path/g, '<path fill="#fff"') : svgRaw
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      const img = await new Promise((resolve, reject) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = reject
        im.src = url
      })
      if (mapboxMap.hasImage(c)) mapboxMap.removeImage(c)
      mapboxMap.addImage(c, img)
    } catch { /* 忽略单个图标加载失败 */ }
  }
}

// Mapbox 3D 渲染飞行员: GeoJSON symbol 图层。
// 5s 轮询刷新仅 setData 增量更新位置（不销毁重建）；仅首次创建/主题切换重建时走完整建层。
async function renderMapboxPilots() {
  if (!mapboxMap) return
  // style 未加载完成时跳过（避免 addSource 报 "Style is not done loading" 竞态），
  // 地图 load 事件回调会再次调用本函数完成首建。
  try { if (!mapboxMap.isStyleLoaded()) return } catch { return }

  // ===== 增量路径: source 已存在 → 仅更新数据（图标平滑移动，不销毁重建）=====
  if (mapboxMap.getSource('pilots-src')) {
    const withPos = pilots.value.filter(p => p.lat && p.lon)
    const features = withPos.map(p => ({
      type: 'Feature',
      properties: {
        icon: aircraftIconName(p.aircraft),
        heading: Number(p.heading) || 0,
        callsign: p.callsign || '',
        color: p.rating >= 5 ? '#ff3b30' : '#1a73e8',
      },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    }))
    mapboxMap.getSource('pilots-src').setData({ type: 'FeatureCollection', features })
    return
  }

  // ===== 首次创建路径：完整建层 =====
  // 移除旧 HTML marker(如有)
  mapboxMarkers.forEach(m => { try { m.remove() } catch {} })
  mapboxMarkers = []
  if (mapboxMap.getLayer('pilots-layer')) mapboxMap.removeLayer('pilots-layer')
  if (mapboxMap.getSource('pilots-src')) mapboxMap.removeSource('pilots-src')

  pilots.value.forEach(p => {
    if (!p.lat || !p.lon) return
    const color = p.rating >= 5 ? '#ff3b30' : '#1a73e8'
    if (p.trail?.length >= 2) {
      const coords = [...p.trail.map(t => [t.lon, t.lat]), [p.lon, p.lat]]
      const srcId = `trail-${p.callsign || Math.random().toString(36).slice(2,8)}`
      try {
        if (mapboxMap.getSource(srcId)) {
          mapboxMap.getSource(srcId).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
          return
        }
        mapboxMap.addSource(srcId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } })
        mapboxMap.addLayer({ id: srcId, type: 'line', source: srcId, paint: { 'line-color': color, 'line-width': 1.5, 'line-opacity': 0.6 } })
        mapboxSources.push(srcId)
      } catch {}
    }
  })

  const withPos = pilots.value.filter(p => p.lat && p.lon)
  if (!withPos.length) return
  await loadAircraftIcons()
  const features = withPos.map(p => ({
    type: 'Feature',
    properties: {
      icon: aircraftIconName(p.aircraft),
      heading: Number(p.heading) || 0,
      callsign: p.callsign || '',
      color: p.rating >= 5 ? '#ff3b30' : '#1a73e8',
    },
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
  }))
  mapboxMap.addSource('pilots-src', { type: 'geojson', data: { type: 'FeatureCollection', features } })
  mapboxMap.addLayer({
    id: 'pilots-layer',
    type: 'symbol',
    source: 'pilots-src',
    layout: {
      // 3D 模式下飞机本体由 Three.js 3D 模型层渲染，此 symbol 层仅保留呼号文字标签
      // （不渲染 2D 飞机图标，避免与 3D 模型重叠）
      'text-field': ['get', 'callsign'],
      'text-size': 10,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: {
      // 呼号颜色/描边属于 paint 属性（放 layout 会报 unknown property 且不生效）
      'text-color': ['get', 'color'],
      'text-halo-color': isDarkTheme() ? '#000000' : '#fff',
      'text-halo-width': 1.2,
    },
  })
  mapboxSources.push('pilots-src')
}

// Mapbox 渲染管制边界（GeoJSON Polygon）
function renderMapboxBoundaries() {
  if (!mapboxMap) return
  boundaries.value.forEach((b, idx) => {
    // TWR/GND/DEL 等点位类型: 渲染圆形标记
    if (b.point && !b.polygon) {
      const srcId = `bnd-pt-${b.callsign || idx}`
      try {
        if (mapboxMap.getLayer(srcId)) mapboxMap.removeLayer(srcId)
        if (mapboxMap.getSource(srcId)) mapboxMap.removeSource(srcId)
        mapboxMap.addSource(srcId, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [b.point.lon, b.point.lat] } },
        })
        mapboxMap.addLayer({ id: srcId, type: 'circle', source: srcId, paint: {
          'circle-radius': 5,
          'circle-color': b.strokeColor || '#4caf50',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        } })
        mapboxSources.push(srcId)
      } catch {}
      return
    }
    if (b.polygon?.length < 3) return
    const coords = b.polygon.map(pt => [pt.lon, pt.lat])
    // 闭合多边形
    const first = coords[0]
    coords.push(first)
    const srcId = `bnd-${b.callsign || idx}`
    try {
      if (mapboxMap.getLayer(srcId)) mapboxMap.removeLayer(srcId)
      if (mapboxMap.getLayer(srcId + '-line')) mapboxMap.removeLayer(srcId + '-line')
      if (mapboxMap.getSource(srcId)) mapboxMap.removeSource(srcId)
      mapboxMap.addSource(srcId, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } },
      })
      mapboxMap.addLayer({ id: srcId, type: 'fill', source: srcId, paint: { 'fill-color': b.fillColor || '#2e7d32', 'fill-opacity': b.fillOpacity ?? 0.07 } })
      mapboxMap.addLayer({ id: srcId + '-line', type: 'line', source: srcId, paint: { 'line-color': b.strokeColor || '#2e7d32', 'line-width': b.strokeWeight ?? 1.5, 'line-opacity': b.strokeOpacity ?? 0.5 } })
      mapboxSources.push(srcId)
    } catch {}
  })
}

// 引擎切换统一入口：watch activeLayer → switchEngine
watch(activeLayer, switchEngine)

// ===== 气象雷达图层（OpenWeatherMap 降水雷达, 2D AMap + 3D Mapbox 所有地图源叠加显示）=====
let radarLayer = null   // AMap 2D 雷达图层实例
/** 根据开关开启/关闭气象雷达图层 */
function setRadar(on) {
  if (on) {
    // ---- AMap 2D（高德/卫星/Mapbox卫星/ArcGIS 共用）----
    if (map) {
      try {
        const exists = map.getLayers().some(l => l === radarLayer)
        if (!exists) {
          radarLayer = new AMap.TileLayer({
            getTileUrl: (x, y, z) => OWM_RADAR_URL(z, x, y),
            opacity: 1,
            zIndex: 120,
          })
        }
        map.addLayer(radarLayer)
      } catch (e) { console.warn('[Radar] AMap 雷达添加失败:', e?.message) }
    }
    // ---- Mapbox 3D（MapBox3D/卫星, globe 地球）----
    if (mapboxMap) {
      try {
        if (!mapboxMap.getSource('radar')) {
          mapboxMap.addSource('radar', {
            type: 'raster',
            tiles: [`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`],
            tileSize: 256,
          })
        }
        if (!mapboxMap.getLayer('radar-layer')) {
          mapboxMap.addLayer({
            id: 'radar-layer',
            type: 'raster',
            source: 'radar',
            // 颜色增强: 提高对比度/饱和度, 让降水更鲜明
            paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-contrast': 0.4, 'raster-saturation': 0.6 },
          })
        }
      } catch (e) { console.warn('[Radar] Mapbox 雷达添加失败:', e?.message) }
    }
  } else {
    // 关闭: 移除两引擎雷达
    if (radarLayer && map) {
      try { map.removeLayer(radarLayer) } catch {}
    }
    if (mapboxMap) {
      try {
        if (mapboxMap.getLayer('radar-layer')) mapboxMap.removeLayer('radar-layer')
        if (mapboxMap.getSource('radar')) mapboxMap.removeSource('radar')
      } catch {}
    }
  }
}
watch(() => mapSettings.weatherRadar, (v) => { if (map || mapboxMap) setRadar(v) })

// 下拉面板：hover 弹出 / 移出 0.8s 缩回
function showPanel() { cancelCollapse(); panelOpen.value = true }
function scheduleCollapse() {
  if (panelTimer) clearTimeout(panelTimer)
  panelTimer = setTimeout(() => { panelOpen.value = false }, 800)
}
function cancelCollapse() {
  if (panelTimer) { clearTimeout(panelTimer); panelTimer = null }
}

// ---------------------------------------------------------------------------
// 主题切换: 高德深浅底图跟随 html[data-theme]（浅色/深色/Auto-按北京时间）
// ---------------------------------------------------------------------------
let themeObserver = null

// Mapbox 3D 地球大气层: 深色模式时把大气/太空/雾全部设为深色, 屏蔽球体发出的白色光
// 切换时用 requestAnimationFrame 对颜色做 1s 渐变插值, 与 UI 主题切换动画一致
let fogAnimToken = 0
let currentFog = { color: [185, 191, 200], high: [170, 180, 194], space: [18, 22, 38], star: 0 }
// 自定义 fog(深浅色都用自定义值); blend 控制大气范围, 越小光晕越贴近球体边缘、不蔓延到太空
const FOG_LIGHT = { color: [185, 191, 200], high: [170, 180, 194], space: [18, 22, 38], star: 0, blend: 0.1 }
const FOG_DARK = { color: [43, 47, 59], high: [32, 37, 49], space: [15, 18, 27], star: 0.2, blend: 0.11 }

function applyMapboxFog(dark, animate = true) {
  if (!mapboxMap) return
  // 深色: 渐变到全黑屏蔽球体白光; 浅色: 渐变到柔和值, 动画结束后 setFog({}) 恢复原版大气
  const target = dark ? FOG_DARK : FOG_LIGHT
  const token = ++fogAnimToken
  const from = { ...currentFog }
  const duration = animate ? 1000 : 0
  const start = performance.now()
  const step = (now) => {
    if (token !== fogAnimToken) return  // 新的切换打断旧的动画
    const t = duration ? Math.min(1, (now - start) / duration) : 1
    const ease = t === 1 ? 1 : (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
    const mix = (a, b) => {
      const r = [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * ease))
      return `rgb(${r[0]}, ${r[1]}, ${r[2]})`
    }
    currentFog = {
      color: [0, 1, 2].map(i => Math.round(from.color[i] + (target.color[i] - from.color[i]) * ease)),
      high: [0, 1, 2].map(i => Math.round(from.high[i] + (target.high[i] - from.high[i]) * ease)),
      space: [0, 1, 2].map(i => Math.round(from.space[i] + (target.space[i] - from.space[i]) * ease)),
      star: target.star,
    }
    try {
      mapboxMap.setFog({
        color: mix(from.color, target.color),
        'high-color': mix(from.high, target.high),
        'space-color': mix(from.space, target.space),
        'horizon-blend': target.blend,   // 缩小大气范围, 避免光晕超出球体过多
        'star-intensity': currentFog.star,
      })
    } catch { /* 低版本兼容 */ }
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function applyMapTheme() {
  const dark = isDarkTheme()
  // AMap 深浅底图
  if (map) {
    try {
      map.setMapStyle(dark ? 'amap://styles/grey' : 'amap://styles/macaron')
    } catch (e) {
      console.warn('[OnlineMap] setMapStyle 失败:', e?.message)
    }
    // 主题切换后重建 AMap 机组/边界, 让图标/呼号颜色随深浅色更新(仅 2D 平面地图)
    if (!is3D(activeLayer.value)) {
      renderPilots()
      renderBoundaries()
    }
  }
  // Mapbox 3D: 主题切换后重新加载图标(深色白图标)并重建机组/边界
  if (mapboxMap && is3D(activeLayer.value)) {
    loadAircraftIcons().then(() => { renderMapboxPilots(); renderMapboxBoundaries() })
  }
  // 机场标注颜色跟随主题（不刷新地图，直接改 paint 属性）
  updateAirportLabelColors(dark)
  // Mapbox 3D 地球大气层跟随主题(深色屏蔽白光)
  applyMapboxFog(dark)
}

/** 主题切换时更新已加载机场的标注描边/文字颜色（无需重建图层） */
function updateAirportLabelColors(dark) {
  if (!mapboxMap) return
  const halo = dark ? '#111827' : '#ffffff'
  for (const icao of airportLayersLoaded) {
    const taxi = mapboxMap.getLayer(`apt-${icao}-taxiway-label`)
    if (taxi) {
      try { mapboxMap.setPaintProperty(taxi.id, 'text-halo-color', halo) } catch {}
    }
    const stand = mapboxMap.getLayer(`apt-${icao}-stand-label`)
    if (stand) {
      try {
        mapboxMap.setPaintProperty(stand.id, 'text-color', dark ? '#9ca3af' : '#6b7280')
        mapboxMap.setPaintProperty(stand.id, 'text-halo-color', halo)
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// 数据加载
// ---------------------------------------------------------------------------
async function loadPilots(silent = false) {
  // 轮询刷新(silent=true)不触发 loading, 避免每 5 秒弹出"加载中"遮罩
  if (!silent) loading.value = true
  try {
    const [pilotRes, boundRes] = await Promise.all([
      flightplanApi.fsdOnline(),
      flightplanApi.fsdBoundaries().catch(() => ({ data: [] })),
    ])
    pilots.value = pilotRes.data || []
    boundaries.value = boundRes.data || []
    renderPilots()
    renderBoundaries()
    if (is3D(activeLayer.value)) {
      renderMapboxPilots()
      renderMapboxBoundaries()
      // 3D 模型层同步更新（图层未就绪时模块内部缓存数据）
      try { updateAircraft3D(pilots.value) } catch { /* 静默，下次刷新重试 */ }
    }
    // 轮询刷新成功即视为"实时"(数据来自后端快照表)
    connected.value = true
  } catch { /* 静默失败，下次刷新重试 */ }
  loading.value = false
}

// ---------------------------------------------------------------------------
// 渲染管制边界
// ---------------------------------------------------------------------------
let noAtcTooltip = null

function renderBoundaries() {
  boundaryLayers.forEach(l => map.remove(l))
  boundaryLayers = []
  if (!map || !window.AMap) return

  if (!boundaries.value.length) {
    return
  }
  // 有边界数据时移除提示
  if (noAtcTooltip) { map.remove(noAtcTooltip); noAtcTooltip = null }

  boundaries.value.forEach(b => {
    if (b.polygon?.length >= 3) {
      renderPolygon(b)
    } else if (b.point) {
      renderPointMarker(b)
    }
  })
}

function renderPointMarker(b) {
  // TWR/GND/DEL 不再单独渲染点标记，改由 renderPolygon 渲染小圆圈
  const marker = new AMap.Marker({
    position: toGcj02(b.centerPoint?.lon || b.point?.lon, b.centerPoint?.lat || b.point?.lat),
    content: `<div style="width:12px;height:12px;background:${b.strokeColor || '#4caf50'};border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.3)"></div>`,
    offset: new AMap.Pixel(-8, -8),
  })
  map.add(marker)

  const info = new AMap.InfoWindow({
    content: `<b>${b.label || b.callsign}</b><br/>席位: ${b.type}<br/>` +
      (b.icao ? `机场: ${b.icao}` : ''),
  })
  marker.on('click', () => {
    info.open(map, marker.getPosition())
  })
  boundaryLayers.push(marker)
}

function renderPolygon(b) {
  const path = b.polygon.map(p => toGcj02(p.lon, p.lat))

  const polygon = new AMap.Polygon({
    path,
    strokeColor: b.strokeColor || '#2e7d32',
    strokeWeight: b.strokeWeight ?? 1.5,
    strokeOpacity: b.strokeOpacity ?? 0.5,
    fillColor: b.fillColor || 'rgba(46,125,50,0.07)',
    fillOpacity: b.fillOpacity ?? 0.07,
    strokeStyle: b.strokeDash ? 'dashed' : 'solid',
  })
  map.add(polygon)
  boundaryLayers.push(polygon)

  // 添加文本标签（VATSIM Radar 风格：在区域中心显示呼号/名称）
  if (b.centerPoint && (b.type === 'CTR' || b.icao)) {
    const labelText = b.type === 'CTR' ? (b.icao || b.callsign) : b.callsign
    const label = new AMap.Text({
      text: labelText,
      position: toGcj02(b.centerPoint.lon, b.centerPoint.lat),
      offset: new AMap.Pixel(0, 0),
      style: {
        background: 'none',
        border: 'none',
        color: b.strokeColor || '#2e7d32',
        'font-size': b.type === 'CTR' ? '13px' : '11px',
        'font-weight': '600',
        'text-shadow': '0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff',
        padding: '2px 4px',
      },
    })
    map.add(label)
    boundaryLayers.push(label)
  }

}

// ---------------------------------------------------------------------------
// 渲染飞行员
// ---------------------------------------------------------------------------
// 根据机型判断图标类别: 四发 / 双发 / 单发 / 直升机 / 通用
function aircraftIconName(aircraft) {
  const a = (aircraft || '').toUpperCase()
  if (/(B74[0-9]|B77[0-9]|B78[0-9]|A380|A34[0-9]|A35[0-9]|A33[0-9]|A30[0-9]|B76[0-9]|B75[0-9]|A220|B73[0-9]|B72[0-9]|A20[0-9]|A21[0-9]|A31[0-9]|A32[0-9]|E19[0-9]|E17[0-9]|CRJ|ERJ)/.test(a)) {
    return /(B74[0-9]|A380|A34[0-9])/.test(a) ? 'quad' : 'twin'
  }
  if (/(R22|R44|BELL|EC13|AS35|H145|H135|AW[0-9]|MI-)/.test(a)) return 'heli'
  if (/(C17[0-9]|PA28|C152|C172|C182|DA20|DA40|SR20|SR22)/.test(a)) return 'single'
  return 'plane'
}

function renderPilots() {
  if (!map || !window.AMap) return
  markers.forEach(m => { map.remove(m.marker); if (m.polyline) map.remove(m.polyline) })
  markers = []

  pilots.value.forEach(p => {
    if (!p.lat || !p.lon) return
    const color = p.rating >= 5 ? '#ff3b30' : '#1a73e8'
    const polyline = renderTrail(p, color)
    const marker = renderPilotMarker(p, color)
    markers.push({ marker, polyline })
  })
}

function renderTrail(p, color) {
  if (!p.trail?.length || p.trail.length < 2) return null
  const path = [...p.trail.map(t => toGcj02(t.lon, t.lat)), toGcj02(p.lon, p.lat)]
  const polyline = new AMap.Polyline({
    path,
    strokeColor: color,
    strokeWeight: 2,
    strokeOpacity: 0.6,
    lineJoin: 'round',
  })
  map.add(polyline)
  return polyline
}

function renderPilotMarker(p, color) {
  const callsign = p.callsign || ''
  const icon = aircraftIconName(p.aircraft)
  const heading = Number(p.heading) || 0
  const dark = isDarkTheme()
  // 深色模式: 图标转纯白(brightness(0) invert(1)); 浅色模式: 黑色图标保留白色光晕便于在浅色底图看清
  const iconFilter = dark
    ? 'filter:brightness(0) invert(1);'
    : 'filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff);'
  // 呼号: 深色模式白字+深色阴影(避免白色光晕在深色底图上漏白边); 浅色模式彩色+白色光晕
  const callColor = dark ? '#ffffff' : color
  const callShadow = dark
    ? 'text-shadow:0 0 3px rgba(0,0,0,0.85);'
    : 'text-shadow:0 0 3px #fff;'
  // 固定 40x40 容器 + 图标绝对居中, offset(-20,-20) 使图标中心精确对准坐标点
  // (之前对整块 content 补偿导致高德地图机组位置偏右上)
  const marker = new AMap.Marker({
    position: toGcj02(p.lon, p.lat),
    content: `<div style="position:relative;width:40px;height:40px;overflow:visible">
      <img src="/aircraft-icons/${icon}.svg" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(${heading - 90}deg);height:20px;width:auto;${iconFilter}" />
      <span style="position:absolute;left:50%;top:100%;transform:translateX(-50%);font-size:10px;color:${callColor};font-weight:600;${callShadow}white-space:nowrap">${callsign}</span>
    </div>`,
    offset: new AMap.Pixel(-20, -20),
  })
  map.add(marker)

  const info = new AMap.InfoWindow({
    content: [
      `<b>${callsign}</b>`,
      `机型: ${p.aircraft || '-'}`,
      `高度: ${p.altitude || '-'}ft`,
      `速度: ${p.groundspeed || '-'}kt`,
      `应答机: ${p.transponder || '-'}`,
      `轨迹点: ${p.trail?.length || 0}`,
    ].join('<br/>'),
  })
  marker.on('click', () => {
    info.open(map, marker.getPosition())
  })
  return marker
}

// ---------------------------------------------------------------------------
// AMap 加载 & 生命周期
// ---------------------------------------------------------------------------
function loadAMap(callback) {
  // 高德安全配置（JSAPI v2.0 安全密钥，必须在加载 script 之前设置）
  if (AMAP_SECURITY_CODE) {
    window._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY_CODE,
    }
  }

  const script = document.createElement('script')
  script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`
  script.onload = () => {
    // 加载插件
    AMap.plugin(['AMap.TileLayer', 'AMap.TileLayer.Satellite'], () => {
      callback()
    })
  }
  script.onerror = () => {
    mapError.value = '高德地图 API 加载失败，请检查网络或 API Key 配置'
    loading.value = false
  }
  document.body.appendChild(script)
}


// ===== 开发者工具: 光标定位(地图 hover/拖动时 光标右上角实时显示经纬度) =====
const cursorPos = ref(null)
let lastMouse = null // 相对地图容器的像素坐标, 拖动时持续跟踪
function updateCursor() {
  // 用当前光标屏幕坐标反向投影经纬度(拖动时地图移动也实时更新)
  if (!lastMouse) return
  let lat = null, lng = null
  try {
    if (mapboxMap) {
      const ll = mapboxMap.unproject([lastMouse.x, lastMouse.y])
      lat = ll.lat; lng = ll.lng
    } else if (map) {
      const ll = map.containerToLngLat([lastMouse.x, lastMouse.y])
      lat = ll.getLat ? ll.getLat() : ll.lat
      lng = ll.getLng ? ll.getLng() : ll.lng
    }
  } catch { return }
  if (lat == null) return
  cursorPos.value = { lat, lng, x: lastMouse.x, y: lastMouse.y }
}
function onWindowMouseMove(e) {
  const rect = mapContainer.value?.getBoundingClientRect()
  if (!rect) return
  lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  updateCursor()
}
function onMapDblClick() {
  // 双击左键结束光标定位, 按钮恢复 normal; 并把当前经纬度复制到剪贴板
  if (mapSettings.devTool !== 'cursor') return
  const c = cursorPos.value
  if (c && c.lat != null && c.lng != null) {
    const text = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`
    try {
      navigator.clipboard?.writeText(text)
    } catch { /* 剪贴板不可用时忽略 */ }
  }
  mapSettings.setDevTool('cursor')
}
function bindCursorLocate() {
  cursorPos.value = null
  lastMouse = null
  // 光标定位模式: 十字准星光标
  applyDevCursor()
  // 拖动地图时: mapbox 'move' / AMap 'moving' 持续触发, 实时更新经纬度
  if (mapboxMap) { mapboxMap.on('move', updateCursor); mapboxMap.on('dblclick', onMapDblClick) }
  if (map) { map.on('moving', updateCursor); map.on('dblclick', onMapDblClick) }
  // 全局 mousemove 持续跟踪光标位置(hover 与拖动都实时)
  window.addEventListener('mousemove', onWindowMouseMove)
}
function unbindCursorLocate() {
  if (mapboxMap) { mapboxMap.off('move', updateCursor); mapboxMap.off('dblclick', onMapDblClick) }
  if (map) { map.off('moving', updateCursor); map.off('dblclick', onMapDblClick) }
  window.removeEventListener('mousemove', onWindowMouseMove)
  cursorPos.value = null
  lastMouse = null
  // 退出开发者工具模式: 恢复抓手
  applyDevCursor()
}
// 开发者工具是否激活(用于十字准星光标)
function isDevToolActive() {
  return mapSettings.devTool === 'cursor' || mapSettings.devTool === 'draw' || mapSettings.devTool === 'airport-edit'
}
// 应用开发者工具光标到地图实例: AMap setDefaultCursor / Mapbox canvas cursor / 外层容器
// (直接改外层容器无效, 地图内部 canvas 有独立光标样式)
function applyDevCursor() {
  const cross = isDevToolActive()
  try {
    if (map) map.setDefaultCursor(cross ? 'crosshair' : 'grab')
  } catch { /* AMap 未就绪 */ }
  try {
    if (mapboxMap) mapboxMap.getCanvas().style.cursor = cross ? 'crosshair' : 'grab'
  } catch { /* Mapbox 未就绪 */ }
  if (mapContainer.value) mapContainer.value.style.cursor = cross ? 'crosshair' : 'grab'
}
watch(() => mapSettings.devTool, (v) => {
  if (v === 'cursor') bindCursorLocate()
  else unbindCursorLocate()
  // 机场编辑模式开关（进入时构建编辑图层，退出时清理）
  setAirportEditMode(v === 'airport-edit')
  applyDevCursor()
}, { immediate: true })
// 地图实例就绪后补绑(devTool 可能先于地图初始化设置)
watch(mapboxMap, (m) => { if (m && mapSettings.devTool === 'cursor') { m.on('move', updateCursor); m.on('dblclick', onMapDblClick) } })
watch(map, (m) => { if (m && mapSettings.devTool === 'cursor') { m.on('moving', updateCursor); m.on('dblclick', onMapDblClick) } })

onMounted(() => {
  // 默认 Mapbox3D 地球：优先加载 Mapbox GL；AMap 仅切换到平面源时再加载
  if (activeLayer.value === 'mapbox3d') {
    initMapbox3D()
  } else if (window.AMap && AMap.TileLayer) {
    initMap()
  } else if (window.AMap) {
    AMap.plugin(['AMap.TileLayer', 'AMap.TileLayer.Satellite'], () => {
      initMap()
    })
  } else {
    loadAMap(initMap)
  }
  // 初始加载(显示 loading)
  loadPilots()
  // 在线数据来自后端快照表(FlightPilot/FlightController), 前端轮询获取(静默, 不弹加载中)
  timer = setInterval(() => loadPilots(true), REFRESH_INTERVAL)
  // 监听主题(html[data-theme])变化, 动态切换高德深浅底图
  themeObserver = new MutationObserver(applyMapTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  // 机场编辑撤销/重做快捷键（Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z，仅编辑模式生效）
  window.addEventListener('keydown', onAptEditKeydown)
})

onUnmounted(() => {
  unbindCursorLocate()
  window.removeEventListener('keydown', onAptEditKeydown)
  if (panelTimer) { clearTimeout(panelTimer); panelTimer = null }
  if (themeObserver) { themeObserver.disconnect(); themeObserver = null }
  if (timer) { clearInterval(timer); timer = null }
  if (mapboxMap) {
    clearMapboxOverlays()
    mapboxMap.remove()
    mapboxMap = null
  }
  destroyAircraft3D()
  if (map) {
    map.destroy()
    map = null
  }
})
</script>

<style scoped>
.map-full {
  position: fixed;
  top: var(--header-h);
  left: var(--sidebar-w, 240px);
  right: 0;
  bottom: 0;
  overflow: hidden;
}
.map-container {
  width: 100%;
  height: 100%;
  background: #1a2332;
  position: relative;
}
.cursor-coord {
  position: absolute;
  z-index: 30;
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 12px;
  font-family: 'Consolas', 'Menlo', monospace;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
:deep(.amap-container) {
  background: #1a2332;
  cursor: grab;
}
:deep(.amap-container:active) {
  cursor: grabbing;
}
/* 开发者工具(区域绘制/光标定位): 十字准星
   !important 覆盖高德 .amap-container 全局抓手 与 Mapbox 引擎内部 cursor */
.map-container.dev-cross :deep(.amap-container),
.map-container.dev-cross :deep(.amap-container:active),
.map-container.dev-cross :deep(.mapboxgl-canvas),
.map-container.dev-cross :deep(.mapboxgl-canvas-container),
.map-container.dev-cross :deep(.mapboxgl-canvas:active) {
  cursor: crosshair !important;
}
.map-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,.7);
  color: #ff6b6b;
  padding: 20px 30px;
  border-radius: 8px;
  z-index: 999;
  font-size: 14px;
  text-align: center;
}
.map-switcher {
  position: absolute;
  top: 12px;
  left: 2%;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.sw-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  color: #555;
  transition: all .15s;
}
.sw-btn:hover { background: rgba(0,0,0,.05); }
.sw-btn.active { background: var(--c-primary); color: #fff; }
/* 主按钮（显示当前地图源，hover 时仅弹出面板、自身样式不变） */
.sw-main {
  padding: 7px 16px;
  font-size: 13px;
  background: rgba(255,255,255,.85);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,.12);
  color: #333;
}
.sw-main:hover {
  background: rgba(255,255,255,.85);
  color: #333;
}
.sw-main.active {
  background: var(--c-primary);
  color: #fff;
}
.sw-main.active:hover {
  background: var(--c-primary);
  color: #fff;
}
/* 下拉面板（分组：3D / 2D，每组水平排列） */
.sw-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: rgba(255,255,255,.85);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0,0,0,.15);
}
.sw-group {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 2px;
}
.sw-group-title {
  font-size: 11px;
  font-weight: 700;
  color: #888;
  margin-right: 2px;
  min-width: 22px;
}
.sw-item { text-align: center; white-space: nowrap; }
/* 下拉展开/缩回动画 */
.panel-enter-active, .panel-leave-active {
  transition: opacity .25s ease, transform .25s ease;
}
.panel-enter-from, .panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
/* Mapbox 3D 飞行器标记 */
:deep(.mb-pilot-marker) {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(0,0,0,.4);
  cursor: pointer;
}
.map-status {
  position: absolute;
  bottom: 2%;
  left: 1.4%;
  z-index: 1000;
  display: flex;
  gap: 8px;
  align-items: center;
  background: rgba(0,0,0,.6);
  color: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
}
.status-ok { color: #4caf50; }
.status-err { color: #ff9800; }
.status-time { color: rgba(255,255,255,.6); }

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(26,35,50,.7);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255,255,255,.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== 机场编辑悬浮工具栏（深浅色自适应）===== */
.apt-toolbar {
  position: fixed;
  z-index: 2200;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 7px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .92);
  border: 1px solid rgba(0, 0, 0, .12);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .18);
  backdrop-filter: blur(8px);
  user-select: none;
}
html[data-theme='dark'] .apt-toolbar {
  background: rgba(28, 32, 42, .92);
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .5);
}
.apt-toolbar-handle {
  cursor: grab;
  padding: 0 5px;
  font-size: 11px;
  letter-spacing: -2px;
  color: #9ca3af;
  line-height: 1.4;
}
html[data-theme='dark'] .apt-toolbar-handle { color: #6b7280; }
.apt-toolbar-handle:active { cursor: grabbing; }
.apt-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--c-text, #374151);
  cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.apt-toolbar-btn:hover {
  background: rgba(23, 105, 210, .1);
  color: var(--c-primary, #1769d2);
}
/* 激活态：主色实底白图标 */
.apt-toolbar-btn.active {
  background: var(--c-primary, #1769d2);
  color: #fff;
  border-color: var(--c-primary);
}
/* 确认/取消语义色 */
.apt-toolbar-ok:hover { background: rgba(34, 197, 94, .14); color: #16a34a; }
.apt-toolbar-cancel:hover { background: rgba(239, 68, 68, .14); color: #dc2626; }
/* 下拉分组（道路类/标签类/区域类）：hover 垂直动画弹出 */
.apt-drop { position: relative; }
.apt-drop-trigger {
  width: auto;
  padding: 0 8px;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.apt-drop-caret { font-size: 9px; opacity: .7; }
.apt-drop-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 2300;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 132px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .96);
  border: 1px solid rgba(0, 0, 0, .12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
  backdrop-filter: blur(8px);
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
  transition: opacity .18s ease, transform .18s ease;
}
.apt-drop-menu.open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.apt-drop-item {
  width: 100%;
  justify-content: flex-start;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  padding: 0 8px;
}
html[data-theme='dark'] .apt-drop-menu {
  background: rgba(28, 32, 42, .96);
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .5);
}
/* 深色主题 */
html[data-theme='dark'] .apt-toolbar-btn { color: #cbd5e1; }
html[data-theme='dark'] .apt-toolbar-btn:hover {
  background: rgba(138, 180, 255, .14);
  color: #8ab4ff;
}
html[data-theme='dark'] .apt-toolbar-btn.active {
  background: rgba(138, 180, 255, .25);
  color: #cfe0ff;
  border-color: rgba(138, 180, 255, .55);
}
html[data-theme='dark'] .apt-toolbar-ok:hover { background: rgba(34, 197, 94, .2); color: #4ade80; }
html[data-theme='dark'] .apt-toolbar-cancel:hover { background: rgba(239, 68, 68, .2); color: #f87171; }

/* ===== 机场编辑内联编号输入框（跟随点击位置，深浅色自适应）===== */
.apt-inline-edit {
  position: absolute;
  z-index: 2300;
  transform: translate(-50%, -130%);
}
.apt-inline-edit input {
  width: 90px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  border: 1.5px solid var(--c-primary, #1769d2);
  border-radius: 6px;
  outline: none;
  background: rgba(255, 255, 255, .96);
  color: #1f2937;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .22);
}
html[data-theme='dark'] .apt-inline-edit input {
  background: rgba(28, 32, 42, .96);
  color: #e5e7eb;
  border-color: #8ab4ff;
}
</style>

<!-- 深色模式: 降低 Mapbox 3D 地球亮度(非 scoped 全局, 命中动态生成的 canvas;
     仅视觉调暗, 保留全部交互功能; HTML 飞行器标记不受 canvas 滤镜影响)
     滤镜 1s 过渡: 深浅主题切换时平滑渐变, 而非瞬间跳变 -->
<style>
.mapboxgl-canvas {
  transition: filter 1s ease;
}
html[data-theme='dark'] .mapboxgl-canvas {
  filter: brightness(0.75) saturate(1.06) contrast(1.06);
}

/* 标签数量工具栏（手动创建 DOM 元素，需非 scoped 全局样式；点击端点后鼠标右上角弹出） */
.apt-label-count-bar {
  position: fixed;
  z-index: 2250;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 7px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .94);
  border: 1px solid rgba(0, 0, 0, .12);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  user-select: none;
}
html[data-theme='dark'] .apt-label-count-bar {
  background: rgba(28, 32, 42, .94);
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .5);
}
.apt-label-count-title {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  margin-right: 2px;
}
html[data-theme='dark'] .apt-label-count-title { color: #6b7280; }
.apt-label-count-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #374151;
  cursor: pointer;
  transition: all .15s ease;
}
html[data-theme='dark'] .apt-label-count-btn { color: #cbd5e1; }
.apt-label-count-btn:hover {
  background: var(--c-primary, #1769d2);
  color: #fff;
}

/* 跑道设置工具栏（点击跑道端点弹出复选框） */
.apt-runway-bar {
  position: fixed;
  z-index: 2250;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .96);
  border: 1px solid rgba(0, 0, 0, .12);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  user-select: none;
}
html[data-theme='dark'] .apt-runway-bar {
  background: rgba(28, 32, 42, .96);
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .5);
}
.apt-runway-title {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 2px;
  border-bottom: 1px solid rgba(0, 0, 0, .08);
  padding-bottom: 4px;
}
html[data-theme='dark'] .apt-runway-title { color: #e5e7eb; border-bottom-color: rgba(255,255,255,.1); }
.apt-runway-opt {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}
html[data-theme='dark'] .apt-runway-opt { color: #cbd5e1; }
.apt-runway-opt input {
  accent-color: var(--c-primary, #1769d2);
  cursor: pointer;
}
/* 分组（功能/材质） */
.apt-runway-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 4px;
  margin-top: 4px;
  border-top: 1px solid rgba(0, 0, 0, .08);
}
html[data-theme='dark'] .apt-runway-group { border-top-color: rgba(255,255,255,.1); }
.apt-runway-group-title {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  letter-spacing: .5px;
  margin-bottom: 1px;
}
html[data-theme='dark'] .apt-runway-group-title { color: #9ca3af; }
/* 中心线/地面刻槽按钮 */
.apt-runway-btn-row {
  display: flex;
  gap: 5px;
  margin-top: 1px;
}
.apt-runway-btn {
  flex: 1;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 7px;
  border: 1px solid rgba(0, 0, 0, .15);
  background: #f3f4f6;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
  transition: background .15s, color .15s, border-color .15s;
}
.apt-runway-btn:hover { background: #e5e7eb; }
.apt-runway-btn.active {
  background: var(--c-primary, #1769d2);
  border-color: var(--c-primary, #1769d2);
  color: #fff;
}
html[data-theme='dark'] .apt-runway-btn { background: #1f2937; border-color: rgba(255,255,255,.15); color: #cbd5e1; }
html[data-theme='dark'] .apt-runway-btn:hover { background: #374151; }
html[data-theme='dark'] .apt-runway-btn.active { background: var(--c-primary, #1769d2); border-color: var(--c-primary, #1769d2); color: #fff; }
/* 材质子标题 + 互斥按钮 */
.apt-runway-mat-label {
  font-size: 11px;
  color: #6b7280;
  margin-top: 2px;
}
html[data-theme='dark'] .apt-runway-mat-label { color: #9ca3af; }
.apt-runway-mat-row {
  display: flex;
  gap: 5px;
}
.apt-runway-mat-btn {
  flex: 1;
  padding: 4px 4px;
  font-size: 12px;
  border-radius: 7px;
  border: 1px solid rgba(0, 0, 0, .15);
  background: #f3f4f6;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
  transition: background .15s, color .15s, border-color .15s;
}
.apt-runway-mat-btn:hover { background: #e5e7eb; }
.apt-runway-mat-btn.active {
  background: var(--c-primary, #1769d2);
  border-color: var(--c-primary, #1769d2);
  color: #fff;
}
.apt-runway-mat-btn:disabled {
  opacity: .4;
  cursor: not-allowed;
}
html[data-theme='dark'] .apt-runway-mat-btn { background: #1f2937; border-color: rgba(255,255,255,.15); color: #cbd5e1; }
html[data-theme='dark'] .apt-runway-mat-btn:hover { background: #374151; }
html[data-theme='dark'] .apt-runway-mat-btn.active { background: var(--c-primary, #1769d2); border-color: var(--c-primary, #1769d2); color: #fff; }
</style>
