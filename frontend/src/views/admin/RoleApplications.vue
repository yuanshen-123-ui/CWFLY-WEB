<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>角色变更申请</h1>
      <p>审批用户角色升级申请</p>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table v-sort="{ index: 0, desc: true }">
          <thead>
            <tr>
              <th>ID</th>
              <th>CID</th>
              <th>用户名</th>
              <th>当前角色</th>
              <th>目标角色</th>
              <th>理由</th>
              <th>时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in list" :key="a.id">
              <td>{{ a.id }}</td>
              <td class="font-bold">{{ a.cid }}</td>
              <td>{{ a.username }}</td>
              <td><span class="badge badge-default">{{ a.currentRole }}</span></td>
              <td><span class="badge badge-warning">{{ a.targetRole }}</span></td>
              <td class="text-sm text-muted" style="max-width:200px;">{{ a.reason }}</td>
              <td class="text-muted text-sm">{{ a.time }}</td>
              <td><span class="badge" :class="statusBadge(a.status)">{{ a.status }}</span></td>
              <td>
                <div v-if="a.status === '待审核'" class="flex gap-sm">
                  <button class="btn btn-primary btn-sm" @click="approve(a)">通过</button>
                  <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="reject(a)">拒绝</button>
                </div>
                <span v-else class="text-muted text-sm">已处理</span>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="9" class="text-center text-muted">暂无申请</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '@/api'

const list = ref([])

function statusBadge(s) {
  return s === '待审核' ? 'badge-warning' : s === '已通过' ? 'badge-success' : 'badge-danger'
}

onMounted(async () => {
  try {
    const res = await adminApi.roleApplications()
    list.value = res.data
  } catch { /* ignore */ }
})

async function approve(a) {
  try {
    await adminApi.updateRoleApp(a.id, { status: '已通过' })
    a.status = '已通过'
  } catch (e) { alert(e.message) }
}

async function reject(a) {
  try {
    await adminApi.updateRoleApp(a.id, { status: '已拒绝' })
    a.status = '已拒绝'
  } catch (e) { alert(e.message) }
}
</script>
