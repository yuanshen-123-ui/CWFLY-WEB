<template>
  <div class="forum-post-detail fade-in">
    <div class="page-header">
      <h1>{{ post?.title || '帖子详情' }}</h1>
      <p>{{ post?.userId }} · {{ formatTime(post?.createdAt) }} · 浏览 {{ post?.views || 0 }}</p>
    </div>

    <div class="card p-lg mb-lg">
      <div class="post-content" v-html="renderContent(post?.content)"></div>
    </div>

    <div class="card p-lg mb-lg">
      <h3 class="mb-md">回复 ({{ replies.length }})</h3>
      <div v-for="r in replies" :key="r.id" class="reply-item p-md">
        <div class="flex justify-between items-center mb-sm">
          <span class="font-bold text-sm">{{ r.userId }}</span>
          <span class="text-xs text-muted">{{ formatTime(r.createdAt) }}</span>
        </div>
        <div class="text-sm" v-html="renderContent(r.content)"></div>
      </div>
      <div v-if="!replies.length" class="text-center text-muted p-md">暂无回复</div>
    </div>

    <div class="card p-lg">
      <h3 class="mb-md">发表回复</h3>
      <textarea v-model="replyContent" class="input" rows="4" placeholder="写下你的回复..."></textarea>
      <button class="btn btn-primary mt-sm" @click="submitReply" :disabled="!replyContent.trim() || replyLoading">
        {{ replyLoading ? '提交中...' : '提交回复' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import { renderText } from '@/utils/sanitize'

const route = useRoute()
const post = ref(null)
const replies = ref([])
const replyContent = ref('')
const replyLoading = ref(false)

onMounted(async () => {
  try {
    const r = await api.get('/forum/posts/' + route.params.postId)
    post.value = r.data
    replies.value = r.data?.replies || []
  } catch { /* ignore */ }
})

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

function renderContent(c) {
  return renderText(c)
}

async function submitReply() {
  if (!replyContent.value.trim()) return
  replyLoading.value = true
  try {
    await api.post('/forum/posts/' + route.params.postId + '/reply', { content: replyContent.value })
    replyContent.value = ''
    const r = await api.get('/forum/posts/' + route.params.postId)
    replies.value = r.data?.replies || []
  } catch (e) { alert('提交失败: ' + e.message) }
  finally { replyLoading.value = false }
}
</script>

<style scoped>
.post-content { line-height:1.8; }
.reply-item { border-bottom:1px solid var(--c-border-light); }
.reply-item:last-child { border-bottom:none; }
</style>
