<template>
  <div class="article-detail fade-in">
    <div class="page-header">
      <h1>{{ article?.title || '文章详情' }}</h1>
      <p>{{ article?.category }} · {{ formatTime(article?.createdAt) }} · {{ article?.views }} 次阅读</p>
    </div>

    <div class="card p-lg">
      <div class="article-content" v-html="renderContent(article?.content)"></div>
    </div>

    <div class="mt-md">
      <button class="btn btn-outline" @click="$router.push('/knowledge')">← 返回知识库</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import { sanitizeHtml } from '@/utils/sanitize'

const route = useRoute()
const article = ref(null)

function renderContent(c) {
  return sanitizeHtml(c)
}

onMounted(async () => {
  try {
    const r = await api.get('/content/knowledge/' + route.params.id)
    article.value = r.data
  } catch { /* ignore */ }
})

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}
</script>

<style scoped>
.article-content { line-height:1.8; }
</style>
