<template>
  <div class="replay-page">
    <div class="panel">
      <div class="panel-head">
        <h3>航迹回放</h3>
        <span class="sub">whazzup 航迹 · 每 10s 采样</span>
      </div>

      <div class="search-row">
        <input v-model="callsign" placeholder="呼号，如 CES123（留空=全部）" @keyup.enter="loadSessions" />
        <button class="btn" :disabled="loading" @click="loadSessions">{{ loading ? '查询中…' : '查询' }}</button>
      </div>

      <div v-if="error" class="err">{{ error }}</div>

      <div class="session-list">
        <div v-if="!sessions.length" class="empty">暂无航迹记录（机组上线后每 10 秒记录一个点）</div>
        <div v-for="s in sessions" :key="s.sessionId + s.callsign" class="session-item"
             :class="{ active: selected && selected.sessionId === s.sessionId }" @click="selectSession(s)">
          <div class="line1">
            <b>{{ s.callsign }}</b>
            <span class="dur">{{ fmtDur(s.durationSec) }}</span>
          </div>
          <div class="line2">
            {{ fmtTime(s.startTime) }} → {{ fmtTime(s.endTime) }} · {{ s.points }} 点 ·
            最高 {{ s.maxAltitude }} ft
          </div>
        </div>
      </div>

      <div v-if="selected && points.length" class="player">
        <div class="times">
          <span>{{ fmtTime(points[0]?.recordedAt) }}</span>
          <span>{{ fmtTime(points[points.length - 1]?.recordedAt) }}</span>
        </div>
        <input class="slider" type="range" min="0" :max="points.length - 1" v-model.number="index" @input="seek" />
        <div class="controls">
          <button class="btn small" @click="togglePlay">{{ playing ? '暂停' : '播放' }}</button>
          <button class="btn small" @click="speed = speed >= 8 ? 1 : speed * 2">{{ speed }}x</button>
          <button class="btn small" @click="seek(0); playing = false">重置</button>
          <span class="cur">{{ curInfo }}</span>
        </div>
      </div>
    </div>

    <div class="map-wrap">
      <div ref="mapEl" class="map"></div>
      <div v-if="mapError" class="map-err">{{ mapError }}</div>
      <div v-if="!selected" class="map-hint">左侧选择一个航迹会话开始回放</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const AMAP_KEY = '89b5c51a7622408a444f2c62a7de6113'
const AMAP_SECURITY_CODE = 'a20594f2f5e875560ec09be0fca30a1a'

const callsign = ref('')
const sessions = ref([])
const selected = ref(null)
const points = ref([])
const index = ref(0)
const playing = ref(false)
const speed = ref(2)
const loading = ref(false)
const error = ref('')
const mapError = ref('')
const mapEl = ref(null)

let map = null
let polyline = null
let marker = null
let timer = null

const curInfo = computed(() => {
  const p = points.value[index.value]
  if (!p) return ''
  const alt = `<span class="hl">${p.altitude}</span> ft`
  return `${alt} · ${p.groundSpeed} kt · ${p.heading}°`
})

function fmtTime(t) {
  if (!t) return '—'
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function fmtDur(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m${String(ss).padStart(2, '0')}s`
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.success === false) throw new Error(body.message || `请求失败(${res.status})`)
  return body.data
}

async function loadSessions() {
  loading.value = true
  error.value = ''
  try {
    const q = callsign.value.trim().toUpperCase()
    sessions.value = await getJson(`/api/tracks/sessions?limit=30${q ? `&callsign=${encodeURIComponent(q)}` : ''}`)
    if (!sessions.value.length) error.value = '该呼号没有已记录的航迹'
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function selectSession(s) {
  selected.value = s
  points.value = []
  index.value = 0
  playing.value = false
  try {
    const rows = await getJson(`/api/tracks/session/${s.sessionId}`)
    points.value = rows
    drawTrack()
  } catch (e) {
    error.value = e.message
  }
}

function ensureMap(cb) {
  if (map) return cb()
  if (AMAP_SECURITY_CODE) window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE }
  const script = document.createElement('script')
  script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`
  script.onload = () => cb()
  script.onerror = () => { mapError.value = '高德地图加载失败' }
  document.body.appendChild(script)
}

function drawTrack() {
  ensureMap(() => {
    if (!map) {
      map = new window.AMap.Map(mapEl.value, { zoom: 5, center: [110, 32], resizeEnable: true })
    }
    if (polyline) map.remove(polyline)
    if (marker) map.remove(marker)
    const path = points.value.map(p => [p.lon, p.lat])
    polyline = new window.AMap.Polyline({
      path,
      strokeColor: '#3aa0ff',
      strokeWeight: 4,
      strokeOpacity: 0.85,
      showDir: true
    })
    map.add(polyline)
    marker = new window.AMap.Marker({ position: path[0], anchor: 'bottom-center', zIndex: 200 })
    map.add(marker)
    map.setFitView([polyline], false, [60, 60, 60, 60])
    index.value = 0
    seek(0)
  })
}

function seek(i) {
  if (!points.value.length) return
  index.value = Math.min(Math.max(Number(i) || 0, 0), points.value.length - 1)
  const p = points.value[index.value]
  if (marker && p) marker.setPosition([p.lon, p.lat])
  if (map && p && playing.value) map.setCenter([p.lon, p.lat])
}

function togglePlay() {
  if (!points.value.length) return
  playing.value = !playing.value
  if (playing.value) {
    if (index.value >= points.value.length - 1) seek(0)
    const frame = () => {
      if (!playing.value) return
      if (index.value >= points.value.length - 1) { playing.value = false; return }
      seek(index.value + 1)
      timer = setTimeout(frame, Math.max(30, 500 / speed.value))
    }
    frame()
  } else if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

onMounted(() => {
  ensureMap(() => {
    if (!map) map = new window.AMap.Map(mapEl.value, { zoom: 5, center: [110, 32], resizeEnable: true })
  })
  loadSessions()
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  if (map) { map.destroy(); map = null }
})
</script>

<style scoped>
.replay-page { display: flex; gap: 14px; height: calc(100vh - 120px); min-height: 480px; padding: 12px; }
.panel { width: 340px; flex: 0 0 340px; display: flex; flex-direction: column; gap: 10px;
  background: var(--c-bg-card, #fff); border-radius: 10px; padding: 14px; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.panel-head h3 { margin: 0; font-size: 16px; }
.sub { font-size: 12px; color: var(--c-text-muted, #888); }
.search-row { display: flex; gap: 8px; }
.search-row input { flex: 1; padding: 7px 10px; border: 1px solid var(--c-border, #ddd); border-radius: 6px; background: var(--c-bg, #fff); color: inherit; }
.btn { padding: 7px 12px; border: 1px solid var(--c-border, #ddd); background: var(--c-primary, #3aa0ff); color: #fff; border-radius: 6px; cursor: pointer; }
.btn[disabled] { opacity: .6; cursor: default; }
.btn.small { padding: 4px 10px; font-size: 12px; }
.err { color: #e05555; font-size: 12px; }
.session-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.empty { font-size: 12px; color: var(--c-text-muted, #999); padding: 16px 6px; text-align: center; }
.session-item { padding: 8px 10px; border: 1px solid var(--c-border, #eee); border-radius: 8px; cursor: pointer; }
.session-item:hover { border-color: var(--c-primary, #3aa0ff); }
.session-item.active { border-color: var(--c-primary, #3aa0ff); background: rgba(58,160,255,.08); }
.line1 { display: flex; justify-content: space-between; font-size: 13px; }
.dur { color: var(--c-text-muted, #888); }
.line2 { font-size: 11px; color: var(--c-text-muted, #888); margin-top: 3px; }
.player { border-top: 1px solid var(--c-border, #eee); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.times { display: flex; justify-content: space-between; font-size: 11px; color: var(--c-text-muted, #888); }
.slider { width: 100%; }
.controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; }
.cur { margin-left: auto; }
.hl { color: var(--c-primary, #3aa0ff); font-weight: 600; }
.map-wrap { flex: 1; position: relative; border-radius: 10px; overflow: hidden; background: #0e1621; }
.map { width: 100%; height: 100%; }
.map-err, .map-hint { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  color: #fff; font-size: 13px; background: rgba(0,0,0,.45); padding: 8px 14px; border-radius: 8px; }
</style>
