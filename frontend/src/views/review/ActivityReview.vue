<template>
  <div class="activity-review fade-in">
    <div class="page-header">
      <h1>活动回顾</h1>
      <p>查看往期活动的回顾和评价</p>
    </div>

    <div class="card p-lg mb-lg" v-for="r in reviews" :key="r.id">
      <div class="flex justify-between items-start mb-sm">
        <div>
          <h3 class="font-bold">{{ r.event?.title || '活动' }}</h3>
          <p class="text-xs text-muted">{{ r.event?.date }} · {{ r.event?.dep }} → {{ r.event?.arr }}</p>
        </div>
        <span class="badge badge-default">{{ r.type || '回顾' }}</span>
      </div>
      <div class="text-sm mb-sm" v-html="renderContent(r.content)"></div>
      <div v-if="r.rating" class="flex gap-sm items-center">
        <span class="text-sm">评分:</span>
        <span v-for="i in 5" :key="i" class="star" :class="{ filled: i <= r.rating }">★</span>
      </div>
      <p class="text-xs text-muted mt-sm">{{ r.userId }} · {{ formatTime(r.createdAt) }}</p>
    </div>
    <div v-if="!reviews.length" class="text-center text-muted p-lg">暂无活动回顾</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'
import { renderText } from '@/utils/sanitize'

function renderContent(c) {
  return renderText(c)
}

const reviews = ref([])

onMounted(async () => {
  try { const r = await api.get('/events/reviews'); reviews.value = r.data || [] } catch { /* ignore */ }
})

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}
</script>

<style scoped>
.star { color:var(--c-border); font-size:1.2rem; }
.star.filled { color:#f5a623; }
</style>
