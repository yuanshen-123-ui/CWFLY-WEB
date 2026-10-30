<template>
  <div class="knowledge fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>知识库</h1>
        <p>飞行知识、教程和参考资料</p>
      </div>
      <div class="flex gap-sm">
        <select v-model="category" class="input" style="width:auto;" @change="load">
          <option value="">全部分类</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
    </div>

    <div class="knowledge-grid">
      <div v-for="a in articles" :key="a.id" class="knowledge-card card p-lg" @click="$router.push('/knowledge/' + a.id)">
        <div class="flex justify-between items-start mb-sm">
          <span class="badge badge-info">{{ a.category || '通用' }}</span>
          <span class="text-xs text-muted">{{ a.views || 0 }} 次阅读</span>
        </div>
        <h3 class="font-bold text-sm mb-sm">{{ a.title }}</h3>
        <p class="text-sm text-muted">{{ a.summary || a.content?.substring(0, 100) || '' }}</p>
        <p class="text-xs text-muted mt-sm">{{ formatTime(a.createdAt) }}</p>
      </div>
    </div>
    <div v-if="!articles.length" class="text-center text-muted p-lg">暂无文章</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const articles = ref([])
const category = ref('')
const categories = ['飞行技术', '管制知识', '气象知识', '机型手册', '平台指南', '其他']

onMounted(() => load())

async function load() {
  try {
    const params = category.value ? { category: category.value } : {}
    const r = await api.get('/content/knowledge', { params })
    articles.value = r.data || []
  } catch {}
}

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.knowledge-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem; }
.knowledge-card { cursor:pointer;transition:transform .2s; }
.knowledge-card:hover { transform:translateY(-2px); }
</style>
