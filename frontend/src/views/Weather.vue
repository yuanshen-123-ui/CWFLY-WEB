<template>
  <div class="weather fade-in">
    <div class="page-header">
      <h1>气象报文查询</h1>
      <p>查询机场 METAR / TAF 气象信息</p>
    </div>

    <div class="card p-lg mb-lg">
      <div class="flex gap-sm items-end flex-wrap">
        <div style="flex:1;min-width:160px;">
          <label class="text-sm text-muted mb-sm" style="display:block;">ICAO 代码</label>
          <input v-model="icao" class="input" placeholder="如 ZBAA, ZSSS" maxlength="4" @keyup.enter="search" />
        </div>
        <button class="btn btn-primary" @click="search" :disabled="loading">
          {{ loading ? '查询中...' : '查询' }}
        </button>
      </div>
    </div>

    <div v-if="result" class="card p-lg">
      <h3 class="mb-md">{{ result.station }} ({{ result.icao }})</h3>
      <div class="weather-grid">
        <div class="weather-item"><span class="text-muted">METAR</span><p class="font-bold">{{ result.metar || '—' }}</p></div>
        <div class="weather-item"><span class="text-muted">TAF</span><p class="font-bold" style="white-space:pre-wrap;">{{ result.taf || '无' }}</p></div>
        <div v-if="result.tafParsed" class="weather-item taf-summary"><span class="text-muted">TAF 翻译</span><p>{{ result.tafParsed.summary || '—' }}</p></div>
        <div class="weather-item"><span class="text-muted">温度</span><p>{{ result.temp }}°C</p></div>
        <div class="weather-item"><span class="text-muted">露点</span><p>{{ result.dew }}°C</p></div>
        <div class="weather-item"><span class="text-muted">风向风速</span><p>{{ result.wind }}</p></div>
        <div class="weather-item"><span class="text-muted">能见度</span><p>{{ result.vis }}{{ result.visUnit ? ' ' + result.visUnit : '' }}</p></div>
        <div class="weather-item"><span class="text-muted">气压</span><p>{{ result.qnh }}{{ result.qnhUnit ? ' ' + result.qnhUnit : '' }}</p></div>
        <div class="weather-item"><span class="text-muted">更新时间</span><p class="text-sm">{{ result.time }}</p></div>
      </div>
      <div v-if="result.hint" class="text-sm text-muted mt-md" style="line-height:1.7;">
        ⓘ {{ result.hint }}
      </div>
      <div v-if="result.source" class="text-xs text-muted mt-sm">
        数据源：{{ result.source }}
      </div>
    </div>

    <div v-if="err" class="card p-lg mt-md text-center" style="color:var(--c-danger);">{{ err }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { weatherApi } from '@/api'

const route = useRoute()
const icao = ref('')
const result = ref(null)
const err = ref('')
const loading = ref(false)

async function search() {
  if (icao.value.length < 3) return
  err.value = ''
  result.value = null
  loading.value = true
  try {
    const resp = await weatherApi.query(icao.value.toUpperCase())
    if (resp.success && resp.data) {
      const d = resp.data
      result.value = {
        station: d.station,
        icao: icao.value.toUpperCase(),
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
        // METAR 覆盖增强(2026-10-30): 未命中时展示具体原因
        hint: d.hint || '',
        metarAvailable: !!d.metarAvailable,
        stationExists: d.stationExists !== false,
        source: d.source || ''
      }
    } else {
      err.value = '查询无结果'
    }
  } catch (e) {
    err.value = e.message || '查询失败'
  } finally {
    loading.value = false
  }
}

// 支持 /weather?icao=ZBAA 带参进入（AirportDetail 的「查看气象」即用此方式跳转），进页面自动查询
onMounted(() => {
  const q = String(route.query.icao || '').toUpperCase().trim()
  if (/^[A-Z0-9]{3,4}$/.test(q)) {
    icao.value = q
    search()
  }
})
</script>

<style scoped>
.weather-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.weather-item { padding: 12px; background: var(--c-bg); border-radius: var(--radius-sm); }
.weather-item p { margin-top: 4px; font-size: 14px; word-break: break-all; }
.taf-summary { grid-column: 1 / -1; background: var(--c-bg-subtle); }
.taf-summary p { line-height: 1.7; }
</style>
