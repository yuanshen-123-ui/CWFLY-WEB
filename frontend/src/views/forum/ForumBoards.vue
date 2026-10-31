<template>
  <div class="forum fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>论坛</h1>
        <p>社区交流与讨论</p>
      </div>
      <router-link to="/forum/new" class="btn btn-primary btn-sm">发新帖</router-link>
    </div>

    <!-- 版块列表 -->
    <div class="card p-lg mb-lg">
      <h3 class="mb-md">版块</h3>
      <div class="boards-grid">
        <div v-for="b in boards" :key="b.id" class="board-item card p-md" @click="$router.push('/forum/board/' + b.id)">
          <h4 class="font-bold">{{ b.name }}</h4>
          <p class="text-sm text-muted">{{ b.description || '' }}</p>
          <span class="text-xs text-muted">排序: {{ b.sort }}</span>
        </div>
      </div>
      <div v-if="!boards.length" class="text-center text-muted p-md">暂无版块</div>
    </div>

    <!-- 最新帖子 -->
    <div class="card p-lg">
      <h3 class="mb-md">最新帖子</h3>
      <div v-for="p in posts" :key="p.id" class="post-item flex justify-between items-start p-md" @click="$router.push('/forum/post/' + p.id)">
        <div class="flex-1">
          <h4 class="font-bold text-sm">{{ p.title }} <span v-if="p.pinned" class="badge badge-warning text-xs">置顶</span></h4>
          <p class="text-xs text-muted mt-sm">{{ p.userId }} · {{ formatTime(p.createdAt) }} · 浏览 {{ p.views || 0 }}</p>
        </div>
        <span class="text-xs text-muted">{{ p._replyCount || 0 }} 回复</span>
      </div>
      <div v-if="!posts.length" class="text-center text-muted p-md">暂无帖子</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const boards = ref([])
const posts = ref([])

onMounted(async () => {
  try { const r = await api.get('/forum/boards'); boards.value = r.data || [] } catch { /* ignore */ }
  try { const r = await api.get('/forum/posts'); posts.value = r.data?.items || [] } catch { /* ignore */ }
})

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}
</script>

<style scoped>
.boards-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem; }
.board-item { cursor:pointer;transition:transform .2s; }
.board-item:hover { transform:translateY(-2px); }
.post-item { cursor:pointer;border-bottom:1px solid var(--c-border-light); }
.post-item:hover { background:var(--c-bg-hover); }
</style>
