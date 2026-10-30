<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>登录日志</h1>
      <p>查看用户登录记录</p>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table v-sort="{ index: 0, desc: true }">
          <thead>
            <tr>
              <th>ID</th>
              <th>CID</th>
              <th>用户名</th>
              <th>IP</th>
              <th>登录地点</th>
              <th>时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td>{{ log.id }}</td>
              <td class="font-bold">{{ log.cid }}</td>
              <td>{{ log.username }}</td>
              <td class="text-muted text-sm">{{ log.ip }}</td>
              <td class="text-muted text-sm">{{ log.loginLocation || '-' }}</td>
              <td class="text-muted text-sm">{{ log.time }}</td>
              <td>
                <span class="badge" :class="log.success ? 'badge-success' : 'badge-danger'">
                  {{ log.success ? '成功' : '失败' }}
                </span>
              </td>
            </tr>
            <tr v-if="!logs.length">
              <td colspan="7" class="text-center text-muted">暂无日志</td>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '@/api'

const logs = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const maxPage = computed(() => Math.ceil(total.value / pageSize) || 1)

onMounted(() => load())

async function load() {
  try {
    const res = await adminApi.loginLogs({ page: page.value, pageSize })
    logs.value = res.data.items
    total.value = res.data.total
  } catch { /* ignore */ }
}
</script>
