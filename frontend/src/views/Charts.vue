<template>
  <div class="admin-page fade-in">
    <div class="page-header"><h1>航情查询</h1><p>查询机场气象、航图及航线信息</p></div>

    <!-- 气象查询 -->
    <div class="card p-lg mb-lg" :class="{ 'card-collapsed': collapsed.weather }" @mouseenter="expand('weather')" @mouseleave="scheduleCollapse('weather')">
      <h3 class="mb-md">气象查询</h3>
      <div class="card-collapse" :class="{ collapsed: collapsed.weather }">
        <div class="card-collapse-inner">
      <div class="flex gap-sm items-end flex-wrap">
        <div style="flex:1;min-width:160px;">
          <label class="text-sm font-bold mb-sm" style="display:block;">ICAO</label>
          <input v-model="weatherIcao" class="input" placeholder="如 ZBAA, ZSSS" maxlength="4" style="text-transform:uppercase;" @keyup.enter="onEnterWeather" />
        </div>
        <button class="btn btn-primary btn-sm" style="height:38px;align-self:flex-end;" @click="searchWeather" :disabled="weatherLoading">{{ weatherLoading ? '查询中...' : '查询' }}</button>
      </div>
      <div v-if="weatherResult" class="mt-md">
        <h4 class="mb-sm">{{ weatherResult.station }} ({{ weatherResult.icao }})</h4>
        <div class="weather-grid">
          <div class="weather-item"><span class="text-muted">METAR</span><p class="font-bold">{{ weatherResult.metar || '—' }}</p></div>
          <div class="weather-item"><span class="text-muted">TAF</span><p class="font-bold" style="white-space:pre-wrap;">{{ weatherResult.taf || '无' }}</p></div>
          <div v-if="weatherResult.tafParsed" class="weather-item taf-summary"><span class="text-muted">TAF 翻译</span><p>{{ weatherResult.tafParsed.summary || '—' }}</p></div>
          <div class="weather-item"><span class="text-muted">温度</span><p>{{ weatherResult.temp }}°C</p></div>
          <div class="weather-item"><span class="text-muted">露点</span><p>{{ weatherResult.dew }}°C</p></div>
          <div class="weather-item"><span class="text-muted">风向风速</span><p>{{ weatherResult.wind }}</p></div>
          <div class="weather-item"><span class="text-muted">能见度</span><p>{{ weatherResult.vis }}{{ weatherResult.visUnit ? ' ' + weatherResult.visUnit : '' }}</p></div>
          <div class="weather-item"><span class="text-muted">气压</span><p>{{ weatherResult.qnh }}{{ weatherResult.qnhUnit ? ' ' + weatherResult.qnhUnit : '' }}</p></div>
          <div class="weather-item"><span class="text-muted">更新时间</span><p class="text-sm">{{ weatherResult.time }}</p></div>
        </div>
        <div v-if="weatherResult.hint" class="text-sm text-muted mt-sm" style="line-height:1.7;">
          ⓘ {{ weatherResult.hint }}
        </div>
      </div>
      <div v-if="weatherErr" class="mt-md text-center" style="color:var(--c-danger);">{{ weatherErr }}</div>
        </div>
      </div>
    </div>

    <!-- 航路查询 -->
    <div class="card p-lg mb-lg" :class="{ 'card-collapsed': collapsed.route }" @mouseenter="expand('route')" @mouseleave="scheduleCollapse('route')">
      <h3 class="mb-md">航路查询</h3>
      <div class="card-collapse" :class="{ collapsed: collapsed.route }">
        <div class="card-collapse-inner">
      <div class="flex gap-sm items-center flex-wrap">
        <div style="flex:1;min-width:140px;"><label class="text-sm font-bold mb-sm" style="display:block;">起飞机场</label><input v-model="routeDep" class="input" placeholder="如 ZSSS" maxlength="4" style="text-transform:uppercase;" @keyup.enter="onEnterRoute" /></div>
        <div style="flex:1;min-width:140px;"><label class="text-sm font-bold mb-sm" style="display:block;">到达机场</label><input v-model="routeArr" class="input" placeholder="如 ZGHA" maxlength="4" style="text-transform:uppercase;" @keyup.enter="onEnterRoute" /></div>
        <button class="btn btn-primary btn-sm" style="height:38px;align-self:flex-end;" @click="searchRoute" :disabled="routeLoading">{{ routeLoading ? '查询中...' : '查询航路' }}</button>
      </div>
      <div v-if="routeResult" class="mt-md">
        <div class="card p-md" style="background:var(--c-bg);">
          <h4 class="mb-sm">航路信息</h4>
          <div class="route-grid">
            <div><span class="text-muted">起飞机场</span><p class="font-bold">{{ routeResult.dep || routeResult.dep_icao || '-' }}</p></div>
            <div><span class="text-muted">到达机场</span><p class="font-bold">{{ routeResult.arr || routeResult.arr_icao || '-' }}</p></div>
            <div><span class="text-muted">航路</span><p class="font-bold" style="word-break:break-all;">{{ routeResult.route || routeResult.full_route || routeResult.raw || '-' }}</p></div>
            <div><span class="text-muted">距离</span><p>{{ routeResult.distance && routeResult.distance !== '-' ? routeResult.distance + 'nm' : '-' }}</p></div>
            <div><span class="text-muted">预计飞行时间</span><p>{{ routeResult.flight_time || routeResult.ete || '-' }}</p></div>
            <div><span class="text-muted">备降场</span><p>{{ routeResult.alternate || routeResult.alt_icao || '-' }}</p></div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>

    <!-- 航图查询 -->
    <div class="card p-lg" :class="{ 'card-collapsed': collapsed.chart }" @mouseenter="expand('chart')" @mouseleave="scheduleCollapse('chart')">
      <h3 class="mb-md">航图查询</h3>
      <div class="card-collapse" :class="{ collapsed: collapsed.chart }">
        <div class="card-collapse-inner">
      <div class="flex gap-sm items-center flex-wrap" style="align-items:flex-end;">
        <div style="flex:1;min-width:160px;"><label class="text-sm font-bold mb-sm" style="display:block;">ICAO</label><input v-model="chartIcao" class="input" placeholder="如 ZGGG" maxlength="4" style="text-transform:uppercase;" @keyup.enter="onEnterSearch" /></div>
        <div style="width:140px;"><label class="text-sm font-bold mb-sm" style="display:block;">提供商</label><select v-model="chartProvider" class="input"><option value="eaip">EAIP</option><option value="jeppesen">Jeppesen</option></select></div>
        <button class="btn btn-primary btn-sm" style="height:38px;align-self:flex-end;" @click="searchChart" :disabled="chartLoading">{{ chartLoading ? '查询中...' : '查询航图' }}</button>
      </div>

      <!-- 分类标签 -->
      <div v-if="chartItems.length" class="chart-tabs mt-md">
        <button v-for="cat in chartCategories" :key="cat.key" class="chart-tab" :class="{ active: activeCategory === cat.key }" @click="activeCategory = cat.key">{{ cat.label }} <span style="font-size:11px;opacity:0.6;">({{ categoryCount(cat.key) }})</span></button>
      </div>

      <div v-if="chartResult" class="mt-md">
        <p v-if="chartResult && chartResult.message" class="text-sm text-muted mb-sm">{{ chartResult.message }}</p>
        <div v-if="chartItems.length" class="chart-layout">
          <!-- 左侧列表 -->
          <div class="chart-list">
            <div class="chart-list-scroll">
              <div v-for="(c, i) in filteredCharts" :key="c.id || c.index_number || c.name || i" class="chart-list-item" :class="{ active: activeChart === c }" @click="activeChart = c">
                <span class="chart-list-no">{{ c.index_number || c.name || c.id || ('航图 ' + (i + 1)) }}</span>
              </div>
              <div v-if="!filteredCharts.length" class="text-sm text-muted" style="padding:12px 8px;">该分类暂无航图</div>
            </div>
          </div>
          <!-- 右侧大图 -->
          <div class="chart-detail">
            <template v-if="activeChart">
              <div v-if="activeChart.pdf" class="pdf-stage" :class="{ 'pdf-stage-dark': isDark }" style="position:relative;overflow:hidden;border:1px solid var(--c-border-light);border-radius:6px;cursor:grab;display:flex;align-items:flex-start;justify-content:center;" @wheel.prevent="onZoom" @mousedown="onPanStart" @mousemove="onPanMove" @mouseup="onPanEnd" @mouseleave="onPanEnd">
                <div :style="zoomStyle" :class="{ 'pdf-dark-invert': isDark }" class="pdf-wrap" style="padding:12px;">
                  <canvas v-for="(_, i) in pdfCanvases" :key="i" :ref="el => setPdfCanvasRef(i, el)" style="display:block;box-shadow:0 2px 12px rgba(0,0,0,0.15);"></canvas>
                  <p v-if="pdfLoading" class="text-sm text-muted" style="padding:40px 0;text-align:center;">航图加载中...</p>
                </div>
                <div v-if="pdfDoc" style="position:absolute;top:10px;right:10px;display:flex;gap:2px;align-items:center;background:rgba(0,0,0,0.55);padding:4px 10px;border-radius:16px;color:#fff;font-size:12px;">
                  <button title="放大" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;width:24px;height:24px;" @click.stop="zoomIn">＋</button>
                  <span style="min-width:44px;text-align:center;">{{ Math.round(zoomLevel * 100) }}%</span>
                  <button title="缩小" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;width:24px;height:24px;" @click.stop="zoomOut">−</button>
                  <span style="color:rgba(255,255,255,0.4);margin:0 4px;">|</span>
                  <button title="旋转" style="background:none;border:none;color:#fff;cursor:pointer;font-size:14px;width:24px;height:24px;" @click.stop="rotateImg">⟳</button>
                  <span style="color:rgba(255,255,255,0.4);margin:0 4px;">|</span>
                  <button title="重置" style="background:none;border:none;color:#fff;cursor:pointer;font-size:12px;height:24px;padding:0 6px;" @click.stop="resetPdfView">适应</button>
                </div>
              </div>
              <div v-else-if="!failedImages.has(chartKey(activeChart))" class="img-stage" :class="{ 'img-stage-dark': isDark }" style="position:relative;overflow:hidden;border:1px solid var(--c-border-light);border-radius:6px;cursor:grab;display:flex;align-items:center;justify-content:center;" @wheel.prevent="onZoom" @mousedown="onPanStart" @mousemove="onPanMove" @mouseup="onPanEnd" @mouseleave="onPanEnd">
                <div :style="zoomStyle" :class="{ 'pdf-dark-invert': isDark }" class="pdf-wrap" style="padding:12px;">
                  <img :src="chartImageUrl(activeChart)" :alt="activeChart.name || activeChart.id" style="display:block;max-width:100%;max-height:60vh;object-fit:contain;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,0.15);user-select:none;-webkit-user-drag:none;" draggable="false" @error="onImgErr(activeChart)" />
                </div>
                <div style="position:absolute;top:10px;right:10px;display:flex;gap:2px;align-items:center;background:rgba(0,0,0,0.55);padding:4px 10px;border-radius:16px;color:#fff;font-size:12px;">
                  <button title="放大" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;width:24px;height:24px;" @click.stop="zoomIn">＋</button>
                  <span style="min-width:44px;text-align:center;">{{ Math.round(zoomLevel * 100) }}%</span>
                  <button title="缩小" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;width:24px;height:24px;" @click.stop="zoomOut">−</button>
                  <span style="color:rgba(255,255,255,0.4);margin:0 4px;">|</span>
                  <button title="旋转" style="background:none;border:none;color:#fff;cursor:pointer;font-size:14px;width:24px;height:24px;" @click.stop="rotateImg">⟳</button>
                  <span style="color:rgba(255,255,255,0.4);margin:0 4px;">|</span>
                  <button title="重置" style="background:none;border:none;color:#fff;cursor:pointer;font-size:12px;height:24px;padding:0 6px;" @click.stop="resetPdfView">适应</button>
                </div>
              </div>
              <div v-else class="text-sm text-muted" style="padding:48px 0;">
                航图图片加载失败
                <div class="flex gap-sm justify-center mt-sm" style="flex-wrap:wrap;">
                  <a v-if="activeChart.url" :href="activeChart.url" target="_blank" rel="noopener" class="btn btn-outline btn-sm">在新窗口打开</a>
                  <a v-if="activeChart.image_day_url" :href="activeChart.image_day_url" target="_blank" rel="noopener" class="btn btn-outline btn-sm">通过代理打开</a>
                </div>
              </div>
            </template>
            <div v-else class="text-sm text-muted" style="padding:48px 0;text-align:center;">请在左侧选择航图</div>
          </div>
        </div>
        <pre v-else class="text-sm text-muted" style="white-space:pre-wrap;text-align:left;">{{ JSON.stringify(chartResult.data || chartResult, null, 2) }}</pre>
        <p v-if="chartResult.message && !chartItems.length" class="text-sm text-muted">{{ chartResult.message }}</p>
      </div>
        </div>
      </div>
    </div>

    <!-- 图片预览弹窗（支持缩放+拖拽） -->
    <div v-if="previewImg" class="modal-overlay" @wheel.prevent="onZoom" @mousedown="onPanStart" @mousemove="onPanMove" @mouseup="onPanEnd" @mouseleave="onPanEnd" style="display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:grab;">
      <div :style="zoomStyle">
        <img :src="previewImg" style="border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.5);display:block;max-width:initial;user-select:none;-webkit-user-drag:none;" draggable="false" @load="resetZoom" />
      </div>
      <!-- 顶部工具栏 -->
      <div style="position:fixed;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:100;background:rgba(0,0,0,0.6);padding:6px 12px;border-radius:20px;">
        <button title="放大" style="background:none;border:none;color:#fff;font-size:20px;width:32px;height:32px;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;" @click.stop="zoomIn">＋</button>
        <span style="color:#fff;font-size:13px;line-height:32px;min-width:40px;text-align:center;">{{ Math.round(zoomLevel * 100) }}%</span>
        <button title="缩小" style="background:none;border:none;color:#fff;font-size:20px;width:32px;height:32px;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;" @click.stop="zoomOut">−</button>
        <span style="color:rgba(255,255,255,0.3);line-height:32px;">|</span>
        <button title="重置" style="background:none;border:none;color:#fff;font-size:14px;height:32px;cursor:pointer;border-radius:16px;padding:0 10px;" @click.stop="resetZoom">适应</button>
        <span style="color:rgba(255,255,255,0.3);line-height:32px;">|</span>
        <button title="关闭" style="background:none;border:none;color:#fff;font-size:18px;width:32px;height:32px;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;" @click.stop="previewImg=null">✕</button>
      </div>
    </div>
    <!-- 站内提示 Toast -->
    <div class="toast-container">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="'toast-' + t.type" @click="removeToast(t.id)">
        {{ t.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, markRaw, reactive, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { chartApi, weatherApi } from '@/api'
import { isDarkTheme } from '@/utils/theme'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'

const chartIcao = ref('')
const chartProvider = ref('eaip')

// ---- 气象查询(由原气象报文页合并而来) ----
const weatherIcao = ref('')
const weatherResult = ref(null)
const weatherErr = ref('')
const weatherLoading = ref(false)

async function searchWeather() {
  if (weatherIcao.value.length < 3) return
  weatherErr.value = ''
  weatherResult.value = null
  weatherLoading.value = true
  try {
    const resp = await weatherApi.query(weatherIcao.value.toUpperCase())
    if (resp.success && resp.data) {
      const d = resp.data
      weatherResult.value = {
        station: d.station,
        icao: weatherIcao.value.toUpperCase(),
        metar: d.metar || '',
        taf: d.taf || '',
        temp: d.parsed?.temp ?? '',
        dew: d.parsed?.dew ?? '',
        wind: d.parsed?.wind ?? '',
        vis: d.parsed?.vis ?? '',
        visUnit: d.parsed?.visUnit || (d.parsed?.vis ? (d.parsed.vis === '≥10' ? 'km' : 'm') : ''),
        qnh: d.parsed?.qnh ?? '',
        tafParsed: d.tafParsed || null,
        qnhUnit: d.parsed?.qnhUnit || (d.parsed?.qnh ? 'hPa' : ''),
        time: d.parsed?.time ?? '',
        // METAR 覆盖增强(2026-10-30): 未命中时展示具体原因，而不是一片空白
        hint: d.hint || '',
        metarAvailable: !!d.metarAvailable,
        stationExists: d.stationExists !== false,
        source: d.source || ''
      }
    } else {
      weatherErr.value = '查询无结果'
    }
  } catch (e) {
    weatherErr.value = e.message || '查询失败'
  } finally {
    weatherLoading.value = false
  }
}
const chartRules = ref('IFR')
const chartLoading = ref(false)
const chartResult = ref(null)
const chartItems = ref([])
const activeCategory = ref('ALL')

const chartCategories = [
  { key: 'ALL',  label: '全部' },
  { key: 'TAXI', label: '停机位图' },
  { key: 'SID',  label: '离场 SID' },
  { key: 'STAR', label: '进场 STAR' },
  { key: 'APP',  label: '进近 IAP' },
  { key: 'REF',  label: '参考图' },
]

/** API category 字段到分类键的映射（含 AIP 的英文类别） */
const CATEGORY_MAP = {
  APT: 'REF', APT: 'REF', AIRPORT: 'REF',       // 机场概况 → 参考图
  REF: 'REF', REFERENCE: 'REF',                 // 参考信息 → 参考图
  DEP: 'SID', DEPARTURE: 'SID',                 // 离场程序 → 离场 SID
  ARR: 'STAR', ARRIVAL: 'STAR',                 // 进场程序 → 进场 STAR
  APP: 'APP', APPROACH: 'APP', INSTRUMENT_APPROACH: 'APP', // 进近 → 进近 IAP
}

const TAB_KEYS = new Set(['TAXI', 'SID', 'STAR', 'APP', 'REF'])

/** 归一化航图分类(兼容远程返回的 DEP/ARR/APP 等和本地 AIP 的 SID/STAR 等) */
function chartCategoryOf(c) {
  let cat = (c.category || c.type_code || '').toUpperCase()
  if (!TAB_KEYS.has(cat)) cat = CATEGORY_MAP[cat] || 'REF'
  return cat
}

const filteredCharts = computed(() => {
  if (activeCategory.value === 'ALL') return chartItems.value
  return chartItems.value.filter(c => chartCategoryOf(c) === activeCategory.value)
})

/** 计算指定分类的航图数量 */
function categoryCount(key) {
  if (key === 'ALL') return chartItems.value.length
  return chartItems.value.filter(c => chartCategoryOf(c) === key).length
}
const routeDep = ref('')
const routeArr = ref('')
// ---- 查询卡片自动折叠: 光标离开 1s 折叠(只留标题), 移入展开, 1.5s 动画 ----
const collapsed = reactive({ weather: false, route: false, chart: false })
const collapseTimers = {}
function expand(key) {
  clearTimeout(collapseTimers[key])
  collapsed[key] = false
}
function scheduleCollapse(key) {
  clearTimeout(collapseTimers[key])
  // 未触发过查询的卡片不参与折叠(仅查询过才允许收起)
  const queried = key === 'weather' ? !!(weatherResult.value || weatherErr.value)
    : key === 'route' ? !!routeResult.value
    : key === 'chart' ? chartItems.value.length > 0
    : false
  if (!queried) return
  collapseTimers[key] = setTimeout(() => { collapsed[key] = true }, 1000)
}
// Enter 触发查询; 防抖: 长按/连按 800ms 内仅触发一次
let enterWeatherLockedAt = 0
function onEnterWeather() {
  const now = Date.now()
  if (now - enterWeatherLockedAt < 800) return
  enterWeatherLockedAt = now
  searchWeather()
}
let enterRouteLockedAt = 0
function onEnterRoute() {
  const now = Date.now()
  if (now - enterRouteLockedAt < 800) return
  enterRouteLockedAt = now
  searchRoute()
}
const routeLoading = ref(false)
const routeResult = ref(null)

// Toast 提示系统
let toastId = 0
const toasts = ref([])
function showToast(msg, type = 'success') {
  const id = ++toastId
  toasts.value.push({ id, message: msg, type })
  setTimeout(() => { removeToast(id) }, 3000)
}
function removeToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}
const route = useRoute()
const isDark = ref(isDarkTheme())
let themeObserver = null
const previewImg = ref('')
const failedImages = ref(new Set())
const activeChart = ref(null) // 左侧列表当前选中的航图
const zoomLevel = ref(1)
const rotate = ref(0)  // 图片/航图旋转角度(每次 90°)
const panX = ref(0)
const panY = ref(0)
let panning = false
let panStartX = 0
let panStartY = 0
let panStartPX = 0
let panStartPY = 0
let lastWheelZoomAt = 0 
let wheelDeltaAccum = 0 

const zoomStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoomLevel.value}) rotate(${rotate.value}deg)`,
  transformOrigin: 'center center',
  transition: panning ? 'none' : 'transform 0.15s ease, filter 0.5s ease'
}))

function resetZoom(e) {
  panX.value = 0
  panY.value = 0
  if (e?.target) {
    const maxW = window.innerWidth * 0.9
    const maxH = window.innerHeight * 0.85
    zoomLevel.value = Math.min(maxW / e.target.naturalWidth, maxH / e.target.naturalHeight, 1)
  } else {
    zoomLevel.value = 1
  }
}

function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value * 1.5, 10)
}

function zoomOut() {
  const newZoom = zoomLevel.value / 1.5
  if (newZoom < 0.1) return
  zoomLevel.value = newZoom
}

function rotateImg() {
  rotate.value = (rotate.value + 90) % 360
}

function onZoom(e) {
  // 滚轮缩放: 节流(60ms) + 累积 deltaY。高精度滚轮/触控板一次滚动会触发大量 wheel 事件,
  // 若每个事件都缩放会导致瞬间放大到数百%。这里把 60ms 内的 deltaY 累积后一次性应用,
  // 缩放速度平滑可控。
  wheelDeltaAccum += e.deltaY || 0
  const now = Date.now()
  if (now - lastWheelZoomAt < 60) return
  lastWheelZoomAt = now
  let dy = wheelDeltaAccum
  wheelDeltaAccum = 0
  if (e.deltaMode === 1) dy *= 33        // 行模式 → 像素
  else if (e.deltaMode === 2) dy *= 100  // 页模式 → 像素
  dy = Math.max(-200, Math.min(200, dy)) // 限制单次缩放幅度,避免节流期间累积导致跳变
  const factor = Math.exp(-dy * 0.0012)
  zoomLevel.value = Math.max(0.1, Math.min(zoomLevel.value * factor, 10))
}

function onPanStart(e) {
  if (e.button !== 0) return
  panning = true
  panStartX = e.clientX
  panStartY = e.clientY
  panStartPX = panX.value
  panStartPY = panY.value
}

function onPanMove(e) {
  if (!panning) return
  const dx = e.clientX - panStartX
  const dy = e.clientY - panStartY
  panX.value = panStartPX + dx
  panY.value = panStartPY + dy
}

function onPanEnd() { panning = false }

function chartKey(c) { return c.id || c.index_number || c.name || c.url || '' }
function chartImageUrl(c) { return c.image_day_url || c.url || c.image_url || c.chart_url || '' }
function onImgErr(c) {
  const key = chartKey(c)
  if (key) failedImages.value = new Set([...failedImages.value, key])
}

function openPreview(c) {
  const url = c.image_day_url || c.url
  if (url) window.open(url, '_blank')
}

onMounted(() => {
  themeObserver = new MutationObserver(() => { isDark.value = isDarkTheme() })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const icao = route.query.icao
  if (icao) {
    chartIcao.value = icao.toUpperCase()
    searchChart()
  }
})

onUnmounted(() => { if (themeObserver) themeObserver.disconnect() })

// Enter 触发查询; 防抖: 长时间按住 Enter(或快速连按)800ms 内仅触发一次
let enterSearchLockedAt = 0
function onEnterSearch() {
  const now = Date.now()
  if (now - enterSearchLockedAt < 800) return
  enterSearchLockedAt = now
  searchChart()
}

async function searchChart() {
  if (!chartIcao.value) return showToast('请输入 ICAO 代码', 'error')
  // EAIP 提供商: 从本地 eAIP 数据返回航图列表
  if (chartProvider.value === 'eaip') {
    chartLoading.value = true
    failedImages.value = new Set()
    try {
      chartItems.value = await queryLocalAip(chartIcao.value)
      chartResult.value = { message: '' }
      activeChart.value = chartItems.value[0] || null
      activeCategory.value = 'ALL'
    } catch (e) { showToast('查询失败: ' + e.message, 'error'); chartItems.value = []; chartResult.value = null }
    finally { chartLoading.value = false }
    return
  }
  chartLoading.value = true
  failedImages.value = new Set()
  try {
    const res = await chartApi.query(chartIcao.value, chartProvider.value, chartRules.value)
    chartResult.value = res.data
    // 处理多种可能的返回格式
    const d = res.data?.data || res.data
    if (Array.isArray(d)) chartItems.value = d
    else if (d?.charts) chartItems.value = d.charts
    else chartItems.value = []
    activeChart.value = chartItems.value[0] || null // 默认选中第一张
  } catch (e) { showToast('查询失败: ' + e.message, 'error') }
  finally { chartLoading.value = false }
}

/**
 * 解析 SimBrief 格式的航路数据
 * [SBFlightPlan] Type=0 Departure=ZSSS Arrival=ZGHA Route= ...
 */
function parseRouteData(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const obj = { dep: '-', arr: '-', route: '-', distance: '-', flight_time: '-', alternate: '-' }

  // 获取 route 字符串（可能包含 SimBrief 格式）
  const routeStr = (raw.route || raw.full_route || '').toString()

  // 如果是 SimBrief 格式（[SBFlightPlan]），解析字段
  if (routeStr.includes('[SBFlightPlan]') || routeStr.includes('Departure=')) {
    const fields = {}
    routeStr.split(/[\r\n]+/).forEach(line => {
      const idx = line.indexOf('=')
      if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    })

    obj.dep = fields.Departure || raw.dep || raw.dep_icao || obj.dep
    obj.arr = fields.Arrival || raw.arr || raw.arr_icao || obj.arr
    // 提取纯净航路（去掉 SID/STAR 前后的机场代码）
    const rawRoute = fields.Route || ''
    obj.route = rawRoute.replace(/^[A-Z]{4}\s+SID\s+/, '').replace(/\s+STAR\s+[A-Z]{4}$/, '') || obj.route
    obj.alternate = fields.Alternate || raw.alternate || raw.alt_icao || obj.alternate
    // 从后端补充距离和飞行时间（后端已通过机场坐标计算）
    obj.distance = raw.distance || obj.distance
    obj.flight_time = raw.flight_time || raw.ete || obj.flight_time
    return obj
  }

  // 普通结构化数据
  obj.dep = raw.dep || raw.dep_icao || obj.dep
  obj.arr = raw.arr || raw.arr_icao || obj.arr
  obj.route = routeStr || raw.raw || obj.route
  obj.distance = raw.distance || obj.distance
  obj.flight_time = raw.flight_time || raw.ete || obj.flight_time
  obj.alternate = raw.alternate || raw.alt_icao || obj.alternate
  return obj
}

async function searchRoute() {
  if (!routeDep.value || !routeArr.value) return showToast('请输入起降机场', 'error')
  routeLoading.value = true
  try {
    const res = await chartApi.route(routeDep.value, routeArr.value)
    // res 已经是 axios 拦 interpretation 后的 data（整个响应体）
    // 后端返回 { success, data: { route, dep, arr, distance, flight_time, alternate } }
    routeResult.value = parseRouteData(res.data || res)
  } catch (e) { showToast('查询失败: ' + e.message, 'error') }
  finally { routeLoading.value = false }
}

// ---- 本地 eAIP 航图查询(从 public/eaip/Data 返回航图列表) ----
let aipAdCache = null
async function fetchAipAd() {
  if (aipAdCache) return aipAdCache
  const res = await fetch('/eaip/Data/JsonPath/AD.JSON')
  if (!res.ok) throw new Error('本地航图索引加载失败')
  aipAdCache = await res.json()
  return aipAdCache
}

function mapAipCategory(name) {
  const n = (name || '').toUpperCase()
  if (n.includes('SID')) return 'SID'
  if (n.includes('STAR')) return 'STAR'
  if (n.includes('IAC') || n.includes('APP')) return 'APP'
  if (n.includes('APDC') || n.includes('GMC')) return 'TAXI'
  return 'REF'
}

/** 从本地 eAIP 索引中提取某机场的全部航图条目 */
async function queryLocalAip(icao) {
  const code = (icao || '').toUpperCase()
  const data = await fetchAipAd()
  const root = data.find(it => (it.airporticao || '').toUpperCase() === code)
  if (!root) throw new Error(`本地航图未收录 ${code}`)
  const items = []
  const walk = (parentId) => {
    for (const k of data) {
      if (k.pId !== parentId) continue
      if (k.pdfPath && (k.name || '').startsWith(code + '-')) {
        items.push({
          id: k.id,
          name: k.name,
          index_number: k.name,
          category: mapAipCategory(k.name),
          url: '/eaip' + (k.pdfPath.startsWith('/') ? k.pdfPath : '/' + k.pdfPath),
          pdf: true,
        })
      }
      walk(k.id)
    }
  }
  walk(root.id)
  if (!items.length) throw new Error(`未找到 ${code} 的本地航图`)
  return items
}

// ---- 本地 AIP PDF 渲染(用 pdf.js 渲染到 canvas,不使用浏览器 PDF 工具栏) ----
const pdfDoc = shallowRef(null) // 必须 shallow+markRaw,pdf.js 文档对象含私有字段,不能被 Vue 代理
const pdfCanvases = ref([])
const pdfLoading = ref(false)
let pdfCanvasRefs = []

function setPdfCanvasRef(i, el) {
  pdfCanvasRefs[i] = el
  if (el && !el.dataset.rendered) {
    el.dataset.rendered = '1'
    renderPdfPage(i)
  }
}

async function renderPdfPage(i) {
  const el = pdfCanvasRefs[i]
  if (!el || !pdfDoc.value) return
  try {
    const page = await pdfDoc.value.getPage(i + 1)
    const vp = page.getViewport({ scale: 2 })
    el.width = vp.width
    el.height = vp.height
    // 按容器可用宽度等比缩放显示尺寸,避免被 CSS 压缩导致图片拉伸
    const stage = el.closest('.pdf-stage')
    const availW = (stage ? stage.clientWidth : (el.parentElement ? el.parentElement.clientWidth : vp.width)) - 24
    const s = Math.max(0.05, Math.min(1, availW / vp.width))
    el.style.width = Math.floor(vp.width * s) + 'px'
    el.style.height = Math.floor(vp.height * s) + 'px'
    const ctx = el.getContext('2d')
    await page.render({ canvasContext: ctx, viewport: vp }).promise
  } catch (e) { /* 单页渲染失败忽略 */ }
}

async function loadLocalPdf(url) {
  pdfDoc.value = null
  pdfCanvases.value = []
  pdfCanvasRefs = []
  if (!url) return
  pdfLoading.value = true
  try {
    const doc = await pdfjsLib.getDocument({ url }).promise
    pdfDoc.value = markRaw(doc)
    pdfCanvases.value = Array.from({ length: doc.numPages }, () => null)
    resetPdfView()
  } catch (e) { showToast('PDF 加载失败: ' + e.message, 'error') }
  finally { pdfLoading.value = false }
}

function resetPdfView() {
  zoomLevel.value = 1
  rotate.value = 0
  panX.value = 0
  panY.value = 0
}

watch(activeChart, (c) => {
  if (c?.pdf) loadLocalPdf(c.url)
  else { pdfDoc.value = null; pdfCanvases.value = []; resetPdfView() }
})
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  animation: toastIn 0.3s ease;
  max-width: 360px;
}
.toast-success { background: #10b981; color: #fff; }
.toast-error { background: #ef4444; color: #fff; }
.toast-info { background: #3b82f6; color: #fff; }
@keyframes toastIn {
  from { opacity: 0; transform: translateX(80px); }
  to { opacity: 1; transform: translateX(0); }
}

.charts-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px; }
.chart-tabs { display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--c-border-light);padding-bottom:8px; }
.chart-tab { padding:5px 14px;border-radius:6px;border:none;background:transparent;color:var(--c-text-secondary);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s; }
.chart-tab:hover { background:var(--glass-bg); }
.chart-tab.active { background:var(--c-primary);color:#fff; }
.modal-overlay { position:fixed;inset:0;background:rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;z-index:2000; }
.route-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px; }
/* 查询卡片折叠动画(1.5s): grid-template-rows 平滑收起 */
.card-collapse { display:grid; grid-template-rows:1fr; transition:grid-template-rows 1.5s ease, opacity 1.5s ease; }
.card-collapse.collapsed { grid-template-rows:0fr; opacity:0; }
.card-collapse-inner { overflow:hidden; min-height:0; }
/* 折叠状态: 卡片紧凑 + 标题左对齐(垂直居中) */
.card-collapsed { padding-block: 16px; }
.card-collapsed h3 { margin: 0; text-align: left; }
.card { transition: padding 1.5s ease; }
.card h3 { transition: margin 1.5s ease, text-align 1.5s ease; }
.weather-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:16px; }
.weather-item { padding:12px; background:var(--c-bg); border-radius:var(--radius-sm); }
.weather-item p { margin-top:4px; font-size:14px; word-break:break-all; }
.taf-summary { grid-column:1 / -1; background:var(--c-bg-subtle); }
.taf-summary p { line-height:1.7; }
.route-grid > div { padding:8px 12px;background:var(--glass-bg);border-radius:var(--radius-sm); }
.chart-card { cursor:pointer;transition:box-shadow .2s; }
.chart-card:hover { box-shadow:0 4px 20px rgba(0,0,0,0.15); }
.chart-name { cursor:pointer;color:var(--c-primary);text-decoration:underline;text-underline-offset:2px; }
.chart-name:hover { opacity:0.8; }
/* 航图查询结果：左侧列表 + 右侧大图 */
.chart-layout { display:flex; gap:16px; align-items:stretch; }
.chart-list { width:250px; flex-shrink:0; height:78vh; display:flex; flex-direction:column; border:1px solid var(--glass-border); border-radius:12px; overflow:hidden; background:var(--glass-bg); }
.chart-list-scroll { flex:1; min-height:0; overflow-y:auto; padding:6px; }
.pdf-stage, .img-stage { flex:1; min-height:0; }
.pdf-stage, .img-stage { background:#fff; transition: background-color 0.5s ease; }
.pdf-stage-dark, .img-stage-dark { background:#1b1b1d; }
/* 深色模式: PDF 航图反色(白底→黑底, 黑字→暗白), 平滑渐变过渡 */
.pdf-wrap { transition: filter 0.5s ease; }
.pdf-dark-invert { filter: invert(0.92) hue-rotate(180deg); }
.chart-list-item { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; color:var(--c-text); transition:background .15s, color .15s; }
.chart-list-item:hover { background:var(--glass-bg-strong); }
.chart-list-item.active { background:var(--c-primary); color:#fff; }
.chart-list-no { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.chart-detail { flex:1; min-width:0; text-align:center; display:flex; flex-direction:column; height:78vh; }
@media (max-width:768px) { .chart-layout { flex-direction:column; } .chart-list { width:100%; } }
</style>
