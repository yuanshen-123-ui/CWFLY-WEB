/**
 * useOnlineMapData —— 在线地图机组 / 管制边界数据加载与轮询
 *
 * 职责：
 *  - 首次加载（显示 loading 遮罩）与静默轮询刷新（每 REFRESH_INTERVAL 毫秒）；
 *  - 调用 flightplanApi.fsdOnline / fsdBoundaries，写入外部传入的响应式引用；
 *  - 成功后置 connected = true（状态条显示"实时"）；失败静默，等待下次轮询；
 *  - 数据变化后通过 onUpdate 回调通知渲染层（2D/3D 双引擎重绘由编排层负责）。
 *
 * 入参：
 *  - pilots / boundaries  数据 ref（由页面创建，与渲染层共享）
 *  - loading              首次加载遮罩 ref
 *  - connected            实时/轮询状态 ref
 *  - onUpdate()           数据写入后的重绘回调
 *
 * 返回：loadPilots(silent) / startPolling() / stopPolling()
 * 副作用与清理：startPolling() 注册 setInterval，必须在页面 onUnmounted 调用 stopPolling()；
 *              本模块不注册任何 DOM/地图监听。
 */
import { flightplanApi } from '@/api'
import { REFRESH_INTERVAL } from '@/components/map/mapCore'

export function useOnlineMapData({ pilots, boundaries, loading, connected, onUpdate }) {
  let timer = null

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
      onUpdate()
      // 轮询刷新成功即视为"实时"(数据来自后端快照表)
      connected.value = true
    } catch { /* 静默失败，下次刷新重试 */ }
    loading.value = false
  }

  /** 启动静默轮询（页面 onMounted 调用；重复调用会先清理旧定时器） */
  function startPolling() {
    stopPolling()
    // 在线数据来自后端快照表(FlightPilot/FlightController), 前端轮询获取(静默, 不弹加载中)
    timer = setInterval(() => loadPilots(true), REFRESH_INTERVAL)
  }

  /** 停止轮询并清理定时器（页面 onUnmounted 调用） */
  function stopPolling() {
    if (timer) { clearInterval(timer); timer = null }
  }

  return { loadPilots, startPolling, stopPolling }
}
