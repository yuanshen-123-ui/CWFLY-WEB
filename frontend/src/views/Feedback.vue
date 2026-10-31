<template>
  <div class="feedback fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>投诉与反馈中心</h1>
        <p>向我们提出您的意见或投诉</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showForm = true">+ 提交反馈</button>
    </div>

    <!-- 提交表单弹窗：AppModal 统一 Teleport / Esc / 焦点迁移与还原 / 滚动锁 -->
    <AppModal v-model:open="showForm" title="提交反馈" width="520px">
      <form @submit.prevent="submitFeedback">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">标题</label>
          <input v-model="fb.title" class="input" placeholder="反馈标题" required />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">类型</label>
          <SelectMenu v-model="fb.type" :options="[{ value: '投诉', label: '投诉' }, { value: '建议', label: '建议' }, { value: '咨询', label: '咨询' }, { value: '其他', label: '其他' }]" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">内容</label>
          <textarea v-model="fb.content" class="input" rows="4" placeholder="详细描述..." required></textarea>
        </div>
        <div class="flex gap-sm">
          <button type="button" class="btn btn-outline" @click="showForm = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="fbLoading">{{ fbLoading ? '提交中...' : '提交' }}</button>
        </div>
      </form>
    </AppModal>

    <!-- 反馈列表：加载态 Skeleton / 空态 EmptyState -->
    <div v-if="loading" class="card p-lg" aria-busy="true" aria-label="正在加载反馈记录">
      <Skeleton :lines="5" :height="16" />
    </div>
    <div v-else-if="!list.length" class="card p-lg">
      <EmptyState
        icon="inbox"
        title="暂无反馈记录"
        description="提交反馈后可在这里查看处理进度与回复。"
        action-text="+ 提交反馈"
        @action="showForm = true"
      />
    </div>
    <div v-else class="card">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { feedbackApi } from '@/api'
import AppModal from '@/components/base/AppModal.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import Skeleton from '@/components/base/Skeleton.vue'

const showForm = ref(false)
const fbLoading = ref(false)
const loading = ref(false)
const list = ref([])
const fb = ref({ title: '', type: '投诉', content: '' })

onMounted(async () => {
  loading.value = true
  try {
    const res = await feedbackApi.list()
    list.value = res.data
  } catch { /* ignore */ } finally {
    loading.value = false
  }
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
/* 弹窗外壳（遮罩/卡片/标题）由 base/AppModal.vue 统一提供，这里只保留表单控件排版 */
textarea.input { resize: vertical; min-height: 100px; }
</style>
