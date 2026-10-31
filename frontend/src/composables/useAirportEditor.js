/**
 * useAirportEditor —— 机场地面数据编辑模式（开发者工具 'airport-edit'）
 *
 * 职责（全部为原 OnlineMap.vue 中机场编辑相关逻辑的原样迁移）：
 *  - 编辑态数据：折线（aptEdit.lines）、标签位置/数量、弧线控制点、停止线锚点，
 *    持久化到 localStorage（key: cw_apt_edit_v1），提交到服务器 /admin/airports/{icao}；
 *  - 编辑图层：apt-edit-{icao} 的 line / handle / curve-arrow 三层 + 各类交互
 *    （拖动端点、双击加点、三击加标签、右键弧线/删点、双击改名、内联编辑）；
 *  - 附属要素生成：跑道矩形、滑行道 30m 带状面、跑道号、中心线、停止线、防吹坪、地面刻槽；
 *  - 撤销 / 重做（Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z，最多 10 步）；
 *  - 悬浮工具栏状态（可见性、当前工具模式）、跑道设置工具栏、标签数量工具栏、绘制预览。
 *
 * 入参 ctx（由 useOnlineMapInteraction 提供）：
 *  - ctx.map / ctx.mapboxMap      引擎实例（getter，随引擎切换变化）
 *  - ctx.activeLayer              当前地图源 id（ref）
 *  - ctx.mapContainer             地图容器（ref，用于内联编辑框定位）
 *  - ctx.ground                   机场地面图层模块（AIRPORT_INDEX / loadAirportLayer 等）
 *  - ctx.applyDevCursor()         应用开发者工具光标
 *  - ctx.stopSpin() / ctx.startSpin()  暂停/恢复 3D 地球自转（编辑时需静止）
 *
 * 返回：工具栏可见性/模式 ref、编辑模式开关、提交/取消、快捷键绑定与卸载清理函数。
 * 副作用与清理：
 *  - 向 document.body 追加工具栏 DOM（跑道设置/标签数量）、向地图容器追加内联输入框；
 *  - 注册 mapboxMap.on 交互、window keydown 快捷键、mousemove/mouseup 拖动监听；
 *  - 所有 timer（aptDrawTimer、aptDropTimer、双击判定定时器、handle 定时器）；
 *  - dispose() 统一清理上述 DOM/timer/编辑图层，bindShortcuts()/unbindShortcuts() 成对使用。
 */
import { ref } from 'vue'
import { adminApi } from '@/api'
import { showBanner } from '@/utils/banner'
import { showActionBanner, hideActionBanner } from '@/utils/bannerAction'
import { useMapSettingsStore } from '@/store/mapSettings'

export function useAirportEditor(ctx) {
  const mapSettings = useMapSettingsStore()

  // ===== 机场编辑模式（开发者工具 'airport-edit'）=====
  // 功能：同名牌滑行道合并为一条可编辑折线；末端绿色端点可拖动延伸；
  //       双击标签/折线改名；拖动标签调整位置。编辑结果存 localStorage。
  const APT_EDIT_STORE_KEY = 'cw_apt_edit_v1'   // { [icao]: { taxiLines: {name: coords[]}, labelPos: {name: [lon,lat]} } }
  const aptEdit = { active: false, icao: null, lines: {}, labelPos: {}, labelCount: {}, curves: {}, stopBarPos: {}, drag: null, activeGrooveRwy: null }
  const APT_HISTORY_LIMIT = 10   // 撤销/重做最大步数
  let aptUndoStack = []          // 撤销栈（每个元素为一个历史快照，存操作前的状态）
  let aptRedoStack = []          // 重做栈
  let aptPendingSnap = null      // 上一次操作完成时的状态，下次操作时入撤销栈
  let aptInlineEditEl = null        // 内联编辑输入框 DOM
  let aptEditSnapshot = null        // 进入编辑模式时的机场源快照（取消时回滚用）
  let aptDrawPts = []
  let aptDrawTimer = null
  let _aptDrawLastClick = 0
  function clearAptDrawState() {
    aptDrawPts = []
    clearTimeout(aptDrawTimer); aptDrawTimer = null
    _aptDrawLastClick = 0
    if (ctx.mapboxMap) {
      try { if (ctx.mapboxMap.getLayer('apt-draw-line-layer')) ctx.mapboxMap.removeLayer('apt-draw-line-layer') } catch { /* ignore */ }
      try { if (ctx.mapboxMap.getSource('apt-draw-line')) ctx.mapboxMap.removeSource('apt-draw-line') } catch { /* ignore */ }
      try { if (ctx.mapboxMap.getLayer('apt-draw-points-layer')) ctx.mapboxMap.removeLayer('apt-draw-points-layer') } catch { /* ignore */ }
      try { if (ctx.mapboxMap.getSource('apt-draw-points')) ctx.mapboxMap.removeSource('apt-draw-points') } catch { /* ignore */ }
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
    const src = ctx.mapboxMap ? ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`) : null
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const src = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
      const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (on) ctx.stopSpin()   // 编辑模式停止地球自转（否则标签/端点拖不动）
    else ctx.startSpin()     // 退出编辑恢复自转
    if (on && ctx.mapboxMap) {
      clearAptDrawState()
      // 取当前已加载机场中距视口中心最近的一个
      const loaded = [...ctx.ground.airportLayersLoaded]
      if (loaded.length) {
        try {
          const center = ctx.mapboxMap.getCenter()
          aptEdit.icao = loaded.reduce((best, icao) => {
            const p = ctx.ground.AIRPORT_INDEX[icao]
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
      try { ctx.mapboxMap && ctx.mapboxMap.doubleClickZoom.enable() } catch { /* ignore */ }
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
      ctx.applyDevCursor()
    }
  }

  /** ICAO 确定后初始化编辑状态（快照/本地编辑记录/编辑图层） */
  function initAptEditForIcao() {
    if (!ctx.mapboxMap || !aptEdit.icao) return
    clearAptEditOverlays()
    const src = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    ctx.applyDevCursor()
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
        const pos = ctx.ground.AIRPORT_INDEX[code]
        if (!pos) {
          showBanner(`机场 ${code} 不存在`, { duration: 2500 })
          setAirportEditMode(false)   // 输入机场不存在：弹出横幅并关闭机场编辑
          return
        }
        aptEdit.icao = code
        try { ctx.mapboxMap.flyTo({ center: pos, zoom: 12, duration: 1200 }) } catch { /* ignore */ }
        waitAirportLoaded(code, () => {
          showBanner(`正在编辑机场 ${code}`, { duration: 2200 })
          initAptEditForIcao()
        })
      },
    })
  }

  /** 等待指定机场加载完成（自动触发加载），超时提示数据不存在 */
  function waitAirportLoaded(code, cb) {
    if (ctx.ground.airportLayersLoaded.has(code)) { cb(); return }
    let tries = 0
    ctx.ground.loadAirportLayer(code)   // 主动加载（不依赖视口判定）
    const check = () => {
      if (ctx.ground.airportLayersLoaded.has(code)) { cb(); return }
      if (++tries > 25) { showBanner(`机场 ${code} 数据不存在`, { duration: 2500 }); return }
      setTimeout(check, 300)
    }
    setTimeout(check, 300)
  }


  
  // ===== 机场编辑悬浮工具栏状态 =====
  // 说明：工具栏的下拉展开状态属于纯 UI 状态，已迁至 AirportEditToolbar.vue；
  //       这里保留「是否显示」「拖动位置」「当前工具模式」与模式分组（地图交互需要读取）。
  const aptToolbarVisible = ref(false)
  const aptToolbarPos = ref({ x: window.innerWidth - 376, y: 180 })
  const aptToolMode = ref(null)   // 'add-runway'|'add-taxi'|'add-runway-label'|'add-taxi-label'|'add-stand'|'add-area-*'
  const APT_POLY_MODES = ['add-runway', 'add-taxi', 'add-runway-label', 'add-taxi-label', 'add-groove']   // 折线绘制类：单击加点/双击结束
  const APT_DRAW_MODES = ['add-runway', 'add-taxi']   // 生成几何的绘制（需至少两个点）
  function toggleAptToolMode(mode) {
    aptToolMode.value = aptToolMode.value === mode ? null : mode
    clearAptDrawState()   // 切换工具时清空未完成的绘制
    removeRunwayToolbar()
    // 绘制模式禁用双击缩放（双击用于结束绘制），退出绘制模式恢复
    if (ctx.mapboxMap) {
      try {
        if (APT_POLY_MODES.includes(aptToolMode.value)) ctx.mapboxMap.doubleClickZoom.disable()
        else ctx.mapboxMap.doubleClickZoom.enable()
      } catch { /* ignore */ }
    }
    // 切换放置模式时改变地图光标为十字
    ctx.applyDevCursor()
  }

  /** 提交到服务器：把当前机场编辑后的完整 GeoJSON POST 给后端，需输入 WEB_SECRET 密码校验
   *  密码输入用全局动作横幅（右侧滑入，提交后缩回） */
  async function aptEditSubmit() {
    if (!aptEdit.active || !aptEdit.icao) return
    const icao = aptEdit.icao
    const src = ctx.mapboxMap.getSource(`apt-${icao}`)
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
    if (!ctx.mapboxMap) return
    ctx.ground.airportGjCache.delete(icao)   // 提交后数据已变，清掉内存缓存强制重新 fetch
    ctx.ground.removeAirportLayer(icao)   // 删除源/图层并清空 ctx.ground.airportLayersLoaded 标记
    ctx.ground.loadAirportLayer(icao)     // 重新 fetch
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
    const src = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
    if (src && aptEditSnapshot) {
      src._data = JSON.parse(JSON.stringify(aptEditSnapshot))
      src.setData(src._data)
    }
    // 退出再重进编辑模式以刷新
    mapSettings.setDevTool('airport-edit')   // toggle off
  }

  /** 把同名牌的 taxi-label 点按名称分组，生成初始折线（点排序后连线） */
  function buildAptEditOverlays() {
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const srcId = `apt-edit-${aptEdit.icao}`
    if (!ctx.mapboxMap.getSource(srcId)) {
      ctx.mapboxMap.addSource(srcId, { type: 'geojson', data: emptyFC() })
      // 折线（青色）
      ctx.mapboxMap.addLayer({
        id: `${srcId}-line`, type: 'line', source: srcId,
        filter: ['==', ['get', 'kind'], 'line'],
        paint: { 'line-color': '#22d3ee', 'line-width': 2.5, 'line-opacity': 0.9 },
      })
      // 端点小绿点（可拖动延伸）；中间顶点小号绿点；弧线控制点黄色
      ctx.mapboxMap.addLayer({
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
      ctx.mapboxMap.addLayer({
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const srcId = `apt-edit-${aptEdit.icao}`
    // 已编辑过的线以 aptEdit.lines 为准（拖动中不被原始点覆盖）；
    // 仅对尚未编辑过的名称从机场源收集同名牌编号点生成初始折线。
    // 注意：用 source._data（完整数据）而非 querySourceFeatures（仅视口内瓦片缓存，
    // 视口外的同名点会丢失导致连线断开）
    const groups = {}
    try {
      const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
      const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    ctx.mapboxMap.getSource(srcId).setData({ type: 'FeatureCollection', features })
  }

  /** 沿折线按间隔均匀排列同名标签。
   *  调用前需先用 removeAllLabels(name) 清除该滑行道全部旧标签，
   *  然后从折线起点起按累计里程每 TAXI_LABEL_SPACING 米放一个
   *  同名 taxi-label 点（写入机场源，打 _addedInEdit 标记可随取消回滚）。 */
  const TAXI_LABEL_SPACING = 400   // 米

  function fillTaxiLabelsAlongLines() {
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
        try { ctx.mapboxMap.doubleClickZoom.disable() } catch { /* ignore */ }
        ctx.applyDevCursor()
        showBanner('单击绘制地面刻槽，双击结束', { duration: 2200 })
      },
      () => {
        // 取消移除全部刻槽
        aptEdit.activeGrooveRwy = null
        if (aptToolMode.value === 'add-groove') aptToolMode.value = null
        try { ctx.mapboxMap.doubleClickZoom.enable() } catch { /* ignore */ }
        ctx.applyDevCursor()
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    if (isRunwayName(name) || isGrooveName(name) || isCenterlineName(name) || isStopBarName(name) || isBlastPadName(name) || isTaxiwayName(name)) return   // 跑道/刻槽/中心线/停止线/防吹坪/滑行道矩形不做标签均分
    const line = aptEdit.lines[name]
    if (!line || line.length < 2) return
    const N = Math.max(1, Math.floor(Number(count) || 1))
    aptEdit.labelCount[name] = N   // 记住手动数量，后续拖动/加点/删点仍按 N 均分
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
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
    let bestD = -1, bestI = [0, 1]
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
    const canvas = ctx.mapboxMap.getCanvas()

    // 点击空白处关闭标签数量/跑道设置工具栏（排除端点刚点击产生的 click，300ms 内不关）
    ctx.mapboxMap.on('click', () => {
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
        if (ctx.mapboxMap.getLayer('apt-draw-line-layer')) ctx.mapboxMap.removeLayer('apt-draw-line-layer')
        if (ctx.mapboxMap.getSource('apt-draw-line')) ctx.mapboxMap.removeSource('apt-draw-line')
        if (ctx.mapboxMap.getLayer('apt-draw-points-layer')) ctx.mapboxMap.removeLayer('apt-draw-points-layer')
        if (ctx.mapboxMap.getSource('apt-draw-points')) ctx.mapboxMap.removeSource('apt-draw-points')
      } catch { /* ignore */ }
    }
    const updateAptDrawPreview = () => {
      if (!ctx.mapboxMap || !aptDrawPts.length) return
      const coords = aptDrawPts.length === 1 ? [aptDrawPts[0], aptDrawPts[0]] : aptDrawPts
      const ptFC = {
        type: 'FeatureCollection',
        features: aptDrawPts.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })),
      }
      if (!ctx.mapboxMap.getSource('apt-draw-line')) {
        ctx.mapboxMap.addSource('apt-draw-line', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } })
        ctx.mapboxMap.addLayer({ id: 'apt-draw-line-layer', type: 'line', source: 'apt-draw-line', paint: { 'line-color': '#22d3ee', 'line-width': 2, 'line-dasharray': [2, 2] } })
        ctx.mapboxMap.addSource('apt-draw-points', { type: 'geojson', data: ptFC })
        ctx.mapboxMap.addLayer({ id: 'apt-draw-points-layer', type: 'circle', source: 'apt-draw-points', paint: { 'circle-radius': 5, 'circle-color': '#22d3ee', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } })
      } else {
        ctx.mapboxMap.getSource('apt-draw-line')?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
        ctx.mapboxMap.getSource('apt-draw-points')?.setData(ptFC)
      }
    }
    const finishAptDraw = () => {
      const pts = aptDrawPts
      aptDrawPts = []
      clearTimeout(aptDrawTimer); aptDrawTimer = null
      _aptDrawLastClick = 0
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
    ctx.mapboxMap.on('click', (e) => {
      if (!aptEdit.active || !aptEdit.icao) return
      if (!APT_POLY_MODES.includes(aptToolMode.value)) return
      // 落在编辑层要素上不参与绘制
      const hit = ctx.mapboxMap.queryRenderedFeatures(e.point) || []
      if (hit.some(f => f.properties && ['handle', 'line', 'taxi-label', 'stand-label'].includes(f.properties.kind))) return
      aptDrawPts.push([e.lngLat.lng, e.lngLat.lat])
      updateAptDrawPreview()
    })
    ctx.mapboxMap.on('dblclick', (e) => {
      if (!aptEdit.active || !aptEdit.icao) return
      if (!APT_POLY_MODES.includes(aptToolMode.value)) return
      const hit = ctx.mapboxMap.queryRenderedFeatures(e.point) || []
      if (hit.some(f => f.properties && ['handle', 'line', 'taxi-label', 'stand-label'].includes(f.properties.kind))) return
      if (aptDrawPts.length) aptDrawPts.pop()
      finishAptDraw()
    })

    // 悬停端点/折线变手势
    ctx.mapboxMap.on('mouseenter', `${srcId}-handle`, () => { canvas.style.cursor = 'grab' })
    ctx.mapboxMap.on('mouseleave', `${srcId}-handle`, () => { canvas.style.cursor = '' })
    // 悬停弧线箭头变手势
    ctx.mapboxMap.on('mouseenter', `${srcId}-curve-arrow`, () => { canvas.style.cursor = 'grab' })
    ctx.mapboxMap.on('mouseleave', `${srcId}-curve-arrow`, () => { canvas.style.cursor = '' })

    // 拖动弧线控制箭头 → 移动该端点的弧线控制点（实时重算弧线轨迹）
    ctx.mapboxMap.on('mousedown', `${srcId}-curve-arrow`, (e) => {
      if (!aptEdit.active) return
      if (e.originalEvent && e.originalEvent.button !== 0) return   // 仅左键拖动（右键取消弧线）
      e.preventDefault()
      const feat = e.features && e.features[0]
      if (!feat) return
      const name = feat.properties.name
      const idx = Number(feat.properties.idx)
      if (!aptEdit.curves[name] || !aptEdit.curves[name][idx]) return
      try { ctx.mapboxMap.dragPan.disable() } catch { /* ignore */ }
      canvas.style.cursor = 'grabbing'
      const onMove = (ev) => {
        if (!aptEdit.curves[name]) return
        aptEdit.curves[name][idx] = [ev.lngLat.lng, ev.lngLat.lat]
        rebuildAptEditData()
      }
      const onUp = () => {
        try { ctx.mapboxMap.dragPan.enable() } catch { /* ignore */ }
        canvas.style.cursor = ''
        aptEditSave()
        rebuildAptEditData()
        ctx.mapboxMap.off('mousemove', onMove)
        ctx.mapboxMap.off('mouseup', onUp)
      }
      ctx.mapboxMap.on('mousemove', onMove)
      ctx.mapboxMap.on('mouseup', onUp)
    })

    // 端点按下 → 拖动即移动该端点（不新增）；单击（未拖动）→ 选中线段显示标签数量工具栏
    ctx.mapboxMap.on('mousedown', `${srcId}-handle`, (e) => {
      if (!aptEdit.active) return
      if (e.originalEvent && e.originalEvent.button !== 0) return   // 仅左键（右键走 contextmenu 删除端点）
      e.preventDefault()
      const feat = e.features && e.features[0]
      if (!feat) return
      const name = feat.properties.name
      const idx = Number(feat.properties.idx)
      const line = aptEdit.lines[name]
      if (!line || Number.isNaN(idx)) return
      try { ctx.mapboxMap.dragPan.disable() } catch { /* ignore */ }
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
        try { ctx.mapboxMap.dragPan.enable() } catch { /* ignore */ }
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
          ctx.mapboxMap.off('mousemove', onMove)
          ctx.mapboxMap.off('mouseup', onUp)
          return
        }
        // 拖动结束：按该线标签模式重排（跑道/刻槽/中心线/停止线/防吹坪/滑行道矩形不重排）
        if (dragName && !isRunwayName(dragName) && !isGrooveName(dragName) && !isCenterlineName(dragName) && !isStopBarName(dragName) && !isBlastPadName(dragName) && !isTaxiwayName(dragName)) reflowTaxiLabels(dragName)
        // 停止线锚点：拖动结束后用新锚点重建竖条（按跑道 corners 重算方向向量）
        if (dragName && isStopBarName(dragName)) {
          const rwyN = String(dragName).replace(/·sb$/, '')
          const rwFeat = (ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)?._data?.features || []).find(f => f.properties.kind === 'runway' && f.properties.ids === rwyN)
          const ring = rwFeat?.geometry?.coordinates?.[0]
          if (ring && ring.length >= 4) syncRunwayExtras(rwyN, [ring[0], ring[1], ring[2], ring[3]])
        }
        // 防吹坪外端角点：拖动结束后用新角点重建材质矩形（按跑道 corners 重算）
        if (dragName && isBlastPadName(dragName)) {
          const rwyN = String(dragName).replace(/·bp$/, '')
          const rwFeat = (ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)?._data?.features || []).find(f => f.properties.kind === 'runway' && f.properties.ids === rwyN)
          const ring = rwFeat?.geometry?.coordinates?.[0]
          if (ring && ring.length >= 4) syncRunwayExtras(rwyN, [ring[0], ring[1], ring[2], ring[3]])
        }
        rebuildAptEditData()
        aptEditSave()
        ctx.mapboxMap.off('mousemove', onMove)
        ctx.mapboxMap.off('mouseup', onUp)
      }
      ctx.mapboxMap.on('mousemove', onMove)
      ctx.mapboxMap.on('mouseup', onUp)
    })

    // 单击滑行道标签/停机位标签 → 编辑编号
    bindLabelClickEdit()

    // 右键黄点（弧线控制箭头）→ 取消该端点弧线，恢复绿色直线
    ctx.mapboxMap.on('contextmenu', `${srcId}-curve-arrow`, (e) => {
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
    ctx.mapboxMap.on('contextmenu', `${srcId}-handle`, (e) => {
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
    ctx.mapboxMap.on('dblclick', `${srcId}-line`, (e) => { if (aptEdit.active) e.preventDefault() })

    // 双击手动滑行道矩形面 → 在点击位置投影到最近中心线段插入端点（即"双击矩形线段加点"）
    const taxiFillLayer = `apt-${aptEdit.icao}-taxiway-fill`
    if (ctx.mapboxMap.getLayer(taxiFillLayer)) {
      ctx.mapboxMap.on('dblclick', taxiFillLayer, (e) => {
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
    ctx.mapboxMap.on('mousedown', `${srcId}-line`, (e) => {
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
        ctx.mapboxMap.off('mousemove', onMove)
        ctx.mapboxMap.off('mouseup', onUp)
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
      ctx.mapboxMap.on('mousemove', onMove)
      ctx.mapboxMap.on('mouseup', onUp)
    })

    // 双击端点 → 重命名该滑行道
    ctx.mapboxMap.on('dblclick', `${srcId}-handle`, (e) => {
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
            const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
            const rf = aptSrc?._data?.features.find(x => x.properties.kind === 'runway' && x.properties.ids === oldName)
            if (rf) { rf.properties.ids = newName; aptSrc.setData(aptSrc._data) }
          }
          // 滑行道：同步 taxiway feature 的 name
          if (isTaxiwayName(oldName)) {
            const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    ctx.mapboxMap.on('dblclick', (e) => {
      if (!aptEdit.active || !aptEdit.icao) return
      // 折线绘制模式：双击用于结束绘制，不新增标牌
      if (APT_POLY_MODES.includes(aptToolMode.value)) return
      // 落在编辑层要素上的双击已由上方处理器处理（defaultPrevented）
      if (e.defaultPrevented) return
      // 仅双击纯空白处才新增标牌：命中机场任何地面/标注要素则跳过
      const hit = ctx.mapboxMap.queryRenderedFeatures(e.point) || []
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
    ctx.mapboxMap.on('click', (e) => {
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
      const d1x = cur[0] - px, d1y = cur[1] - py
      const d2x = nx - cur[0], d2y = ny - cur[1]
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
    if (!ctx.mapboxMap || !aptEdit.icao || !name) return false
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
    const feats = aptSrc?._data?.features || []
    return feats.some(f => f.properties.kind === 'runway' && f.properties.ids === name)
  }

  /** 判断名称是否对应机场源中的地面刻槽（kind:'groove'，name===name） */
  function isGrooveName(name) {
    if (!ctx.mapboxMap || !aptEdit.icao || !name) return false
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
    const feats = aptSrc?._data?.features || []
    return feats.some(f => f.properties.kind === 'groove' && f.properties.name === name)
  }

  /** 判断名称是否对应机场源中的跑道中心线（kind:'centerline'，name===name） */
  function isCenterlineName(name) {
    if (!ctx.mapboxMap || !aptEdit.icao || !name) return false
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
    const feats = aptSrc?._data?.features || []
    return feats.some(f => f.properties.kind === 'centerline' && f.properties.name === name)
  }

  /** 判断名称是否对应停止线锚点（kind:'stop-bar'，name===name） */
  function isStopBarName(name) {
    if (!ctx.mapboxMap || !aptEdit.icao || !name) return false
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
    const feats = aptSrc?._data?.features || []
    return feats.some(f => f.properties.kind === 'stop-bar' && f.properties.name === name)
  }

  /** 判断名称是否对应防吹坪外端锚点（kind:'blast-pad-area'，name===name） */
  function isBlastPadName(name) {
    if (!ctx.mapboxMap || !aptEdit.icao || !name) return false
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
    const feats = aptSrc?._data?.features || []
    return feats.some(f => f.properties.kind === 'blast-pad-area' && f.properties.name === name)
  }

  /** 判断名称是否对应手动绘制的滑行道（kind:'taxiway' && _addedInEdit，name===name） */
  function isTaxiwayName(name) {
    if (!ctx.mapboxMap || !aptEdit.icao || !name) return false
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
    const feats = aptSrc?._data?.features || []
    return feats.some(f => f.properties.kind === 'taxiway' && f.properties._addedInEdit && f.properties.name === name)
  }

  /** 保存时同步：把已编辑跑道的四角铺成机场源里的跑道矩形，并重算跑道号/中心线/防吹坪 */
  function syncRunwayPolygons() {
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    const dxEastM = (e1[0] - e0[0]) / mLon, dyNorthM = (e1[1] - e0[1]) / mLat
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
        ctx.ground.ensureRunwayNoIcons(nums)   // 注册跑道号自定义字体图标（HOOG0554）
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
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const rwy = aptEdit.activeGrooveRwy
    if (!rwy) { showBanner('请先勾选某跑道的"地面刻槽"', { duration: 1800 }); return }
    if (!pts || pts.length < 2) return
    const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const icao = aptEdit.icao
    const taxiLayer = `apt-${icao}-taxiway-label`
    const standLayer = `apt-${icao}-stand-label`
    const canvas = ctx.mapboxMap.getCanvas()

    // —— 滑行道标签 ——
    if (ctx.mapboxMap.getLayer(taxiLayer)) {
      let editTimer = null   // 单击编辑延迟触发：双击(生成端点)时清除，避免冲突
      // 按下：拖动检测 + 未拖动视为单击编辑
      ctx.mapboxMap.on('mousedown', taxiLayer, (e) => {
        if (!aptEdit.active) return
        if (e.originalEvent && e.originalEvent.button !== 0) return   // 仅左键（右键不改编号）
        e.preventDefault()
        const feat = e.features && e.features[0]
        if (!feat) return
        const oldName = feat.properties.name
        if (!oldName) return
        try { ctx.mapboxMap.dragPan.disable() } catch { /* ignore */ }
        // 直接定位机场源中被拖的标签 feature 引用（按 name+坐标精确找，兜底取最近同名），
        // 拖动时直接改其坐标，最可靠（不依赖后续坐标匹配）
        const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
          try { ctx.mapboxMap.dragPan.enable() } catch { /* ignore */ }
          ctx.mapboxMap.off('mousemove', onMove)
          ctx.mapboxMap.off('mouseup', onUp)
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
        ctx.mapboxMap.on('mousemove', onMove)
        ctx.mapboxMap.on('mouseup', onUp)
      })

      // 双击滑行道标签：单点滑行道 → 生成两个端点变线段（原标签保留在中心）
      ctx.mapboxMap.on('dblclick', taxiLayer, (e) => {
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
          const aptSrc = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
      ctx.mapboxMap.on('contextmenu', taxiLayer, (e) => {
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
    if (ctx.mapboxMap.getLayer(standLayer)) {
      ctx.mapboxMap.on('click', standLayer, (e) => {
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
    if (ctx.mapboxMap.getLayer(runwayNoLayer)) {
      ctx.mapboxMap.on('mousedown', runwayNoLayer, (e) => {
        if (!aptEdit.active) return
        if (e.originalEvent && e.originalEvent.button !== 0) return
        e.preventDefault()
        const feat = e.features && e.features[0]
        if (!feat) return
        const src = ctx.mapboxMap.getSource(`apt-${icao}`)
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
        try { ctx.mapboxMap.dragPan.disable() } catch { /* ignore */ }
        canvas.style.cursor = 'grabbing'
        const onMove = (ev) => {
          target.geometry.coordinates = [ev.lngLat.lng, ev.lngLat.lat]
          target.properties._fixed = true
          src.setData(src._data)
        }
        const onUp = () => {
          try { ctx.mapboxMap.dragPan.enable() } catch { /* ignore */ }
          canvas.style.cursor = ''
          src.setData(src._data)
          aptEditSave()
          ctx.mapboxMap.off('mousemove', onMove)
          ctx.mapboxMap.off('mouseup', onUp)
        }
        ctx.mapboxMap.on('mousemove', onMove)
        ctx.mapboxMap.on('mouseup', onUp)
      })
    }

    // —— 停止线：直接拖动整组停止线（无锚点；判定区域为停止线竖线，按 end 整组平移）——
    const stopBarLayer = `apt-${icao}-stop-bar`
    if (ctx.mapboxMap.getLayer(stopBarLayer)) {
      ctx.mapboxMap.on('mousedown', stopBarLayer, (e) => {
        if (!aptEdit.active) return
        if (e.originalEvent && e.originalEvent.button !== 0) return
        e.preventDefault()
        const feat = e.features && e.features[0]
        if (!feat) return
        const rwy = feat.properties.rwy
        const end = Number(feat.properties.end)
        if (!rwy || Number.isNaN(end)) return
        const src = ctx.mapboxMap.getSource(`apt-${icao}`)
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
        try { ctx.mapboxMap.dragPan.disable() } catch { /* ignore */ }
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
          try { ctx.mapboxMap.dragPan.enable() } catch { /* ignore */ }
          canvas.style.cursor = ''
          src.setData(src._data)
          aptEditSave()
          ctx.mapboxMap.off('mousemove', onMove)
          ctx.mapboxMap.off('mouseup', onUp)
        }
        ctx.mapboxMap.on('mousemove', onMove)
        ctx.mapboxMap.on('mouseup', onUp)
      })
    }
  }

  /** 机场源中按名称批量改标签名 */
  function renameAptLabelByName(icao, oldName, newName, kinds) {
    const src = ctx.mapboxMap.getSource(`apt-${icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const src = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const src = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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

  function removeInlineEdit() {
    if (aptInlineEditEl) {
      aptInlineEditEl.remove()
      aptInlineEditEl = null
    }
  }

  /** 重命名机场源中同名的 taxi-label 点属性 */
  function renameTaxiLabels(oldName, newName) {
    if (!ctx.mapboxMap || !aptEdit.icao) return
    const src = ctx.mapboxMap.getSource(`apt-${aptEdit.icao}`)
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
    if (!ctx.mapboxMap) return
    const srcId = `apt-edit-${aptEdit.icao || ''}`
    for (const l of ['-line', '-handle', '-curve-arrow']) {
      try { if (ctx.mapboxMap.getLayer(srcId + l)) ctx.mapboxMap.removeLayer(srcId + l) } catch { /* ignore */ }
    }
    try { if (ctx.mapboxMap.getSource(srcId)) ctx.mapboxMap.removeSource(srcId) } catch { /* ignore */ }
  }

  /** 当前是否处于机场编辑模式（供地图引擎判断是否暂停 3D 自转） */
  function isAptEditActive() { return aptEdit.active }

  /** 暴露编辑状态对象（机场地面图层重绘跑道号图标时读取当前 ICAO） */
  function getAptEdit() { return aptEdit }

  /** 绑定编辑快捷键（页面 onMounted 调用） */
  function bindShortcuts() { window.addEventListener('keydown', onAptEditKeydown) }

  /** 解绑编辑快捷键（页面 onUnmounted 调用） */
  function unbindShortcuts() { window.removeEventListener('keydown', onAptEditKeydown) }

  /** 组件卸载时清理编辑态产生的 DOM / timer / 编辑图层，避免残留 */
  function dispose() {
    clearAptDrawState()
    removeRunwayToolbar()
    removeLabelCountToolbar()
    removeInlineEdit()
    clearAptEditOverlays()
    aptToolMode.value = null
    aptToolbarVisible.value = false
  }

  return {
    aptToolbarVisible,
    aptToolbarPos,
    aptToolMode,
    toggleAptToolMode,
    setAirportEditMode,
    isAptEditActive,
    getAptEdit,
    bindShortcuts,
    unbindShortcuts,
    aptEditSubmit,
    aptEditCancel,
    dispose,
  }
}
