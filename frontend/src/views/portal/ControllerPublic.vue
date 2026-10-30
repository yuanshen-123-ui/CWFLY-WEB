<template>
  <div class="ctrl-public fade-in">
    <div class="ctrl-public__inner">
      <div class="page-header">
        <h1>管制员公示</h1>
        <p>按部门展示管制员信息</p>
      </div>

      <div v-for="(group, dept) in grouped" :key="dept" class="mb-lg">
        <h3 class="mb-md">{{ dept }} <span class="text-muted text-sm">({{ group.length }} 人)</span></h3>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>CID</th><th>用户名</th><th>管制级别</th><th>状态</th></tr>
              </thead>
              <tbody>
                <tr v-for="c in group" :key="c.cid">
                  <td class="font-bold">{{ c.cid }}</td>
                  <td>{{ c.name }}</td>
                  <td>{{ c.rating }}</td>
                  <td><span class="badge" :class="c.online ? 'badge-success' : 'badge-default'">{{ c.online ? '在线' : '离线' }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="!Object.keys(grouped).length" class="card p-lg text-center text-muted">
        暂无公示数据
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { staffApi } from '@/api'

const list = ref([])

const grouped = computed(() => {
  const map = {}
  list.value.forEach(c => {
    const d = c.department || '未分配'
    if (!map[d]) map[d] = []
    map[d].push(c)
  })
  return map
})

onMounted(async () => {
  try {
    const res = await staffApi.list({ type: 'controller' })
    list.value = res.data
  } catch { /* ignore */ }
})
</script>

<style scoped>
.ctrl-public__inner { max-width: 860px; margin: 0 auto; padding: 0 24px; }
</style>
