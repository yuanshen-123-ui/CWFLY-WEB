<template>
  <div class="airport-detail fade-in">
    <div class="page-header">
      <h1>{{ airport?.icao || '机场详情' }}</h1>
      <p>{{ airport?.name }} · {{ airport?.city }}, {{ airport?.country }}</p>
    </div>

    <div class="card p-lg mb-lg" v-if="airport">
      <div class="grid-3 gap-md">
        <div>
          <label class="text-sm text-muted">ICAO</label>
          <p class="font-bold">{{ airport.icao }}</p>
        </div>
        <div>
          <label class="text-sm text-muted">IATA</label>
          <p>{{ airport.iata || '-' }}</p>
        </div>
        <div>
          <label class="text-sm text-muted">城市</label>
          <p>{{ airport.city || '-' }}</p>
        </div>
        <div>
          <label class="text-sm text-muted">国家</label>
          <p>{{ airport.country || '-' }}</p>
        </div>
        <div>
          <label class="text-sm text-muted">经纬度</label>
          <p>{{ airport.lat?.toFixed(4) }}, {{ airport.lon?.toFixed(4) }}</p>
        </div>
        <div>
          <label class="text-sm text-muted">海拔</label>
          <p>{{ airport.elevation || '-' }} ft</p>
        </div>
        <div>
          <label class="text-sm text-muted">时区</label>
          <p>{{ airport.timezone || '-' }}</p>
        </div>
        <div>
          <label class="text-sm text-muted">频率</label>
          <div v-if="airport.isMilitary" class="text-sm text-muted">军用机场</div>
          <div v-else-if="airport.frequencies?.length">
            <p v-for="f in airport.frequencies.slice(0,5)" :key="f.frequency" class="text-sm">{{ f.type || f.name }}: {{ f.frequency }}</p>
            <p v-if="airport.frequencies.length > 5" class="text-xs text-muted">+{{ airport.frequencies.length - 5 }} 更多</p>
          </div>
          <p v-else class="text-sm text-muted">暂无数据</p>
        </div>
        <div>
          <label class="text-sm text-muted">跑道</label>
          <div v-if="airport.isMilitary" class="text-sm text-muted">军用机场</div>
          <div v-else-if="airport.runways?.length">
            <p v-for="r in airport.runways" :key="r.ident" class="text-sm">{{ r.ident }} · {{ r.length }}m · {{ r.surface || '-' }}</p>
          </div>
          <p v-else class="text-sm text-muted">暂无数据</p>
        </div>
      </div>
      <div v-if="airport.description" class="mt-md">
        <label class="text-sm text-muted">简介</label>
        <p class="text-sm">{{ airport.description }}</p>
      </div>
    </div>

    <div class="flex gap-sm">
      <button class="btn btn-outline" @click="$router.push('/weather?icao=' + airport?.icao)">查看气象</button>
      <button class="btn btn-outline" @click="$router.push('/charts?icao=' + airport?.icao)">查看航图</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'

const route = useRoute()
const airport = ref(null)

onMounted(async () => {
  try {
    const r = await api.get('/content/' + route.params.icao.toUpperCase())
    airport.value = r.data
  } catch { /* ignore */ }
})
</script>

<style scoped>
.grid-3 { display:grid;grid-template-columns:repeat(3,1fr);gap:1rem; }
</style>
