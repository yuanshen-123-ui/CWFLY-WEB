/**
 * useAirportGroundLayers —— 机场地面数据（跑道 / 滑行道 / 停机坪 / 编号标签）图层
 *
 * 职责：
 *  - 3D（Mapbox GL）：按视口 + 缩放懒加载 /airports/{icao}.json，建立 source+layer
 *    （跑道、滑行道、跑道号、中心线、停止线、防吹坪、刻槽、标签），并按主题着色；
 *  - 2D（AMap）：同样懒加载 GeoJSON，转成 Polygon/Polyline/LabelMarker 并按坐标系（GCJ-02）放置；
 *  - 跑道号自定义字体（HOOG0554）图标注册；
 *  - 主题切换时更新标签颜色；引擎切换时重置缓存；卸载时释放全部缓存。
 *
 * 入参 ctx：引擎访问器，由 useOnlineMapInteraction 提供（getter 形式，永远读到最新实例）：
 *  - ctx.map            AMap 实例或 null
 *  - ctx.mapboxMap      Mapbox GL 实例或 null
 *  - ctx.activeLayer    当前地图源 id（ref）
 *  - ctx.getAptEditIcao()  当前机场编辑的 ICAO（跑道号图标重绘用）
 *
 * 返回：可供编排层调用的图层操作函数集合 + AIRPORT_INDEX / airportLayersLoaded 等状态。
 * 副作用与清理：
 *  - 注册/移除 Mapbox source、layer、image；创建/销毁 AMap 矢量对象、LabelsLayer；
 *  - 仅有内存缓存（airportGjCache、airportLayersLoaded、amapAirportLayers），无 timer/监听；
 *  - 卸载时调用 dispose() 清空缓存与 2D 图层引用（真正的图层由地图实例销毁一并释放）。
 */
import { isDarkTheme } from '@/utils/theme'
import { is3D, toGcj02 } from '@/components/map/mapCore'

export function useAirportGroundLayers(ctx) {
  // ===== 机场地面图层（跑道/滑行道/停机坪，GeoJSON 懒加载）=====
  // 数据来源: X-Plane Scenery Gateway apt.dat → tools/apt2geojson.py 转换
  // 文件: /airports/{icao}.json；zoom >= APT_ZOOM_MIN 且视口靠近机场时才加载
  const APT_ZOOM_MIN = 10.5
  const airportLayersLoaded = new Set()   // 已加载的 ICAO

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
    if (!ctx.mapboxMap || !is3D(ctx.activeLayer.value)) return
    try { if (!ctx.mapboxMap.isStyleLoaded()) return } catch { return }
    if (ctx.mapboxMap.getZoom() < APT_ZOOM_MIN) {
      // 缩小到全球视角时移除机场图层（避免遮挡/浪费）
      for (const icao of [...airportLayersLoaded]) removeAirportLayer(icao)
      return
    }
    const bounds = ctx.mapboxMap.getBounds()
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
    if (!ctx.mapboxMap || !nums || !nums.length) return
    const ok = await loadRunwayNoFont()
    if (!ok) return
    let added = false
    for (const raw of new Set(nums)) {
      const num = String(raw)
      const id = `rn-${num}`
      if (ctx.mapboxMap.hasImage(id)) continue
      try { ctx.mapboxMap.addImage(id, renderRunwayNoIcon(num)); added = true } catch { /* ignore */ }
    }
    // 有新增图标时重绘，使当前机场源里的跑道号立即显示
    if (added && ctx.getAptEditIcao()) {
      try {
        const s = ctx.mapboxMap.getSource(`apt-${ctx.getAptEditIcao()}`)
        if (s && s._data) s.setData(s._data)
      } catch { /* ignore */ }
    }
  }

  // 机场 GeoJSON 内存缓存：3D↔3D 卫星切换（setStyle）时复用，避免重新 fetch
  const airportGjCache = new Map()   // icao -> FeatureCollection

  async function loadAirportLayer(icao) {
    if (!ctx.mapboxMap || airportLayersLoaded.has(icao)) return
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
      if (!gj || !ctx.mapboxMap || !is3D(ctx.activeLayer.value)) { airportLayersLoaded.delete(icao); return }
      const srcId = `apt-${icao}`
      if (ctx.mapboxMap.getSource(srcId)) return   // 已存在（并发保护）
      // 预生成跑道号自定义字体图标（HOOG0554），供 runway-no 符号层 icon-image 使用
      try {
        const rnNums = (gj.features || []).filter(f => f.properties.kind === 'runway-no').map(f => f.properties.num)
        if (rnNums.length) await ensureRunwayNoIcons(rnNums)
      } catch { /* 图标失败不影响加载 */ }
      // 注：不渲染停机坪多边形（XP 数据含不规则大面会形成黑色阴影，底图已有停机坪纹理）
      ctx.mapboxMap.addSource(srcId, { type: 'geojson', data: gj })
      // 跑道（深色多边形 + 白色描边；材质沥青深灰/混凝土浅灰，默认沥青）
      ctx.mapboxMap.addLayer({
        id: `${srcId}-runway`, type: 'fill', source: srcId,
        filter: ['==', ['get', 'kind'], 'runway'],
        paint: {
          'fill-color': ['case', ['==', ['get', '_material'], 'concrete'], '#a3adb5', '#4b5563'],
          'fill-opacity': 0.9,
        },
      })
      ctx.mapboxMap.addLayer({
        id: `${srcId}-runway-line`, type: 'line', source: srcId,
        filter: ['==', ['get', 'kind'], 'runway'],
        paint: { 'line-color': '#f9fafb', 'line-width': 1, 'line-opacity': 0.7 },
      })
      // 手动滑行道（矩形区域面 + 描边，位于跑道之上）
      ctx.mapboxMap.addLayer({
        id: `${srcId}-taxiway-fill`, type: 'fill', source: srcId,
        filter: ['all', ['==', ['get', 'kind'], 'taxiway'], ['==', ['get', '_addedInEdit'], true]],
        paint: { 'fill-color': '#8f9aa6', 'fill-opacity': 0.85, 'fill-outline-color': '#6b7280' },
      })
      // 注：不渲染滑行道线（底图已有），仅保留滑行道编号标注
      // 注：跑道号标注已按需求移除（不显示）
      // 滑行道编号标注（OSM 独立编号点，如 J3/Q2/K5）
      // 配色随主题：深色=黄字深描边；浅色=黄字白描边
      const dark = isDarkTheme()
      ctx.mapboxMap.addLayer({
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
      ctx.mapboxMap.addLayer({
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
      ctx.mapboxMap.addLayer({
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
      ctx.mapboxMap.addLayer({
        id: `${srcId}-runway-no`, type: 'symbol', source: srcId,
        filter: ['==', ['get', 'kind'], 'runway-no'],
        minzoom: 13,
        layout: {
          'icon-image': ['concat', 'rn-', ['get', 'num']],
          // 随地图缩放：'map' 对齐下用 zoom 表达式。低 zoom 的 size 调大保证缩小后跑道号仍可见，
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
      ctx.mapboxMap.addLayer({
        id: `${srcId}-centerline`, type: 'line', source: srcId,
        filter: ['==', ['get', 'kind'], 'centerline'],
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.9, 'line-dasharray': [50, 4] },
      })
      // 停止线（白色竖条，位于跑道之上）
      ctx.mapboxMap.addLayer({
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
      ctx.mapboxMap.addLayer({
        id: `${srcId}-blast-pad-area`, type: 'fill', source: srcId,
        filter: ['==', ['get', 'kind'], 'blast-pad-area'],
        paint: {
          'fill-color': ['case', ['==', ['get', '_material'], 'concrete'], '#a3adb5', '#4b5563'],
          'fill-opacity': 0.85,
          'fill-outline-color': '#facc15',
        },
      })
      // 防吹坪黄色 ^ 条纹（位于材质区域之上，不被覆盖）
      ctx.mapboxMap.addLayer({
        id: `${srcId}-blast-pad`, type: 'line', source: srcId,
        filter: ['==', ['get', 'kind'], 'blast-pad'],
        paint: { 'line-color': '#facc15', 'line-width': 3.5, 'line-opacity': 1 },
      })
      // 地面刻槽（白色半透明面，位于跑道之上）
      ctx.mapboxMap.addLayer({
        id: `${srcId}-groove`, type: 'fill', source: srcId,
        filter: ['==', ['get', 'kind'], 'groove'],
        paint: { 'fill-color': '#f8fafc', 'fill-opacity': 0.45, 'fill-outline-color': '#e2e8f0' },
      })
    } catch { airportLayersLoaded.delete(icao) }
  }

  function removeAirportLayer(icao) {
    if (!ctx.mapboxMap) return
    const srcId = `apt-${icao}`
    for (const l of ['-runway', '-runway-line', '-runway-label', '-taxiway-label', '-stand-label', '-taxiway-fill', '-runway-no', '-centerline', '-stop-bar', '-blast-pad', '-blast-pad-area', '-groove']) {
      try { if (ctx.mapboxMap.getLayer(srcId + l)) ctx.mapboxMap.removeLayer(srcId + l) } catch { /* ignore */ }
    }
    try { if (ctx.mapboxMap.getSource(srcId)) ctx.mapboxMap.removeSource(srcId) } catch { /* ignore */ }
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
    return ctx.activeLayer.value === 'gaode' || ctx.activeLayer.value === 'gaode_sat'
  }

  function updateAirportLayersAMap() {
    if (!ctx.map || is3D(ctx.activeLayer.value)) return
    const zoom = ctx.map.getZoom()
    if (zoom < APT_ZOOM_MIN) {
      for (const icao of Object.keys(amapAirportLayers)) removeAirportLayerAMap(icao)
      return
    }
    const bounds = ctx.map.getBounds()
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
    if (!ctx.map || amapAirportLayers[icao]) return
    let gj = null
    try { gj = await fetch(`/uploads/airports/${icao}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null) } catch { gj = null }
    if (!gj) gj = await fetch(`/airports/${icao}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
    if (!gj || !ctx.map || is3D(ctx.activeLayer.value)) return
    // 懒创建共享标签层（canvas 高性能渲染）
    if (!amapAirportLabelsLayer) {
      amapAirportLabelsLayer = new AMap.LabelsLayer({ zooms: [3, 20] })
      ctx.map.add(amapAirportLabelsLayer)
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
    polys.forEach(o => ctx.map.add(o))
    lines.forEach(o => ctx.map.add(o))
    if (labels.length) amapAirportLabelsLayer.add(labels)
  }

  function removeAirportLayerAMap(icao) {
    const layer = amapAirportLayers[icao]
    if (!layer) return
    layer.polys.forEach(o => { try { ctx.map.remove(o) } catch { /* ignore */ } })
    layer.lines.forEach(o => { try { ctx.map.remove(o) } catch { /* ignore */ } })
    if (layer.labels.length && amapAirportLabelsLayer) {
      try { amapAirportLabelsLayer.remove(layer.labels) } catch { /* ignore */ }
    }
    delete amapAirportLayers[icao]
  }

  /** 主题切换时更新已加载机场的标注描边/文字颜色（无需重建图层） */
  function updateAirportLabelColors(dark) {
    if (!ctx.mapboxMap) return
    const halo = dark ? '#111827' : '#ffffff'
    for (const icao of airportLayersLoaded) {
      const taxi = ctx.mapboxMap.getLayer(`apt-${icao}-taxiway-label`)
      if (taxi) {
        try { ctx.mapboxMap.setPaintProperty(taxi.id, 'text-halo-color', halo) } catch { /* ignore */ }
      }
      const stand = ctx.mapboxMap.getLayer(`apt-${icao}-stand-label`)
      if (stand) {
        try {
          ctx.mapboxMap.setPaintProperty(stand.id, 'text-color', dark ? '#9ca3af' : '#6b7280')
          ctx.mapboxMap.setPaintProperty(stand.id, 'text-halo-color', halo)
        } catch { /* ignore */ }
      }
    }
  }

  /** 高德底图坐标系切换（GCJ-02 ↔ WGS84）时清空 2D 机场图层，等待按新坐标系重载 */
  function syncAmapGcjMode() {
    const gcj = amapNeedsGcj()
    if (gcj !== amapAirportGcjMode) {
      for (const icao of Object.keys(amapAirportLayers)) removeAirportLayerAMap(icao)
      amapAirportGcjMode = gcj
    }
  }

  /** 引擎切换销毁 AMap 时清空其上机场图层引用（AMap 已销毁，矢量对象随之释放） */
  function resetAmapAirportState() {
    amapAirportLayers = {}
    amapAirportLabelsLayer = null
    amapAirportGcjMode = null
  }

  /** 组件卸载时释放内存缓存与 2D 图层引用，避免跨页面残留 */
  function dispose() {
    airportLayersLoaded.clear()
    airportGjCache.clear()
    resetAmapAirportState()
  }

  return {
    AIRPORT_INDEX,
    APT_ZOOM_MIN,
    airportLayersLoaded,
    airportGjCache,
    updateAirportLayers,
    loadAirportLayer,
    removeAirportLayer,
    resetAirportLayers,
    amapNeedsGcj,
    updateAirportLayersAMap,
    loadAirportLayerAMap,
    removeAirportLayerAMap,
    ensureRunwayNoIcons,
    updateAirportLabelColors,
    syncAmapGcjMode,
    resetAmapAirportState,
    dispose,
  }
}
