<template>
  <div class="forum-posts fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>{{ board?.name || '帖子列表' }}</h1>
        <p>{{ board?.description || '' }}</p>
      </div>
      <router-link to="/forum/new" class="btn btn-primary btn-sm">发新帖</router-link>
    </div>

    <div class="card p-lg">
      <!-- 加载态 Skeleton / 空态 EmptyState -->
      <div v-if="loading" aria-busy="true" aria-label="正在加载帖子">
        <Skeleton :lines="6" :height="16" />
      </div>
      <EmptyState
        v-else-if="!posts.length"
        icon="doc"
        title="暂无帖子"
        description="这个板块还没有讨论，来发第一帖吧。"
        action-text="发新帖"
        action-to="/forum/new"
      />
      <div v-else>
        <div v-for="p in posts" :key="p.id" class="post-item flex justify-between items-start p-md" @click="$router.push('/forum/post/' + p.id)">
          <div class="flex-1">
            <h4 class="font-bold text-sm">{{ p.title }} <span v-if="p.pinned" class="badge badge-warning text-xs">置顶</span></h4>
            <p class="text-xs text-muted mt-sm">{{ p.userId }} · {{ formatTime(p.createdAt) }} · 浏览 {{ p.views || 0 }}</p>
          </div>
          <span class="text-xs text-muted">{{ p._replyCount || 0 }} 回复</span>
        </div>
      </div>
    </div>

    <div class="flex justify-center gap-sm mt-md" v-if="total > 20">
      <button class="btn btn-outline btn-sm" :disabled="page <= 1" @click="page--;load()">上一页</button>
      <span class="text-sm text-muted self-center">第 {{ page }} 页 / 共 {{ Math.ceil(total / 20) }} 页</span>
      <button class="btn btn-outline btn-sm" :disabled="page >= Math.ceil(total / 20)" @click="page++;load()">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import EmptyState from '@/components/base/EmptyState.vue'
import Skeleton from '@/components/base/Skeleton.vue'

const route = useRoute()
const board = ref(null)
const posts = ref([])
const page = ref(1)
const total = ref(0)
const loading = ref(false)

onMounted(async () => {
  const boardId = route.params.boardId
  try {
    const r = await api.get('/forum/boards')
    const all = r.data || []
    board.value = all.find(b => b.id === Number(boardId))
  } catch { /* ignore */ }
  load()
})

async function load() {
  loading.value = true
  try {
    const r = await api.get('/forum/posts', { params: { boardId: route.params.boardId, page: page.value } })
    posts.value = r.data?.items || []
    total.value = r.data?.total || 0
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}
</script>

<style scoped>
.post-item { cursor:pointer;border-bottom:1px solid var(--c-border-light); }
.post-item:hover { background:var(--c-bg-hover); }
</style>
