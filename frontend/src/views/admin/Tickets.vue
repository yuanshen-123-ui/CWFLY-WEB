<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>工单管理</h1>
        <p>处理用户提交的工单和反馈</p>
      </div>
      <div class="flex gap-sm items-center">
        <SelectMenu v-model="filterStatus" :options="[{ value: 'open', label: '待处理' }, { value: 'in_progress', label: '处理中' }, { value: 'resolved', label: '已解决' }, { value: 'closed', label: '已关闭' }]" placeholder="全部状态" style="width:140px;" @change="load()" />
      </div>
    </div>

    <div class="card">
      <!-- 加载态 Skeleton / 空态 EmptyState，表格仅在数据就绪时渲染 -->
      <div v-if="loading" class="p-lg" aria-busy="true" aria-label="正在加载工单列表">
        <Skeleton :lines="6" :height="16" />
      </div>
      <div v-else-if="!list.length" class="p-md">
        <EmptyState icon="ticket" title="暂无工单" description="当前筛选条件下没有工单，用户提交后会出现在这里。" />
      </div>
      <div v-else class="table-wrap">
        <table v-sort="{ index: 8, desc: true }">
          <thead>
            <tr>
              <th>ID</th>
              <th>CID</th>
              <th>标题</th>
              <th>分类</th>
              <th>优先级</th>
              <th>内容</th>
              <th>负责人</th>
              <th>状态</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in list" :key="t.id">
              <td>{{ t.id }}</td>
              <td class="font-bold">{{ t.userId }}</td>
              <td class="font-bold truncate" style="max-width:150px;">{{ t.title }}</td>
              <td><span class="badge badge-info">{{ categoryLabel(t.category) }}</span></td>
              <td>
                <span class="badge" :class="priorityBadge(t.priority)">{{ priorityLabel(t.priority) }}</span>
              </td>
              <td class="text-sm text-muted truncate" style="max-width:180px;">{{ t.content }}</td>
              <td class="text-sm truncate" style="max-width:100px;">{{ t.assignee || '-' }}</td>
              <td>
                <span v-if="editing === t.id">
                  <SelectMenu v-model="editStatus" :options="[{ value: 'open', label: '待处理' }, { value: 'in_progress', label: '处理中' }, { value: 'resolved', label: '已解决' }, { value: 'closed', label: '已关闭' }]" style="width:120px;" @change="saveStatus(t)" />
                </span>
                <span v-else class="badge" :class="statusBadge(t.status)" style="cursor:pointer;" @click="startEdit(t)">{{ statusLabel(t.status) }}</span>
              </td>
              <td class="text-muted text-sm">{{ t.createdAt }}</td>
              <td>
                <div class="flex gap-xs">
                  <button class="btn btn-outline btn-sm" @click="openReply(t)">回复</button>
                  <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delTicket(t)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!loading && list.length && total > pageSize" class="flex justify-center gap-sm p-md" style="border-top:1px solid var(--c-border-light);">
        <button class="btn btn-outline btn-sm" :disabled="page <= 1" @click="page--;load()">上一页</button>
        <span class="text-sm text-muted" style="display:flex;align-items:center;">第 {{ page }} / {{ maxPage }} 页</span>
        <button class="btn btn-outline btn-sm" :disabled="page >= maxPage" @click="page++;load()">下一页</button>
      </div>
    </div>

    <!-- 回复对话框：AppModal 统一 Teleport / Esc / 焦点迁移与还原 / 滚动锁 -->
    <AppModal
      :open="!!replyTarget"
      :title="replyTarget ? `回复工单 #${replyTarget.id} - ${replyTarget.title}` : '回复工单'"
      width="560px"
      @update:open="(v) => { if (!v) closeReply() }"
    >
      <template v-if="replyTarget">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">回复内容</label>
          <textarea v-model="replyText" class="input" rows="4" placeholder="输入回复内容..." style="resize:vertical;"></textarea>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">负责人</label>
          <SelectMenu v-model="replyAssignee" :options="staffList.map((s) => ({ value: s.name, label: `${s.name} (${s.department})` }))" placeholder="-- 请选择负责人 --" />
        </div>
      </template>
      <template #footer>
        <button class="btn btn-outline" @click="closeReply">取消</button>
        <button class="btn btn-primary" @click="submitReply">提交回复</button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '@/api'
import AppModal from '@/components/base/AppModal.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import Skeleton from '@/components/base/Skeleton.vue'

const list = ref([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = 20
const filterStatus = ref('')
const editing = ref(null)
const editStatus = ref('')
const replyTarget = ref(null)
const replyText = ref('')
const replyAssignee = ref('')
const staffList = ref([])

const maxPage = computed(() => Math.ceil(total.value / pageSize) || 1)

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

onMounted(() => {
  load()
  loadStaff()
})

async function loadStaff() {
  try {
    const res = await adminApi.staff()
    staffList.value = res.data || []
  } catch { /* ignore */ }
}

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize }
    if (filterStatus.value) params.status = filterStatus.value
    const res = await adminApi.tickets(params)
    list.value = res.data.items
    total.value = res.data.total
    sortTickets()
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

function startEdit(t) {
  editing.value = t.id
  editStatus.value = t.status
}

async function saveStatus(t) {
  try {
    await adminApi.updateTicket(t.id, { status: editStatus.value })
    t.status = editStatus.value
    editing.value = null
  } catch (e) { alert(e.message) }
}

function openReply(t) {
  replyTarget.value = t
  replyText.value = t.reply || ''
  replyAssignee.value = t.assignee || ''
}

function closeReply() {
  replyTarget.value = null
}

async function submitReply() {
  if (!replyText.value) return alert('请输入回复内容')
  try {
    await adminApi.updateTicket(replyTarget.value.id, {
      reply: replyText.value,
      assignee: replyAssignee.value,
      status: 'in_progress'
    })
    replyTarget.value.reply = replyText.value
    replyTarget.value.assignee = replyAssignee.value
    replyTarget.value.status = 'in_progress'
    replyTarget.value = null
    replyText.value = ''
    replyAssignee.value = ''
    alert('回复已提交')
  } catch (e) { alert(e.message) }
}

async function delTicket(t) {
  if (!confirm(`确定删除工单 "${t.title}"？`)) return
  try {
    await adminApi.deleteTicket(t.id)
    list.value = list.value.filter(x => x.id !== t.id)
    total.value--
    sortTickets()
  } catch (e) { alert(e.message) }
}

// 工单自动排序：待处理/处理中在前，再按 ID 倒序
const TICKET_STATUS_ORDER = { open: 0, in_progress: 1, resolved: 2, closed: 3 }
function sortTickets() {
  list.value = [...list.value].sort((a, b) => {
    const sa = TICKET_STATUS_ORDER[a.status] ?? 9
    const sb = TICKET_STATUS_ORDER[b.status] ?? 9
    if (sa !== sb) return sa - sb
    return (b.id ?? 0) - (a.id ?? 0)
  })
}
</script>
