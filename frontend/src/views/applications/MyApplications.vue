<template>
  <div class="my-applications fade-in">
    <div class="page-header">
      <h1>我的申请</h1>
      <p>查看我提交的所有申请和审核状态</p>
    </div>

    <div class="card p-lg">
      <div v-for="a in applications" :key="a.id" class="app-item p-md">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="font-bold text-sm">{{ typeLabel(a.type) }}</h4>
            <p class="text-xs text-muted">{{ a.content || '-' }}</p>
          </div>
          <span class="badge" :class="statusBadge(a.status)">{{ a.status }}</span>
        </div>
        <div v-if="a.reviewComment" class="mt-sm p-sm" style="background:var(--c-bg-subtle);border-radius:6px;">
          <span class="text-xs text-muted">审核意见: </span>
          <span class="text-xs">{{ a.reviewComment }}</span>
        </div>
        <p class="text-xs text-muted mt-sm">{{ formatTime(a.createdAt) }}</p>
      </div>
      <div v-if="!applications.length" class="text-center text-muted p-lg">暂无申请记录</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const applications = ref([])

onMounted(async () => {
  try { const r = await api.get('/apply/my'); applications.value = r.data || [] } catch (e) { console.error('[MyApplications]', e) }
})

function typeLabel(t) {
  const m = { controller: '管制员申请', staff: '职员申请', role: '角色变更申请' }
  return m[t] || t
}

function statusBadge(s) {
  return s === 'approved' ? 'badge-success' : s === 'rejected' ? 'badge-danger' : 'badge-warning'
}

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}
</script>

<style scoped>
.app-item { border-bottom:1px solid var(--c-border-light); }
.app-item:last-child { border-bottom:none; }
</style>
