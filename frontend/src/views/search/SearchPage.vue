<template>
  <div class="search-page fade-in">
    <div class="page-header">
      <h1>搜索</h1>
      <p>搜索平台内容</p>
    </div>

    <div class="card p-lg mb-lg">
      <div class="flex gap-sm">
        <input v-model="query" class="input flex-1" placeholder="搜索活动、帖子、机场、知识库..." @keyup.enter="search" />
        <button class="btn btn-primary" @click="search" :disabled="!query.trim() || loading">{{ loading ? '搜索中...' : '搜索' }}</button>
      </div>
    </div>

    <div v-if="results" class="space-y-md">
      <div class="card p-lg" v-if="results.events?.length">
        <h3 class="mb-md">活动</h3>
        <div v-for="e in results.events" :key="e.id" class="result-item p-sm" @click="$router.push('/network')">
          <h4 class="font-bold text-sm">{{ e.title }}</h4>
          <p class="text-xs text-muted">{{ e.date }} · {{ e.dep }} → {{ e.arr }}</p>
        </div>
      </div>

      <div class="card p-lg" v-if="results.posts?.length">
        <h3 class="mb-md">论坛帖子</h3>
        <div v-for="p in results.posts" :key="p.id" class="result-item p-sm" @click="$router.push('/forum/post/' + p.id)">
          <h4 class="font-bold text-sm">{{ p.title }}</h4>
          <p class="text-xs text-muted">{{ p.userId }} · {{ formatTime(p.createdAt) }}</p>
        </div>
      </div>

      <div class="card p-lg" v-if="results.airports?.length">
        <h3 class="mb-md">机场</h3>
        <div v-for="a in results.airports" :key="a.id" class="result-item p-sm" @click="$router.push('/airport/' + a.icao)">
          <h4 class="font-bold text-sm">{{ a.icao }} - {{ a.name }}</h4>
          <p class="text-xs text-muted">{{ a.city }}, {{ a.country }}</p>
        </div>
      </div>

      <div class="card p-lg" v-if="results.knowledge?.length">
        <h3 class="mb-md">知识库</h3>
        <div v-for="k in results.knowledge" :key="k.id" class="result-item p-sm" @click="$router.push('/knowledge/' + k.id)">
          <h4 class="font-bold text-sm">{{ k.title }}</h4>
          <p class="text-xs text-muted">{{ k.category }}</p>
        </div>
      </div>

      <div v-if="noResults" class="text-center text-muted p-lg">未找到相关结果</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import api from '@/api'

const query = ref('')
const results = ref(null)
const loading = ref(false)
const noResults = ref(false)

async function search() {
  if (!query.value.trim()) return
  loading.value = true
  noResults.value = false
  try {
    const r = await api.get('/content/search', { params: { q: query.value } })
    results.value = r.data
    const hasAny = Object.values(r.data || {}).some(arr => arr && arr.length > 0)
    noResults.value = !hasAny
  } catch { /* ignore */ }
  finally { loading.value = false }
}

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}
</script>

<style scoped>
.result-item { cursor:pointer;border-bottom:1px solid var(--c-border-light); }
.result-item:hover { background:var(--c-bg-hover); }
.space-y-md > * + * { margin-top:1rem; }
</style>
