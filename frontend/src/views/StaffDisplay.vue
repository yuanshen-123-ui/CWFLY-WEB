<template>
  <div class="staff-display fade-in">
    <div class="page-header">
      <h1>职员公示</h1>
      <p>按部门展示平台职员信息</p>
    </div>

    <div class="mb-lg flex gap-sm flex-wrap">
      <button
        v-for="d in departments"
        :key="d"
        class="btn"
        :class="activeDept === d ? 'btn-primary' : 'btn-outline'"
        @click="activeDept = d"
      >{{ d }}</button>
    </div>

    <div v-if="filteredList.length" class="card">
      <div class="table-wrap">
        <table v-sort>
          <thead><tr><th>CID</th><th>用户名</th><th>部门</th><th>职务</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="s in filteredList" :key="s.cid">
              <td class="font-bold">{{ s.cid }}</td>
              <td>{{ s.name }}</td>
              <td>{{ s.department }}</td>
              <td>{{ s.position }}</td>
              <td><span class="badge" :class="s.active ? 'badge-success' : 'badge-default'">{{ s.active ? '在职' : '离职' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-else class="card p-lg text-center text-muted">该部门暂无职员信息</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { staffApi } from '@/api'

const list = ref([])
const activeDept = ref('全部')

const departments = computed(() => {
  const set = new Set(list.value.map(s => s.department))
  return ['全部', ...set]
})

const filteredList = computed(() =>
  activeDept.value === '全部' ? list.value : list.value.filter(s => s.department === activeDept.value)
)

onMounted(async () => {
  try {
    const res = await staffApi.list({ type: 'all' })
    list.value = res.data
  } catch { /* ignore */ }
})
</script>
