<template>
  <div class="map-full">
    <MapLayerSwitcher
      :layers3d="layers3D"
      :flat-layers="flatLayers"
      :active-layer="activeLayer"
      :mapbox-available="mapboxAvailable"
      @select-layer="selectLayer"
    />
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
    <AirportEditToolbar
      v-if="aptToolbarVisible"
      :apt-tool-mode="aptToolMode"
      :pos="aptToolbarPos"
      @update:pos="updateAptToolbarPos"
      @toggle-tool="toggleAptToolMode"
      @submit="aptEditSubmit"
      @cancel="aptEditCancel"
    />
    <MapStatusBar :connected="connected" :last-update="lastUpdate" />
  </div>
</template>

<script setup>
/**
 * OnlineMap —— 在线地图页（编排层）
 *
 * 本文件只保留页面编排与视图骨架，具体实现按职责拆分：
 *  - src/composables/useOnlineMapInteraction.js  地图引擎/覆盖物/主题/开发者工具光标
 *  - src/composables/useOnlineMapData.js         机组与边界数据加载 + 5s 轮询
 *  - src/composables/useAirportGroundLayers.js   机场地面数据图层（3D/2D）
 *  - src/composables/useAirportEditor.js         机场编辑模式（开发者工具 airport-edit）
 *  - src/components/map/MapLayerSwitcher.vue     地图源切换器
 *  - src/components/map/MapStatusBar.vue         数据状态条
 *  - src/components/map/AirportEditToolbar.vue   机场编辑悬浮工具栏
 *  - src/components/map/mapCore.js               常量 / 坐标转换 / 图层定义
 *
 * 生命周期：onMounted 启动引擎 + 首次取数 + 轮询 + 编辑快捷键；
 *           onUnmounted 先解绑快捷键/停轮询，再由 interaction.stop() 统一销毁引擎与清理。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import MapLayerSwitcher from '@/components/map/MapLayerSwitcher.vue'
import MapStatusBar from '@/components/map/MapStatusBar.vue'
import AirportEditToolbar from '@/components/map/AirportEditToolbar.vue'
import { layers3D, flatLayers } from '@/components/map/mapCore'
import { useOnlineMapData } from '@/composables/useOnlineMapData'
import { useOnlineMapInteraction } from '@/composables/useOnlineMapInteraction'

// ===== 页面级响应式状态（与数据层/引擎层共享同一份引用）=====
const mapContainer = ref(null)
// 默认 3D 地球
const activeLayer = ref('mapbox3d')
const pilots = ref([])
const boundaries = ref([])
const loading = ref(true)
const mapError = ref('')
const connected = ref(false)
const lastUpdate = ref('')
const cursorPos = ref(null)

// 地图引擎与覆盖物编排（引擎就绪后通过回调触发一次机组数据加载，避免循环依赖）
let data = null
const interaction = useOnlineMapInteraction({
  mapContainer,
  activeLayer,
  loading,
  mapError,
  pilots,
  boundaries,
  cursorPos,
  onRequestPilots: () => data.loadPilots(),
})
data = useOnlineMapData({
  pilots,
  boundaries,
  loading,
  connected,
  onUpdate: interaction.onDataUpdate,
})

// 机场编辑器（工具栏 UI 状态 + 提交/取消 + 快捷键）
const {
  aptToolbarVisible,
  aptToolbarPos,
  aptToolMode,
  toggleAptToolMode,
  aptEditSubmit,
  aptEditCancel,
  bindShortcuts,
  unbindShortcuts,
} = interaction.editor
const { isDevToolActive, mapboxAvailable } = interaction

/** 切换地图源：只更新 activeLayer，真实引擎切换由 interaction 内 watch(activeLayer) 完成 */
function selectLayer(id) { activeLayer.value = id }

/** 工具栏拖动回报位置：写回编辑器持有的 pos（组件卸载重开位置保持，与原行为一致） */
function updateAptToolbarPos(p) { aptToolbarPos.value = p }

onMounted(() => {
  interaction.start()
  // 初始加载(显示 loading)
  data.loadPilots()
  // 数据轮询（静默，不弹加载中）
  data.startPolling()
  // 机场编辑撤销/重做快捷键（Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z，仅编辑模式生效）
  bindShortcuts()
})

onUnmounted(() => {
  unbindShortcuts()
  data.stopPolling()
  interaction.stop()
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
