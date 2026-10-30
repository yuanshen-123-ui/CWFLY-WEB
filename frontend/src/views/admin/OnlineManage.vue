<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>在线管理</h1>
      <p>查看平台在线状态和 FSD 连飞网络实时数据</p>
    </div>

    <!-- FSD 在线统计 -->
    <div class="flex gap-md flex-wrap mb-lg">
      <div class="card p-md flex-1" style="min-width:150px;">
        <div class="text-sm text-muted mb-sm">FSD 在线机组</div>
        <div class="text-2xl font-bold" style="color:var(--c-primary);">{{ fsdPilots.length }}</div>
      </div>
      <div class="card p-md flex-1" style="min-width:150px;">
        <div class="text-sm text-muted mb-sm">FSD 在线管制</div>
        <div class="text-2xl font-bold" style="color:var(--c-success);">{{ fsdAtc.length }}</div>
      </div>
      <div class="card p-md flex-1" style="min-width:150px;">
        <div class="text-sm text-muted mb-sm">职员在线</div>
        <div class="text-2xl font-bold" style="color:var(--c-warning);">{{ onlineStaff.length }}</div>
      </div>
      <div class="card p-md flex-1" style="min-width:150px;">
        <div class="text-sm text-muted mb-sm">职员总数</div>
        <div class="text-2xl font-bold">{{ allStaff.length }}</div>
      </div>
    </div>

    <!-- FSD 实时在线 -->
    <div class="card mb-lg">
      <div class="p-md" style="border-bottom:1px solid var(--c-border-light);">
        <h3 class="font-bold">FSD 连飞网络在线</h3>
        <p class="text-sm text-muted mt-sm">实时从 FSD 服务器获取的在线用户数据</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>呼号</th>
              <th>CID</th>
              <th>类型</th>
              <th>机型/席位</th>
              <th>离场</th>
              <th>到达</th>
              <th>高度</th>
              <th>速度</th>
              <th>航向</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in fsdPilots.slice(0, 50)" :key="p.callsign + p.cid">
              <td class="font-bold">{{ p.callsign }}</td>
              <td>{{ p.cid }}</td>
              <td><span class="badge badge-info">飞行员</span></td>
              <td>{{ p.aircraft || '-' }}</td>
              <td>{{ p.dep_icao || '-' }}</td>
              <td>{{ p.arr_icao || '-' }}</td>
              <td>{{ p.altitude ? p.altitude + 'ft' : '-' }}</td>
              <td>{{ p.groundspeed ? p.groundspeed + 'kt' : '-' }}</td>
              <td>{{ p.heading ? p.heading + '°' : '-' }}</td>
            </tr>
            <tr v-for="a in fsdAtc.slice(0, 30)" :key="a.callsign + a.cid">
              <td class="font-bold">{{ a.callsign }}</td>
              <td>{{ a.cid }}</td>
              <td><span class="badge badge-warning">管制员</span></td>
              <td>{{ a.facility || '-' }}</td>
              <td colspan="2">{{ a.frequency || '-' }}</td>
              <td colspan="3">{{ a.atis || '-' }}</td>
            </tr>
            <tr v-if="!fsdPilots.length && !fsdAtc.length">
              <td colspan="9" class="text-center text-muted">暂无在线用户或 FSD 暂时不可用</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="fsdError" class="p-md text-center text-sm text-muted" style="border-top:1px solid var(--c-border-light);">
        <span class="badge badge-warning">FSD 连接状态：{{ fsdError }}</span>
        <button class="btn btn-outline btn-sm ml-md" @click="loadFsd">刷新</button>
      </div>
    </div>

    <!-- 职员工在线管理 -->
    <div class="card">
      <div class="p-md" style="border-bottom:1px solid var(--c-border-light);">
        <h3 class="font-bold">职员在线状态管理</h3>
        <p class="text-sm text-muted mt-sm">手动设置职员的在线状态</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CID</th>
              <th>姓名</th>
              <th>部门</th>
              <th>职位</th>
              <th>在职状态</th>
              <th>在线状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in allStaff" :key="s.cid">
              <td class="font-bold">{{ s.cid }}</td>
              <td>{{ s.name }}</td>
              <td>{{ s.department }}</td>
              <td>{{ s.position }}</td>
              <td>
                <span class="badge" :class="s.active ? 'badge-success' : 'badge-default'">
                  {{ s.active ? '在职' : '离职' }}
                </span>
              </td>
              <td>
                <span class="badge" :class="s.online ? 'badge-success' : 'badge-default'">
                  {{ s.online ? '在线' : '离线' }}
                </span>
              </td>
              <td>
                <button
                  class="btn btn-sm"
                  :class="s.online ? 'btn-outline' : 'btn-primary'"
                  @click="toggleOnline(s)"
                >
                  {{ s.online ? '设为离线' : '设为在线' }}
                </button>
              </td>
            </tr>
            <tr v-if="!allStaff.length">
              <td colspan="7" class="text-center text-muted">暂无职员数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { adminApi, flightplanApi } from '@/api'

const allStaff = ref([])
const onlineStaff = computed(() => allStaff.value.filter(s => s.online))
const fsdPilots = ref([])
const fsdAtc = ref([])
const fsdError = ref('')

onMounted(() => {
  loadStaff()
  loadFsd()
})

async function loadStaff() {
  try {
    const res = await adminApi.online()
    allStaff.value = res.data.staff || []
  } catch { /* ignore */ }
}

async function loadFsd() {
  fsdError.value = ''
  try {
    const res = await flightplanApi.fsdOnline()
    if (res.data) {
      // 根据 type 字段区分管制员和飞行员
      const all = Array.isArray(res.data) ? res.data : []
      fsdPilots.value = all
      fsdAtc.value = []
    }
    if (res.message) fsdError.value = res.message
  } catch (e) {
    fsdError.value = 'FSD 连接失败'
  }
}

async function toggleOnline(s) {
  try {
    await adminApi.updateStaffOnline(s.cid, { online: !s.online })
    s.online = !s.online
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.text-2xl { font-size: 28px; line-height: 1.2; }
.ml-md { margin-left: 16px; }
</style>
