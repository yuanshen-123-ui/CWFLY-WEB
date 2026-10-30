<template>
  <div class="feedback fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>投诉与反馈中心</h1>
        <p>向我们提出您的意见或投诉</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showForm = true">+ 提交反馈</button>
    </div>

    <!-- 提交表单弹窗 -->
    <Teleport to="body">
      <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
        <div class="modal card" style="max-width:520px;">
          <div class="modal__header flex justify-between items-center p-md" style="border-bottom:1px solid var(--c-border-light);">
            <h3>提交反馈</h3>
            <button class="btn btn-outline btn-sm" @click="showForm = false">&times;</button>
          </div>
          <form @submit.prevent="submitFeedback" class="p-md">
            <div class="mb-md">
              <label class="text-sm font-bold mb-sm" style="display:block;">标题</label>
              <input v-model="fb.title" class="input" placeholder="反馈标题" required />
            </div>
            <div class="mb-md">
              <label class="text-sm font-bold mb-sm" style="display:block;">类型</label>
              <select v-model="fb.type" class="input">
                <option value="投诉">投诉</option>
                <option value="建议">建议</option>
                <option value="咨询">咨询</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div class="mb-md">
              <label class="text-sm font-bold mb-sm" style="display:block;">内容</label>
              <textarea v-model="fb.content" class="input" rows="4" placeholder="详细描述..." required></textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-block" :disabled="fbLoading">{{ fbLoading ? '提交中...' : '提交' }}</button>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- 反馈列表 -->
    <div v-if="list.length" class="card">
      <div v-for="item in list" :key="item.id" class="p-md" style="border-bottom:1px solid var(--c-border-light);">
        <div class="flex justify-between items-start gap-sm">
          <div class="flex-1">
            <div class="flex items-center gap-sm mb-sm">
              <span class="font-bold">{{ item.title }}</span>
              <span class="badge" :class="item.type === '投诉' ? 'badge-danger' : item.type === '建议' ? 'badge-info' : 'badge-default'">{{ item.type }}</span>
            </div>
            <p class="text-sm text-secondary">{{ item.content }}</p>
            <p class="text-xs text-muted mt-sm">{{ item.time }}</p>
          </div>
          <span class="badge" :class="item.status === '已回复' ? 'badge-success' : 'badge-warning'">{{ item.status }}</span>
        </div>
      </div>
    </div>
    <div v-else class="card p-lg text-center text-muted">暂无反馈记录</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { feedbackApi } from '@/api'

const showForm = ref(false)
const fbLoading = ref(false)
const list = ref([])
const fb = ref({ title: '', type: '投诉', content: '' })

onMounted(async () => {
  try {
    const res = await feedbackApi.list()
    list.value = res.data
  } catch { /* ignore */ }
})

async function submitFeedback() {
  fbLoading.value = true
  try {
    const res = await feedbackApi.create(fb.value)
    list.value.unshift(res.data)
    showForm.value = false
    fb.value = { title: '', type: '投诉', content: '' }
  } catch (e) {
    alert(e.message)
  } finally {
    fbLoading.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.modal { width: 100%; }
textarea.input { resize: vertical; min-height: 100px; }
</style>
