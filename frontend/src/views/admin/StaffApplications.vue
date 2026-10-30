<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>职员申请管理</h1>
      <p>审核用户提交的职员申请</p>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table v-sort="{ index: 5, desc: true }">
          <thead>
            <tr>
              <th>ID</th>
              <th>CID</th>
              <th>用户名</th>
              <th>申请部门</th>
              <th>理由</th>
              <th>时间</th>
              <th>面试时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in list" :key="a.id">
              <td>{{ a.id }}</td>
              <td class="font-bold">{{ a.userId }}</td>
              <td>{{ a.name }}</td>
              <td>{{ a.department || '-' }}</td>
              <td class="text-sm text-muted" style="max-width:200px;" :title="a.reason">{{ a.reason }}</td>
              <td class="text-muted text-sm" :title="a.time">{{ a.time }}</td>
              <td class="text-sm" :title="interviewTitle(a)">
                <span v-if="a.interviewTime1 || a.interviewTime2" class="text-muted">
                  {{ a.interviewTime1 ? '①' + a.interviewTime1 : '' }}<br v-if="a.interviewTime1 && a.interviewTime2" />
                  {{ a.interviewTime2 ? '②' + a.interviewTime2 : '' }}
                </span>
                <span v-else class="text-muted">-</span>
              </td>
              <td><span class="badge" :class="statusBadge(a.status)">{{ a.status }}</span></td>
              <td>
                <div class="flex gap-sm">
                  <button class="btn btn-outline btn-sm" @click="detailTarget = a">详情</button>
                  <template v-if="a.status === '待审核'">
                    <button class="btn btn-primary btn-sm" @click="openInterview(a)">审核</button>
                    <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="reject(a)">拒绝</button>
                  </template>
                  <button v-else class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delApp(a)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="9" class="text-center text-muted">暂无申请</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 面试时间设置弹窗 -->
    <div v-if="interviewTarget" class="modal-overlay" @click.self="interviewTarget=null">
      <div class="modal card p-lg">
        <h3 class="mb-md">审核申请 - {{ interviewTarget.name }}</h3>
        <p class="text-sm text-muted mb-md">设置两个可选的面试时间</p>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">面试时间①</label>
          <input v-model="interviewTime1" class="input" type="datetime-local" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">面试时间②</label>
          <input v-model="interviewTime2" class="input" type="datetime-local" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">审批理由</label>
          <textarea v-model="reviewComment" class="input" rows="3" placeholder="填写审批理由（用户将收到此理由）"></textarea>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="confirmApprove">通过并发送面试邀请</button>
          <button class="btn btn-outline" @click="interviewTarget=null">取消</button>
        </div>
      </div>
    </div>

    <!-- 拒绝理由弹窗 -->
    <div v-if="rejectTarget" class="modal-overlay" @click.self="rejectTarget=null">
      <div class="modal card p-lg" style="max-width:680px;">
        <h3 class="mb-md">拒绝申请 - {{ rejectTarget.name }}</h3>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">拒绝理由 <span style="color:var(--c-danger);">*</span></label>
          <textarea v-model="rejectComment" class="input" rows="5" placeholder="请填写拒绝理由（用户将收到此理由）"></textarea>
        </div>
        <div class="flex gap-sm justify-end">
          <button class="btn btn-outline" @click="rejectTarget=null">取消</button>
          <button class="btn btn-danger" @click="confirmReject">确认拒绝</button>
        </div>
      </div>
    </div>
    <!-- 申请详情弹窗（表格列被 CSS 截断时查看完整内容） -->
    <div v-if="detailTarget" class="modal-overlay" @click.self="detailTarget=null">
      <div class="modal card p-lg" style="max-width:720px;">
        <h3 class="mb-md">申请详情 #{{ detailTarget.id }}</h3>
        <div class="detail-grid text-sm">
          <div><span class="detail-label">ID</span><span>{{ detailTarget.id }}</span></div>
          <div><span class="detail-label">CID</span><span class="font-bold">{{ detailTarget.userId }}</span></div>
          <div><span class="detail-label">用户名</span><span>{{ detailTarget.name }}</span></div>
          <div><span class="detail-label">申请部门</span><span>{{ detailTarget.department || '-' }}</span></div>
          <div><span class="detail-label">提交时间</span><span>{{ detailTarget.time || '-' }}</span></div>
          <div><span class="detail-label">状态</span><span class="badge" :class="statusBadge(detailTarget.status)">{{ detailTarget.status }}</span></div>
          <div><span class="detail-label">面试时间①</span><span>{{ detailTarget.interviewTime1 || '-' }}</span></div>
          <div><span class="detail-label">面试时间②</span><span>{{ detailTarget.interviewTime2 || '-' }}</span></div>
        </div>
        <div class="detail-block">
          <div class="detail-label">申请理由</div>
          <div class="detail-text">{{ detailTarget.reason || '（未填写）' }}</div>
        </div>
        <div v-if="detailTarget.reviewComment" class="detail-block">
          <div class="detail-label">审批理由</div>
          <div class="detail-text">{{ detailTarget.reviewComment }}</div>
        </div>
        <div class="flex gap-sm justify-end mt-md">
          <button class="btn btn-outline" @click="detailTarget=null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '@/api'

const list = ref([])
const interviewTarget = ref(null)
const interviewTime1 = ref('')
const interviewTime2 = ref('')
const reviewComment = ref('')
const rejectTarget = ref(null)
const rejectComment = ref('')
// 详情弹窗：查看被表格 CSS 截断的完整内容（理由/时间/面试时间等）
const detailTarget = ref(null)

/** 面试时间的悬停提示（①/② 两行） */
function interviewTitle(a) {
  const parts = []
  if (a.interviewTime1) parts.push('① ' + a.interviewTime1)
  if (a.interviewTime2) parts.push('② ' + a.interviewTime2)
  return parts.join('\n')
}

function statusBadge(s) {
  return s === '待审核' ? 'badge-warning' : s === '已通过' ? 'badge-success' : 'badge-danger'
}

onMounted(async () => {
  try {
    const res = await adminApi.staffApplications()
    list.value = res.data
    sortApps()
  } catch { /* ignore */ }
})

function openInterview(a) {
  interviewTarget.value = a
  interviewTime1.value = a.interviewTime1 || ''
  interviewTime2.value = a.interviewTime2 || ''
  reviewComment.value = a.reviewComment || ''
}

async function confirmApprove() {
  const a = interviewTarget.value
  try {
    await adminApi.updateStaffApp(a.id, {
      status: '已通过',
      interviewTime1: interviewTime1.value,
      interviewTime2: interviewTime2.value,
      reviewComment: reviewComment.value
    })
    a.status = '已通过'
    a.interviewTime1 = interviewTime1.value
    a.interviewTime2 = interviewTime2.value
    a.reviewComment = reviewComment.value
    interviewTarget.value = null
  } catch (e) { alert(e.message) }
}

function reject(a) {
  rejectTarget.value = a
  rejectComment.value = ''
}

async function confirmReject() {
  const a = rejectTarget.value
  if (!rejectComment.value.trim()) return alert('请填写拒绝理由')
  try {
    await adminApi.updateStaffApp(a.id, {
      status: '已拒绝',
      reviewComment: rejectComment.value
    })
    a.status = '已拒绝'
    a.reviewComment = rejectComment.value
    rejectTarget.value = null
  } catch (e) { alert(e.message) }
}

async function delApp(a) {
  if (!confirm('确定删除 ' + a.name + ' 的申请？')) return
  try {
    await adminApi.deleteStaffApp(a.id)
    list.value = list.value.filter(x => x.id !== a.id)
    sortApps()
  } catch (e) { alert(e.response?.data?.message || e.message) }
}

// 申请自动排序：待审核在前，再按 ID 倒序
const APP_STATUS_ORDER = { '待审核': 0, '已通过': 1, '已拒绝': 2 }
function sortApps() {
  list.value = [...list.value].sort((a, b) => {
    const sa = APP_STATUS_ORDER[a.status] ?? 9
    const sb = APP_STATUS_ORDER[b.status] ?? 9
    if (sa !== sb) return sa - sb
    return (b.id ?? 0) - (a.id ?? 0)
  })
}
</script>

<style scoped>
.table-wrap { overflow-x: auto; }
.table-wrap td { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table-wrap td.text-sm { max-width: 180px; }

/* ===== 申请详情弹窗 ===== */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  margin-bottom: 14px;
}
.detail-grid > div { display: flex; gap: 10px; min-width: 0; }
.detail-grid > div > span:last-child { word-break: break-word; }
.detail-label { color: var(--c-text-muted, #6b7280); }
.detail-grid .detail-label { flex: 0 0 84px; }
.detail-block { margin-bottom: 12px; }
.detail-block .detail-label { display: block; font-weight: 600; margin-bottom: 6px; }
.detail-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--c-bg-soft, rgba(128, 128, 128, .08));
  max-height: 280px;
  overflow: auto;
}
@media (max-width: 640px) { .detail-grid { grid-template-columns: 1fr; } }
</style>
