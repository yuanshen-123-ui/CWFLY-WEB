<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>工单中心</h1>
        <p>提交工单寻求帮助或反馈问题</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showForm=true">+ 新建工单</button>
    </div>

    <!-- 新建工单表单 -->
    <div v-if="showForm" class="card p-lg mb-lg fade-in">
      <h3 class="mb-md">新建工单</h3>
      <div style="max-width:600px;">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">标题</label>
          <input v-model="form.title" class="input" placeholder="工单标题" />
        </div>
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">分类</label>
            <SelectMenu v-model="form.category" :options="[{ value: 'general', label: '通用咨询' }, { value: 'technical', label: '技术支持' }, { value: 'account', label: '账号问题' }, { value: 'feedback', label: '意见建议' }, { value: 'complaint', label: '投诉' }, { value: 'other', label: '其他' }]" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">优先级</label>
            <SelectMenu v-model="form.priority" :options="[{ value: 'low', label: '低' }, { value: 'normal', label: '普通' }, { value: 'high', label: '高' }, { value: 'urgent', label: '紧急' }]" />
          </div>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">内容</label>
          <textarea v-model="form.content" class="input" rows="6" placeholder="详细描述你的问题或建议..." style="resize:vertical;"></textarea>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitTicket" :disabled="submitting">
            {{ submitting ? '提交中...' : '提交工单' }}
          </button>
          <button class="btn btn-outline" @click="showForm=false;resetForm()">取消</button>
        </div>
      </div>
    </div>

    <!-- 工单列表 -->
    <div class="card">
      <div class="p-md" style="border-bottom:1px solid var(--c-border-light);">
        <h3 class="font-bold">我的工单</h3>
      </div>
      <!-- 加载态 Skeleton / 空态 EmptyState；表格仅在数据就绪时渲染 -->
      <div v-if="loading" class="p-lg" aria-busy="true" aria-label="正在加载我的工单">
        <Skeleton :lines="5" :height="16" />
      </div>
      <div v-else-if="!list.length" class="p-md">
        <EmptyState
          icon="ticket"
          title="暂无工单"
          description="提交工单后可以在这里跟踪处理进度。"
          action-text="+ 新建工单"
          @action="showForm = true"
        />
      </div>
      <div v-else class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>分类</th>
              <th>优先级</th>
              <th>状态</th>
              <th>回复</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in list" :key="t.id">
              <td>{{ t.id }}</td>
              <td class="font-bold">{{ t.title }}</td>
              <td><span class="badge badge-info">{{ categoryLabel(t.category) }}</span></td>
              <td><span class="badge" :class="priorityBadge(t.priority)">{{ priorityLabel(t.priority) }}</span></td>
              <td><span class="badge" :class="statusBadge(t.status)">{{ statusLabel(t.status) }}</span></td>
              <td class="text-sm text-muted" style="max-width:200px;">{{ t.reply || '等待回复' }}</td>
              <td class="text-muted text-sm">{{ t.createdAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ticketApi } from '@/api'
import EmptyState from '@/components/base/EmptyState.vue'
import Skeleton from '@/components/base/Skeleton.vue'

const list = ref([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)
const form = ref({
  title: '', category: 'general', priority: 'normal', content: ''
})

function statusBadge(s) {
  return s === 'open' ? 'badge-warning' : s === 'in_progress' ? 'badge-info' : s === 'resolved' ? 'badge-success' : 'badge-default'
}
function statusLabel(s) {
  return s === 'open' ? '待处理' : s === 'in_progress' ? '处理中' : s === 'resolved' ? '已解决' : '已关闭'
}
function priorityBadge(p) {
  return p === 'urgent' ? 'badge-danger' : p === 'high' ? 'badge-warning' : p === 'normal' ? 'badge-info' : 'badge-default'
}
function priorityLabel(p) {
  return p === 'urgent' ? '紧急' : p === 'high' ? '高' : p === 'normal' ? '普通' : '低'
}
function categoryLabel(c) {
  const map = { general: '通用', technical: '技术', account: '账号', feedback: '反馈', complaint: '投诉', other: '其他' }
  return map[c] || c
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await ticketApi.list()
    list.value = res.data
  } catch { /* ignore */ } finally {
    loading.value = false
  }
})

function resetForm() {
  form.value = { title: '', category: 'general', priority: 'normal', content: '' }
}

async function submitTicket() {
  if (!form.value.title || !form.value.content) return alert('请填写标题和内容')
  submitting.value = true
  try {
    const res = await ticketApi.create(form.value)
    list.value.unshift(res.data)
    showForm.value = false
    resetForm()
    alert('工单已提交，请等待回复')
  } catch (e) {
    alert('提交失败: ' + e.message)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
@media (max-width: 640px) {
  .form-row { grid-template-columns: 1fr; }
}
.form-col { display: flex; flex-direction: column; }
</style>
