<template>
  <div class="points fade-in">
    <div class="page-header">
      <h1>积分成就</h1>
      <p>查看我的积分、等级和成就</p>
    </div>

    <!-- 积分概览 -->
    <div class="card p-lg mb-lg">
      <div v-if="loading" class="stats-grid" aria-busy="true" aria-label="正在加载积分数据">
        <Skeleton v-for="i in 5" :key="i" :height="64" :radius="8" />
      </div>
      <div v-else class="stats-grid">
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
      <div v-if="loading" class="achievements-grid" aria-busy="true" aria-label="正在加载成就">
        <Skeleton v-for="i in 4" :key="i" :height="132" :radius="14" />
      </div>
      <div v-else-if="!achievements.length">
        <EmptyState icon="trophy" title="暂无成就" description="完成飞行、参与活动即可解锁成就徽章。" />
      </div>
      <div v-else class="achievements-grid">
        <div v-for="a in achievements" :key="a.id" class="achievement-card card p-md" :class="{ unlocked: a.unlocked }">
          <div class="achievement-icon">{{ a.achievement?.icon || '🏆' }}</div>
          <h4 class="text-sm font-bold">{{ a.achievement?.name || '未知成就' }}</h4>
          <p class="text-xs text-muted">{{ a.achievement?.description || '' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'
import EmptyState from '@/components/base/EmptyState.vue'
import Skeleton from '@/components/base/Skeleton.vue'

const data = ref({})
const achievements = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const r = await api.get('/points')
    data.value = r.data?.points || {}
    achievements.value = r.data?.achievements || []
  } catch { /* ignore */ } finally {
    loading.value = false
  }
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
