/**
 * useOnlineMapInteraction —— 在线地图引擎与覆盖物编排（原 OnlineMap.vue 地图核心逻辑）
 *
 * 职责：
 *  - 双引擎生命周期：AMap 2D（loadAMap / initMap / applyLayer / clampViewportLat）与
 *    Mapbox GL 3D（loadMapboxGL / initMapbox3D / globe + 地形 + 大气），以及 selectLayer → switchEngine；
 *  - 覆盖物渲染：AMap 机组 marker/trail/信息窗与管制边界 polygon/点/label；
 *    Mapbox 机组 symbol 层、trail 线、边界 fill/line、3D 飞机模型层（utils/aircraft3d）；
 *  - 气象雷达（OpenWeatherMap 降水瓦片）在 2D/3D 双引擎的挂载与移除；
 *  - 主题跟随（html[data-theme] MutationObserver）：AMap 底图 style、Mapbox fog 渐变、
 *    机场标注颜色、图标重载；
 *  - 开发者工具光标定位（光标经纬度 readout、双击复制、十字准星光标）；
 *  - Mapbox 3D 优雅降级：未配置令牌 / 本次会话已判定令牌失效时直接禁用 3D 与 Mapbox 卫星源、
 *    提示后走 2D 高德；运行期捕获 Mapbox error（style 401 / invalid access token）后
 *    **首次失败自动回退 2D 且只回退一次**（sessionStorage 标记 cw_mapbox_invalid），
 *    回退时清理 Mapbox 实例/监听/覆盖物，不影响 2D 机组/雷达/机场编辑。
 *
 * 入参 cfg（由页面提供，均为响应式引用，保证与页面/数据层共享同一份状态）：
 *  - cfg.mapContainer  地图容器元素 ref
 *  - cfg.activeLayer   当前地图源 id ref（'mapbox3d' | 'mapbox3d_sat' | 'gaode' | 'gaode_sat' | 'mapbox' | 'arcgis'）
 *  - cfg.loading       首次加载遮罩 ref
 *  - cfg.mapError      地图错误文案 ref
 *  - cfg.pilots        机组数据 ref（数据层写入）
 *  - cfg.boundaries    管制边界数据 ref（数据层写入）
 *  - cfg.cursorPos     光标经纬度 ref（模板展示）
 *  - cfg.onRequestPilots  引擎就绪后触发一次机组数据加载（避免引擎层依赖数据层）
 *
 * 返回：
 *  - start() / stop()   挂载启动 / 卸载清理（页面 onMounted / onUnmounted 调用）
 *  - onDataUpdate()     数据刷新后的统一重绘（原 loadPilots 内的渲染分支）
 *  - isDevToolActive()  模板十字准星 class 判定
 *  - mapboxAvailable    3D/Mapbox 源是否可用的响应式标志（页面传给 MapLayerSwitcher 置灰）
 *  - editor             机场编辑器实例（含工具栏状态、提交/取消、快捷键绑定）
 *
 * 副作用与清理（stop() 内统一执行）：
 *  - AMap/Mapbox 脚本标签、地图 canvas/容器元素、image/source/layer、AMap 矢量对象；
 *  - themeObserver（MutationObserver）、window mousemove、map move/dblclick 监听；
 *  - Three.js 3D 飞机图层（destroyAircraft3D）；
 *  - window.__cwMap / window.__cwMap3D 调试引用置空；
 *  - 机场地面图层缓存（ground.dispose()）与编辑器 DOM/timer（editor.dispose()）。
 */
import { ref, watch } from 'vue'
import { isDarkTheme } from '@/utils/theme'
import { escapeHtml } from '@/utils/sanitize'
import { useMapSettingsStore } from '@/store/mapSettings'
import { createAircraft3DLayer, updateAircraft3D, destroyAircraft3D } from '@/utils/aircraft3d'
import {
  MAPBOX_FALLBACK_LAYER,
  MAPBOX_INVALID_MESSAGE,
  MAPBOX_LOAD_FAILED_MESSAGE,
  MAPBOX_UNAVAILABLE_MESSAGE,
  isMapboxDependentLayer,
  isMapboxMarkedInvalid,
  isMapboxTokenError,
  markMapboxInvalid,
  resolveMapboxFallback,
} from '@/utils/mapboxHealth'
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
  MAP_CENTER,
  MAP_ZOOM,
  BOTTOM_LAT,
  TOP_LAT,
  is3D,
  isMapboxConfigured,
  toGcj02,
} from '@/components/map/mapCore'
import { useAirportGroundLayers } from './useAirportGroundLayers'
import { useAirportEditor } from './useAirportEditor'

export function useOnlineMapInteraction(cfg) {
  const mapSettings = useMapSettingsStore()
  const { mapContainer, activeLayer, loading, mapError, pilots, boundaries, cursorPos } = cfg

  // ===== 引擎实例与覆盖物状态 =====
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

  // ===== Mapbox 3D 可用性与降级状态 =====
  // mapboxAvailable：令牌可用且本次会话未被判定失效；页面把它传给 MapLayerSwitcher 置灰 3D 分组
  // 初始值同步计算，避免首帧渲染时 3D 分组短暂显示为可用
  const mapboxAvailable = ref(isMapboxConfigured() && !isMapboxMarkedInvalid())
  let mapboxErrorHandler = null      // 绑定在当前 Mapbox 实例上的 error 事件处理器（回退时解绑）
  let mapboxFallbackDone = false     // 本次页面生命周期是否已自动回退（保证只回退一次）
  let mapErrorTimer = null           // 降级提示自动消失定时器（避免长期遮挡地图）

  // ===== 机场地面图层 / 机场编辑器：共享同一编排上下文（getter 保证读到当前引擎实例）=====
  let ground = null
  let editor = null
  const engineCtx = {
    get map() { return map },
    get mapboxMap() { return mapboxMap },
    activeLayer,
    mapContainer,
    getAptEditIcao: () => (editor ? editor.getAptEdit().icao : null),
    applyDevCursor: (...args) => applyDevCursor(...args),
    stopSpin: () => mapboxStopSpin(),
    startSpin: () => mapboxStartSpin(),
  }
  ground = useAirportGroundLayers(engineCtx)
  editor = useAirportEditor({
    get map() { return map },
    get mapboxMap() { return mapboxMap },
    activeLayer,
    mapContainer,
    ground,
    applyDevCursor: (...args) => applyDevCursor(...args),
    stopSpin: () => mapboxStopSpin(),
    startSpin: () => mapboxStartSpin(),
  })

  // ===== 地图初始化 / 图层切换 / 引擎切换 =====
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
      ground.updateAirportLayersAMap()
    })

    map.on('moveend', () => { clampViewportLat(); ground.updateAirportLayersAMap() })
    map.on('moving', clampViewportLat)

    // 地图拖动光标：正常抓手，拖动中抓取
    map.on('dragstart', () => { try { map.setDefaultCursor('grabbing') } catch {} })
    map.on('dragend', applyDevCursor)
    applyDevCursor()

    applyLayer()
    cfg.onRequestPilots()
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
    ground.syncAmapGcjMode()
    ground.updateAirportLayersAMap()
    // 气象雷达: 若开关开启则同步添加(地图重建后自动重新挂载)
    if (mapSettings.weatherRadar) setRadar(true)
  }

  // ---------------------------------------------------------------------------
  // 地图引擎切换：3D（Mapbox GL globe）/ 2D（AMap 平面）
  // 仅更新 activeLayer，实际引擎切换统一由 watch(activeLayer) 处理
  // ---------------------------------------------------------------------------
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
    // ===== 3D 可用性前置检查：未配置令牌 / 本次会话已判定失效 → 不加载 Mapbox，直接降级 2D =====
    const availability = refreshMapboxAvailability()
    if (!availability.available) {
      mapboxFallbackDone = true
      fallbackTo2D({ message: availability.message })
      return
    }
    const myToken = ++engineToken
    try {
      await loadMapboxGL()
    } catch {
      loading.value = false
      // 脚本加载失败（本地/CDN 均不可达）：回退 2D；不写 sessionStorage（刷新后允许重试 3D）
      mapboxFallbackDone = true
      fallbackTo2D({ message: MAPBOX_LOAD_FAILED_MESSAGE })
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
    // 运行期错误监听：style 401 / invalid access token → 首次失败自动回退 2D 高德（只回退一次）
    mapboxErrorHandler = handleMapboxError
    thisMap.on('error', mapboxErrorHandler)
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
      mapboxMap.on('load', () => { if (!editor.isAptEditActive()) mapboxStartSpin() })
      mapboxStartSpin()
      mapboxMap.on('movestart', mapboxStopSpin)
      mapboxMap.on('moveend', () => { if (!editor.isAptEditActive()) mapboxStartSpin() })

      // 渲染飞行器 + 边界
      if (mapSettings.weatherRadar) setRadar(true)
      renderMapboxPilots()
      renderMapboxBoundaries()
      // 机场地面图层：首次加载 + 视口变化时懒加载
      thisMap.on('moveend', ground.updateAirportLayers)
      ground.updateAirportLayers()
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
    // ===== 3D 降级守卫：3D / Mapbox 卫星在不可用时一律回到 2D 高德 =====
    // （正常路径由 MapLayerSwitcher 置灰拦截，这里兜住程序化切换/旧链接等入口）
    if (isMapboxDependentLayer(activeLayer.value) && !mapboxAvailable.value) {
      const availability = refreshMapboxAvailability()
      if (!availability.available) {
        mapboxFallbackDone = true
        fallbackTo2D({ message: availability.message })
        return
      }
      mapboxAvailable.value = true
    }
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
        ground.resetAirportLayers()
        if (mapSettings.weatherRadar) setRadar(true)
        renderMapboxPilots()
        renderMapboxBoundaries()
        ground.updateAirportLayers()
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
      ground.resetAmapAirportState()   // AMap 已销毁，其上的机场图层一并清空
      markers = []
      boundaryLayers = []
      if (mapboxMap) {
        unbindMapboxError()
        mapboxMap.remove()
        mapboxMap = null
        window.__cwMap3D = null
      }
      destroyAircraft3D()   // 释放 Three.js 资源（模型/渲染器/图层）
      mapboxMarkers = []
      mapboxSources = []
      ground.resetAirportLayers()
      initMapbox3D()
    } else {
      // 2D 模式：销毁 Mapbox，初始化 AMap
      if (mapboxMap) {
        unbindMapboxError()
        mapboxMap.remove()
        mapboxMap = null
        window.__cwMap3D = null
      }
      destroyAircraft3D()
      mapboxMarkers = []
      mapboxSources = []
      ground.resetAirportLayers()
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

  // ===== Mapbox 3D 可用性判定 / 降级 =====

  /** 重新计算 3D 可用性（有令牌 & 本次会话未被判定失效），同步到 mapboxAvailable 并返回决策结果 */
  function refreshMapboxAvailability() {
    const result = resolveMapboxFallback({ token: MAPBOX_TOKEN })
    mapboxAvailable.value = result.available
    return result
  }

  /** 显示可自动消失的降级提示（写 mapError，6s 后清空，避免永久遮挡地图中心） */
  function notifyMapboxFallback(message) {
    mapError.value = message
    if (mapErrorTimer) clearTimeout(mapErrorTimer)
    mapErrorTimer = setTimeout(() => {
      mapErrorTimer = null
      // 仅在仍是本条提示时清空，避免覆盖其它更严重的错误文案
      if (mapError.value === message) mapError.value = ''
    }, 6000)
  }

  /** 解绑当前 Mapbox 实例的 error 监听（幂等；实例销毁前必须调用，避免残留闭包） */
  function unbindMapboxError() {
    if (mapboxErrorHandler && mapboxMap) {
      try { mapboxMap.off('error', mapboxErrorHandler) } catch { /* 实例可能已销毁 */ }
    }
    mapboxErrorHandler = null
  }

  /** 销毁 Mapbox 实例并解绑其监听/覆盖物/3D 资源（降级回 2D 与常规引擎切换共用） */
  function disposeMapbox() {
    unbindMapboxError()
    mapboxStopSpin()
    destroyAircraft3D()
    if (mapboxMap) {
      try { clearMapboxOverlays() } catch { /* 忽略清理异常，继续销毁 */ }
      try { mapboxMap.remove() } catch { /* 忽略销毁异常 */ }
      mapboxMap = null
      window.__cwMap3D = null
    }
    mapboxMarkers = []
    mapboxSources = []
    ground.resetAirportLayers()
  }

  /**
   * 首次判定 3D 不可用：禁用 3D/Mapbox 源 + 提示 + 销毁 Mapbox + 切回 2D 高德。
   * 2D 引擎初始化交给 watch(activeLayer) → switchEngine（保持单一初始化路径，避免重复注入 AMap SDK）。
   * @param {{ message?: string, persist?: boolean }} [options]
   *   persist=true 时写 sessionStorage 失效标记（令牌类错误，刷新后不再重试 3D）
   */
  function fallbackTo2D(options = {}) {
    const { message = MAPBOX_UNAVAILABLE_MESSAGE, persist = false } = options
    mapboxAvailable.value = false
    if (persist) markMapboxInvalid()
    notifyMapboxFallback(message)
    disposeMapbox()
    loading.value = false
    if (isMapboxDependentLayer(activeLayer.value)) {
      // 触发 watch(activeLayer) → switchEngine → 初始化 AMap 2D
      activeLayer.value = MAPBOX_FALLBACK_LAYER
    }
  }

  /** Mapbox 运行期错误：仅令牌/鉴权类（style 401、invalid access token 等）触发一次自动回退 */
  function handleMapboxError(event) {
    if (mapboxFallbackDone) return
    if (!isMapboxTokenError(event?.error ?? event)) return
    mapboxFallbackDone = true
    fallbackTo2D({ message: MAPBOX_INVALID_MESSAGE, persist: true })
  }

  // ===== Mapbox 3D 机组 / 边界渲染 =====
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

  // ===== 气象雷达图层 =====
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

  // ===== 主题切换（html[data-theme]）=====
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
    ground.updateAirportLabelColors(dark)
    // Mapbox 3D 地球大气层跟随主题(深色屏蔽白光)
    applyMapboxFog(dark)
  }


  // ===== AMap 2D 管制边界渲染 =====
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
      content: `<b>${escapeHtml(b.label || b.callsign)}</b><br/>席位: ${escapeHtml(b.type)}<br/>` +
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

  // ===== AMap 2D 机组渲染 =====
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
        <span style="position:absolute;left:50%;top:100%;transform:translateX(-50%);font-size:10px;color:${callColor};font-weight:600;${callShadow}white-space:nowrap">${escapeHtml(callsign)}</span>
      </div>`,
      offset: new AMap.Pixel(-20, -20),
    })
    map.add(marker)

    const info = new AMap.InfoWindow({
      content: [
        `<b>${escapeHtml(callsign)}</b>`,
        `机型: ${escapeHtml(p.aircraft || '-')}`,
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

  // ===== AMap 脚本加载 =====
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

  // ===== 开发者工具：光标定位 =====
  // ===== 开发者工具: 光标定位(地图 hover/拖动时 光标右上角实时显示经纬度) =====
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
    editor.setAirportEditMode(v === 'airport-edit')
    applyDevCursor()
  }, { immediate: true })
  // 地图实例就绪后补绑(devTool 可能先于地图初始化设置)
  watch(mapboxMap, (m) => { if (m && mapSettings.devTool === 'cursor') { m.on('move', updateCursor); m.on('dblclick', onMapDblClick) } })
  watch(map, (m) => { if (m && mapSettings.devTool === 'cursor') { m.on('moving', updateCursor); m.on('dblclick', onMapDblClick) } })

  // ===== 编排 API =====
  /** 数据层刷新后的统一重绘：2D/3D 双引擎同步（保持原 loadPilots 内渲染分支行为） */
  function onDataUpdate() {
    renderPilots()
    renderBoundaries()
    if (is3D(activeLayer.value)) {
      renderMapboxPilots()
      renderMapboxBoundaries()
      // 3D 模型层同步更新（图层未就绪时模块内部缓存数据）
      try { updateAircraft3D(pilots.value) } catch { /* 静默，下次刷新重试 */ }
    }
  }

  /** 注册主题监听（html[data-theme] 变化 → 深浅底图 / 大气 / 图标 / 标注颜色） */
  function startThemeObserver() {
    // 监听主题(html[data-theme])变化, 动态切换高德深浅底图
    themeObserver = new MutationObserver(applyMapTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }

  /** 页面挂载后启动：先做 3D 可用性前置检查，再按当前 activeLayer 初始化引擎，并监听主题变化 */
  function start() {
    // ===== 3D 可用性前置检查：无令牌 / 本次会话已判定失效 → 不加载 Mapbox，直接走 2D =====
    const availability = refreshMapboxAvailability()
    if (!availability.available) {
      if (isMapboxDependentLayer(activeLayer.value)) {
        mapboxFallbackDone = true
        // activeLayer → 'gaode' 后由 watch(activeLayer) → switchEngine 完成 2D 初始化（保持单一初始化路径）
        fallbackTo2D({ message: availability.message })
        startThemeObserver()
        return
      }
      // 当前已是 2D 源：仅提示 3D 不可用，继续正常初始化 2D
      notifyMapboxFallback(availability.message)
    }
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
    startThemeObserver()
  }

  /** 页面卸载清理：解绑监听 / 断开主题观察 / 销毁覆盖物与引擎 / 释放缓存与编辑态 */
  function stop() {
    unbindCursorLocate()
    // Mapbox 运行期错误监听与降级提示定时器
    unbindMapboxError()
    if (mapErrorTimer) { clearTimeout(mapErrorTimer); mapErrorTimer = null }
    if (themeObserver) { themeObserver.disconnect(); themeObserver = null }

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
    if (editor) editor.dispose()
    ground.dispose()
    window.__cwMap = null
    window.__cwMap3D = null
  }

  return {
    start,
    stop,
    onDataUpdate,
    isDevToolActive,
    mapboxAvailable,
    editor,
  }
}
