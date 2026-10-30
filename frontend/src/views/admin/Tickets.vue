<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>工单管理</h1>
        <p>处理用户提交的工单和反馈</p>
      </div>
      <div class="flex gap-sm items-center">
        <select v-model="filterStatus" class="input" style="width:140px;" @change="load()">
          <option value="">全部状态</option>
          <option value="open">待处理</option>
          <option value="in_progress">处理中</option>
          <option value="resolved">已解决</option>
          <option value="closed">已关闭</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
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
                  <select v-model="editStatus" class="input" style="width:120px;" @change="saveStatus(t)">
                    <option value="open">待处理</option>
                    <option value="in_progress">处理中</option>
                    <option value="resolved">已解决</option>
                    <option value="closed">已关闭</option>
                  </select>
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
            <tr v-if="!list.length">
              <td colspan="10" class="text-center text-muted">暂无工单</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="total > pageSize" class="flex justify-center gap-sm p-md" style="border-top:1px solid var(--c-border-light);">
        <button class="btn btn-outline btn-sm" :disabled="page <= 1" @click="page--;load()">上一页</button>
        <span class="text-sm text-muted" style="display:flex;align-items:center;">第 {{ page }} / {{ maxPage }} 页</span>
        <button class="btn btn-outline btn-sm" :disabled="page >= maxPage" @click="page++;load()">下一页</button>
      </div>
    </div>

    <!-- 回复对话框 -->
    <div v-if="replyTarget" class="modal-overlay" @click.self="replyTarget=null">
      <div class="modal card p-lg">
        <h3 class="mb-md">回复工单 #{{ replyTarget.id }} - {{ replyTarget.title }}</h3>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">回复内容</label>
          <textarea v-model="replyText" class="input" rows="4" placeholder="输入回复内容..." style="resize:vertical;"></textarea>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">负责人</label>
          <select v-model="replyAssignee" class="input">
            <option value="">-- 请选择负责人 --</option>
            <option v-for="s in staffList" :key="s.cid" :value="s.name">
              {{ s.name }} ({{ s.department }})
            </option>
          </select>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitReply">提交回复</button>
          <button class="btn btn-outline" @click="replyTarget=null">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '@/api'

const list = ref([])
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
  try {
    const params = { page: page.value, pageSize }
    if (filterStatus.value) params.status = filterStatus.value
    const res = await adminApi.tickets(params)
    list.value = res.data.items
    total.value = res.data.total
    sortTickets()
  } catch { /* ignore */ }
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

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 560px;
  max-width: 90vw;
}
</style>
