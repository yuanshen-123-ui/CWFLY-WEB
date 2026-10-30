<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>网络日志</h1>
      <p>每 10 分钟记录窗口内访问 IP / 指纹 / 请求次数</p>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="network-table" v-sort="{ index: 2, desc: true }">
          <thead>
            <tr>
              <th>IP</th>
              <th>匹配CID</th>
              <th>访问指纹</th>
              <th>请求次数</th>
              <th>最近访问</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.ip + '|' + log.windowStart">
              <td class="font-bold">{{ log.ip }}</td>
              <td class="net-cid">{{ log.displayCid || '-' }}</td>
              <td class="text-muted text-sm net-fp">{{ log.deviceFp || '-' }}</td>
              <td class="net-count">{{ log.count }}</td>
              <td class="text-muted text-sm">{{ log.lastSeen }}</td>
            </tr>
            <tr v-if="!logs.length"><td colspan="5" class="text-center text-muted">暂无网络记录</td></tr>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { adminApi } from '@/api'

const logs = ref([]) // 平铺行: [{ ip, deviceFp, count, windowStart, lastSeen }]
const total = ref(0)
const page = ref(1)
const pageSize = 50
let refreshTimer = null

const maxPage = computed(() => Math.ceil(total.value / pageSize) || 1)

onMounted(() => {
  load()
  refreshTimer = setInterval(load, 60000) // 1 分钟自动刷新
})

onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })

async function load() {
  try {
    const res = await adminApi.networkLogs({ page: page.value, pageSize })
    const items = res.data.items || []
    // 匹配CID去重：同一 IP 多行(不同窗口)只在该 IP 首次出现时显示 CID，避免重复显示
    const shownIp = new Set()
    for (const it of items) {
      if (it.cid && !shownIp.has(it.ip)) {
        shownIp.add(it.ip)
        it.displayCid = it.cid
      } else {
        it.displayCid = ''
      }
    }
    logs.value = items
    total.value = res.data.total || 0
  } catch { /* ignore */ }
}
</script>

<style scoped>
/* 全局 .table-wrap table 是 table-layout:fixed, 需给每列设明确宽度才会生效 */
.network-table { width: 100%; table-layout: fixed; }
.network-table th:nth-child(1), .network-table td:nth-child(1) { width: 110px; }  /* IP */
.network-table th:nth-child(2), .network-table td:nth-child(2) { width: 140px; }  /* 匹配CID 加宽 */
.network-table th:nth-child(3), .network-table td:nth-child(3) { width: 230px; }  /* 访问指纹 */
.network-table th:nth-child(4), .network-table td:nth-child(4) { width: 70px; }   /* 请求次数 */
.network-table th:nth-child(5), .network-table td:nth-child(5) { width: 170px; }  /* 最近访问 */
.network-table td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
