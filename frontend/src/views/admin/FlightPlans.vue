<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>飞行计划管理</h1>
        <p>管理所有用户的飞行计划</p>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table v-sort="{ index: 1 }">
          <thead>
            <tr>
              <th>ID</th>
              <th>CID</th>
              <th>呼号</th>
              <th>机型</th>
              <th>离场</th>
              <th>到达</th>
              <th>类型</th>
              <th>航路</th>
              <th>FSD</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in list" :key="p.id">
              <td>{{ p.id }}</td>
              <td class="font-bold">{{ p.userId }}</td>
              <td class="font-bold">{{ p.callsign }}</td>
              <td>{{ p.aircraft || '-' }}</td>
              <td>{{ p.depIcao }}</td>
              <td>{{ p.arrIcao }}</td>
              <td><span class="badge badge-info">{{ p.flightType }}</span></td>
              <td class="text-sm text-muted truncate" style="max-width:160px;">{{ p.route || '-' }}</td>
              <td>
                <span class="badge" :class="p.syncFsd ? 'badge-success' : 'badge-default'">
                  {{ p.syncFsd ? '已同步' : '未同步' }}
                </span>
              </td>
              <td class="text-muted text-sm">{{ p.filedAt }}</td>
              <td>
                <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delPlan(p)">删除</button>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="11" class="text-center text-muted">暂无飞行计划</td>
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

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const maxPage = computed(() => Math.ceil(total.value / pageSize) || 1)

onMounted(() => load())

async function load() {
  try {
    const res = await adminApi.flightplans({ page: page.value, pageSize })
    list.value = res.data.items
    total.value = res.data.total
  } catch { /* ignore */ }
}

async function delPlan(p) {
  if (!confirm(`确定删除 ${p.callsign} 的飞行计划？`)) return
  try {
    await adminApi.deleteFlightplan(p.id)
    list.value = list.value.filter(x => x.id !== p.id)
    total.value--
  } catch (e) { alert(e.message) }
}
</script>
