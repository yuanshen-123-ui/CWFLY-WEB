<template>
  <div class="ctrl-list fade-in">
    <div class="ctrl-list__inner">
      <div class="page-header">
        <h1>管制员列表</h1>
        <p>按 CID 数字大小排序</p>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>CID</th>
                <th>用户名</th>
                <th>管制级别</th>
                <th>所属部门</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in sortedList" :key="c.cid">
                <td class="font-bold">{{ c.cid }}</td>
                <td>{{ c.name }}</td>
                <td>{{ c.rating }}</td>
                <td>{{ c.department }}</td>
                <td><span class="badge" :class="c.online ? 'badge-success' : 'badge-default'">{{ c.online ? '在线' : '离线' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!sortedList.length" class="p-lg text-center text-muted">暂无管制员数据</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { controllersApi } from '@/api'

const list = ref([])

const sortedList = computed(() =>
  [...list.value].sort((a, b) => a.cid - b.cid)
)

onMounted(async () => {
  try {
    const res = await controllersApi.list()
    list.value = res.data
  } catch { /* ignore */ }
})
</script>

<style scoped>
.ctrl-list__inner { max-width: 860px; margin: 0 auto; padding: 0 24px; }
</style>
