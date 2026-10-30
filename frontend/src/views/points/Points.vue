<template>
  <div class="points fade-in">
    <div class="page-header">
      <h1>积分成就</h1>
      <p>查看我的积分、等级和成就</p>
    </div>

    <!-- 积分概览 -->
    <div class="card p-lg mb-lg">
      <div class="stats-grid">
        <div class="stat-item"><span class="stat-label">积分</span><span class="stat-value">{{ data.points || 0 }}</span></div>
        <div class="stat-item"><span class="stat-label">经验值</span><span class="stat-value">{{ data.exp || 0 }}</span></div>
        <div class="stat-item"><span class="stat-label">等级</span><span class="stat-value">{{ data.level || 1 }}</span></div>
        <div class="stat-item"><span class="stat-label">飞行次数</span><span class="stat-value">{{ data.flights || 0 }}</span></div>
        <div class="stat-item"><span class="stat-label">在线时长</span><span class="stat-value">{{ data.hours || 0 }}h</span></div>
      </div>
    </div>

    <!-- 成就列表 -->
    <div class="card p-lg">
      <h3 class="mb-md">我的成就</h3>
      <div class="achievements-grid">
        <div v-for="a in achievements" :key="a.id" class="achievement-card card p-md" :class="{ unlocked: a.unlocked }">
          <div class="achievement-icon">{{ a.achievement?.icon || '🏆' }}</div>
          <h4 class="text-sm font-bold">{{ a.achievement?.name || '未知成就' }}</h4>
          <p class="text-xs text-muted">{{ a.achievement?.description || '' }}</p>
        </div>
      </div>
      <div v-if="!achievements.length" class="text-center text-muted p-md">暂无成就</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const data = ref({})
const achievements = ref([])

onMounted(async () => {
  try {
    const r = await api.get('/points')
    data.value = r.data?.points || {}
    achievements.value = r.data?.achievements || []
  } catch {}
})
</script>

<style scoped>
.stats-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1rem; }
.stat-item { text-align:center;padding:1rem;background:var(--c-bg-subtle);border-radius:8px; }
.stat-label { display:block;font-size:.8rem;color:var(--c-text-muted);margin-bottom:.25rem; }
.stat-value { font-size:1.5rem;font-weight:bold;color:var(--c-primary); }
.achievements-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem; }
.achievement-card { text-align:center;opacity:.5;transition:opacity .3s; }
.achievement-card.unlocked { opacity:1; }
.achievement-icon { font-size:2rem;margin-bottom:.5rem; }
</style>
