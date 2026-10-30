<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>删除审批</h1>
      <p>审批非超管提交的用户删除 / 删除+封禁请求</p>
    </div>

    <div v-if="!isSuperAdmin" class="card p-lg text-center text-muted">
      仅超级管理员可查看并审批删除请求。
    </div>

    <div v-else class="card p-lg">
      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>ID</th>
              <th>目标用户</th>
              <th>操作</th>
              <th>待封禁 IP</th>
              <th>原因</th>
              <th>申请人</th>
              <th>状态</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in requests" :key="r.id">
              <td>{{ r.id }}</td>
              <td>{{ r.username || '-' }}<span class="text-muted text-sm"> ({{ r.cid }})</span></td>
              <td>
                <span class="badge" :class="r.action === 'delete_ban' ? 'badge-danger' : 'badge-warning'">{{ r.action === 'delete_ban' ? '删除+封禁' : '仅删除' }}</span>
              </td>
              <td class="font-mono text-sm">{{ r.ips || '-' }}</td>
              <td class="text-sm">{{ r.reason || '-' }}</td>
              <td>{{ r.requestedName || r.requestedBy || '-' }}</td>
              <td>
                <span class="badge" :class="statusBadge(r.status)">{{ statusText(r.status) }}</span>
              </td>
              <td class="text-sm">{{ r.createdAt }}</td>
              <td>
                <template v-if="r.status === 'pending'">
                  <div class="flex gap-sm">
                    <button class="btn btn-primary btn-sm" @click="approve(r)">批准</button>
                    <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="reject(r)">拒绝</button>
                  </div>
                </template>
                <span v-else class="text-muted text-sm">{{ r.reviewedAt ? r.reviewedAt : '—' }}</span>
              </td>
            </tr>
            <tr v-if="!requests.length">
              <td colspan="9" class="text-center text-muted">暂无删除审批</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '@/api'
import { useUserStore } from '@/store/user'

/** 当前登录用户信息（判断是否超管） */
const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.rating >= 12)

const requests = ref([])

const STATUS = { pending: '待审批', approved: '已批准', rejected: '已拒绝' }
function statusText(s) { return STATUS[s] || s || '-' }
function statusBadge(s) {
  if (s === 'approved') return 'badge-success'
  if (s === 'rejected') return 'badge-danger'
  return 'badge-warning'
}

/**
 * loadRequests()
 * 作用：拉取删除审批列表。
 * 调用时机：页面加载 / 批准拒绝后刷新时触发。
 */
async function loadRequests() {
  try { const r = await adminApi.userDeletionRequests(); requests.value = r.data || [] } catch { /* ignore */ }
}

/**
 * approve(r)
 * 作用：批准删除审批（后端执行删除/封禁）。
 * 调用时机：点击「批准」按钮时触发。
 */
async function approve(r) {
  if (!confirm(`批准删除用户 ${r.username || r.cid}${r.action === 'delete_ban' ? ' 并封禁 ' + r.ips : ''}？`)) return
  try {
    await adminApi.approveUserDeletionRequest(r.id)
    loadRequests()
  } catch (e) { alert('操作失败: ' + e.message) }
}

/**
 * reject(r)
 * 作用：拒绝删除审批。
 * 调用时机：点击「拒绝」按钮时触发。
 */
async function reject(r) {
  if (!confirm(`拒绝删除用户 ${r.username || r.cid} 的请求？`)) return
  try {
    await adminApi.rejectUserDeletionRequest(r.id)
    loadRequests()
  } catch (e) { alert('操作失败: ' + e.message) }
}

onMounted(() => { if (isSuperAdmin.value) loadRequests() })
</script>

<style scoped>
</style>
