<template>
  <div class="create-post fade-in">
    <div class="page-header">
      <h1>发新帖</h1>
      <p>创建新的论坛帖子</p>
    </div>

    <div class="card p-lg">
      <div class="mb-md">
        <label class="text-sm font-bold mb-sm" style="display:block;">选择版块</label>
        <select v-model="boardId" class="input">
          <option value="">-- 请选择 --</option>
          <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </div>
      <div class="mb-md">
        <label class="text-sm font-bold mb-sm" style="display:block;">标题</label>
        <input v-model="title" class="input" placeholder="帖子标题" maxlength="100" />
      </div>
      <div class="mb-md">
        <label class="text-sm font-bold mb-sm" style="display:block;">内容</label>
        <textarea v-model="content" class="input" rows="10" placeholder="写下你的内容..."></textarea>
      </div>
      <div class="flex gap-sm">
        <button class="btn btn-primary" @click="submit" :disabled="!title.trim() || !content.trim() || loading">
          {{ loading ? '提交中...' : '发布帖子' }}
        </button>
        <button class="btn btn-outline" @click="$router.back()">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'

const router = useRouter()
const boards = ref([])
const boardId = ref('')
const title = ref('')
const content = ref('')
const loading = ref(false)

onMounted(async () => {
  try { const r = await api.get('/forum/boards'); boards.value = r.data || [] } catch {}
})

async function submit() {
  if (!boardId.value) return alert('请选择版块')
  if (!title.value.trim()) return alert('请输入标题')
  if (!content.value.trim()) return alert('请输入内容')
  loading.value = true
  try {
    await api.post('/forum/posts', { boardId: boardId.value, title: title.value, content: content.value })
    alert('发布成功！')
    router.push('/forum')
  } catch (e) { alert('发布失败: ' + e.message) }
  finally { loading.value = false }
}
</script>
