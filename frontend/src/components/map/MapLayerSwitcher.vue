<template>
  <div class="map-switcher" @mouseleave="scheduleCollapse">
    <button
      class="sw-btn sw-main"
      @mouseenter="showPanel"
      @click="showPanel"
    >{{ mainBtnLabel }} <span class="sw-caret">▾</span></button>
    <Transition name="panel">
      <div v-if="panelOpen" class="sw-panel" @mouseenter="cancelCollapse">
        <div class="sw-group" :class="{ disabled: !mapboxAvailable }" :title="mapboxAvailable ? '' : '3D 服务未配置'">
          <span class="sw-group-title">3D</span>
          <button
            v-for="m in layers3d" :key="m.id"
            class="sw-btn sw-item"
            :class="{ active: activeLayer === m.id }"
            :disabled="!mapboxAvailable"
            :title="mapboxAvailable ? '' : '3D 服务未配置'"
            @click="selectLayer(m.id)"
          >{{ m.label }}</button>
        </div>
        <div class="sw-group">
          <span class="sw-group-title">2D</span>
          <button
            v-for="m in flatLayers" :key="m.id"
            class="sw-btn sw-item"
            :class="{ active: activeLayer === m.id }"
            :disabled="isLayerDisabled(m.id)"
            :title="layerDisabledTitle(m.id)"
            @click="selectLayer(m.id)"
          >{{ m.label }}</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
/**
 * MapLayerSwitcher —— 左上角地图源切换器（3D Mapbox / 2D 平面源）
 *
 * props:
 *  - layers3d / flatLayers  两组地图源（{ id, label }）
 *  - activeLayer            当前地图源 id（变化时自动收起下拉面板，等价原 switchEngine 内 panelOpen=false）
 *  - mapboxAvailable        3D/Mapbox 令牌是否可用；false 时 3D 分组与「Mapbox 卫星」置灰禁用并给 title 提示
 * emits:
 *  - select-layer(id)       选择地图源（父组件写 activeLayer，由引擎 watch 完成切换）
 * 副作用：hover 延时收起定时器 panelTimer，组件卸载时清理。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { is3D } from '@/components/map/mapCore'
import { isMapboxDependentLayer } from '@/utils/mapboxHealth'

const props = defineProps({
  layers3d: { type: Array, required: true },
  flatLayers: { type: Array, required: true },
  activeLayer: { type: String, required: true },
  mapboxAvailable: { type: Boolean, default: true },
})
const emit = defineEmits(['select-layer'])

const panelOpen = ref(false)
let panelTimer = null

const mainBtnLabel = computed(() => {
  const all = [...props.layers3d, ...props.flatLayers]
  const cur = all.find(m => m.id === props.activeLayer)
  return cur ? cur.label : '地图'
})

// 引擎真正切换时收起面板（与原 switchEngine 中 panelOpen.value = false 行为一致）
watch(() => props.activeLayer, () => { panelOpen.value = false })

/**
 * 该地图源是否因 Mapbox 令牌不可用而被禁用：
 *  - 3D 两个（mapbox3d / mapbox3d_sat）整体禁用（由 mapboxAvailable 控制）
 *  - 2D「Mapbox 卫星」共用同一令牌，同样禁用
 * @param {string} id
 * @returns {boolean}
 */
function isLayerDisabled(id) {
  if (isMapboxDependentLayer(id)) return !props.mapboxAvailable
  return false
}

/** 禁用项 title 提示（可用时为空字符串，不改变原交互）；3D 分组统一提示「3D 服务未配置」 */
function layerDisabledTitle(id) {
  if (!isLayerDisabled(id)) return ''
  return is3D(id) ? '3D 服务未配置' : 'Mapbox 卫星未配置'
}

function showPanel() { cancelCollapse(); panelOpen.value = true }
function scheduleCollapse() {
  if (panelTimer) clearTimeout(panelTimer)
  panelTimer = setTimeout(() => { panelOpen.value = false }, 800)
}
function cancelCollapse() {
  if (panelTimer) { clearTimeout(panelTimer); panelTimer = null }
}
function selectLayer(id) {
  // 兜底：已禁用（Mapbox 不可用）的地图源不向上派发切换，避免 initMapbox3D 再次触发
  if (isLayerDisabled(id)) return
  emit('select-layer', id)
}

onUnmounted(() => { if (panelTimer) { clearTimeout(panelTimer); panelTimer = null } })
</script>

<style scoped>
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
/* Mapbox 令牌不可用（未配置 / 本次会话判定失效）：
   3D 分组整体置灰、3D 与「Mapbox 卫星」按钮禁用；保留原分组布局与 hover/切换动画 */
.sw-group.disabled { opacity: .55; }
.sw-btn.sw-item:disabled {
  cursor: not-allowed;
  color: #999;
}
.sw-btn.sw-item:disabled:hover { background: transparent; }
.sw-btn.sw-item.active:disabled { background: var(--c-primary); color: #fff; opacity: .7; }
/* 下拉展开/缩回动画 */
.panel-enter-active, .panel-leave-active {
  transition: opacity .25s ease, transform .25s ease;
}
.panel-enter-from, .panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
