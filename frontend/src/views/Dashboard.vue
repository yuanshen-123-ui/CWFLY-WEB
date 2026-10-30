<template>
  <div class="dashboard fade-in">
    <!-- 欢迎 -->
    <div class="welcome-card">
      <div class="welcome-left">
        <div class="welcome-title">{{ greeting.time }}，{{ user.username }}，{{ greeting.wish }}</div>
        <div class="welcome-meta">CID {{ user.cid }} · 注册于 {{ user.profile?.createdAt || '---' }}</div>
      </div>
      <router-link to="/profile" class="welcome-btn">个人中心 →</router-link>
    </div>

    <!-- 统计数字 -->
    <div class="stats-row">
      <div class="stat-block" v-for="s in statsList" :key="s.label">
        <div class="stat-num">{{ s.value }}</div>
        <div class="stat-desc">{{ s.label }}</div>
      </div>
    </div>

    <!-- FSD 在线统计（与顶部统计样式一致） -->
    <div class="stats-row">
      <div class="stat-block">
        <div class="stat-num">{{ fsdPilots.length }}</div>
        <div class="stat-desc">FSD 在线机组</div>
      </div>
      <div class="stat-block">
        <div class="stat-num">{{ fsdAtc.length }}</div>
        <div class="stat-desc">FSD 在线管制</div>
      </div>
      <div class="stat-block">
        <div class="stat-num">{{ onlineStaff.length }}</div>
        <div class="stat-desc">职员在线</div>
      </div>
      <div class="stat-block">
        <div class="stat-num">{{ allStaff.length }}</div>
        <div class="stat-desc">职员总数</div>
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
              <th>离场/频率</th>
              <th>到达</th>
              <th>高度</th>
              <th>速度</th>
              <th>航向</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in fsdRows" :key="r.kind + r.callsign + r.cid">
              <td class="font-bold">{{ r.callsign }}</td>
              <td>{{ r.cid }}</td>
              <td>
                <span v-if="r.kind === 'atc'" class="badge badge-warning">管制员</span>
                <span v-else class="badge badge-info">飞行员</span>
              </td>
              <td>{{ r.kind === 'atc' ? atcFacilityName(r.facilityType) : (r.aircraft || '-') }}</td>
              <td>{{ r.kind === 'atc' ? (r.frequency || '-') : (r.dep || '-') }}</td>
              <td>{{ r.kind === 'atc' ? '-' : (r.dest || '-') }}</td>
              <td>{{ r.kind === 'atc' ? '-' : (r.altitude ? r.altitude + 'ft' : '-') }}</td>
              <td>{{ r.kind === 'atc' ? '-' : (r.groundspeed || 0) + 'kt' }}</td>
              <td>{{ r.kind === 'atc' ? '-' : (r.heading ? r.heading + '°' : '-') }}</td>
            </tr>
            <tr v-if="!fsdRows.length">
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
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useUserStore } from '@/store/user'
import { useOnlineUsersStore } from '@/store/onlineUsers'
import { dashboardApi, adminApi, flightplanApi } from '@/api'
import { getBeijingHour } from '@/utils/timeBg'

const user = useUserStore()
const onlineStore = useOnlineUsersStore()

// 按北京时间每 30 秒刷新一次（配色在 7:00/19:00 自动切换时问候语同步更新）
const nowTick = ref(0)
setInterval(() => { nowTick.value = Date.now() }, 30000)

// 按时段问候（模拟飞行主题, 按北京时间）：
// 5-11 早上好 / 11-13 中午好 / 13-18 下午好 / 18-23 晚上好 / 23-5 夜深了
const greeting = computed(() => {
  void nowTick.value // 建立定时刷新依赖
  const h = getBeijingHour()
  if (h >= 5 && h < 11) return { time: '早上好', wish: '祝您今日飞行顺利 ✈️' }
  if (h >= 11 && h < 13) return { time: '中午好', wish: '午餐时间，休息好再继续巡航' }
  if (h >= 13 && h < 18) return { time: '下午好', wish: '祝您航程一路顺风' }
  if (h >= 18 && h < 23) return { time: '晚上好', wish: '夜航模式已开启，祝您平安落地' }
  return { time: '夜深了', wish: '红眼航班辛苦了，早点休息' }
})

const statsList = ref([
  { label: '注册用户总数', value: '--' },
  { label: '管制员数量', value: '--' },
  { label: '举办活动数量', value: '--' },
  { label: '在线用户', value: '--' }
])

// 在线管理数据（原在线管理页面合并到仪表盘）
const allStaff = ref([])
const onlineStaff = computed(() => allStaff.value.filter(s => s.online))
const fsdPilots = ref([])
const fsdAtc = ref([])
const fsdError = ref('')

// FSD facilityType 数字 → 席位名
const ATC_FACILITY_NAMES = { 0: 'OBS', 1: 'FSS', 2: 'DEL', 3: 'GND', 4: 'TWR', 5: 'APP', 6: 'CTR' }
function atcFacilityName(t) {
  return ATC_FACILITY_NAMES[Number(t)] || ('FAC' + (t ?? ''))
}

// 合并后的在线列表：管制员置顶(按呼号升序) + 飞行员在下(按呼号升序)
const fsdRows = computed(() => {
  const byCallsign = (a, b) => String(a.callsign || '').localeCompare(String(b.callsign || ''), 'zh-CN')
  const atc = [...fsdAtc.value].sort(byCallsign).map(a => ({ kind: 'atc', ...a }))
  const pilots = [...fsdPilots.value].sort(byCallsign).map(p => ({ kind: 'pilot', ...p }))
  return [...atc, ...pilots]
})

async function loadDashboard() {
  try {
    const res = await dashboardApi.stats()
    statsList.value.forEach(s => {
      if (s.label === '注册用户总数') s.value = res.data.totalUsers ?? '--'
      if (s.label === '管制员数量') s.value = res.data.controllerCount ?? '--'
      if (s.label === '举办活动数量') s.value = res.data.eventCount ?? '--'
      // 在线用户 = 正在访问网站且已登录的去重用户数（后端 OnlineUser 表跨实例统计）
      if (s.label === '在线用户') s.value = res.data.onlineUsers ?? (onlineStore.count || '--')
    })
  } catch { /* ignore */ }

  loadStaff()
  loadFsd()
}

let dashboardTimer = null
onMounted(() => {
  loadDashboard()
  // 仪表盘数据每 30 秒刷新一次
  dashboardTimer = setInterval(loadDashboard, 30000)
})
onUnmounted(() => { if (dashboardTimer) clearInterval(dashboardTimer) })

// 实时同步网站在线用户数（socket 推送 online:count, 跨实例全量）
watch(() => onlineStore.count, (n) => {
  const s = statsList.value.find(x => x.label === '在线用户')
  if (s) s.value = n || '--'
})

async function loadStaff() {
  if (!user.hasPermission('online')) return
  try {
    const res = await adminApi.online()
    allStaff.value = res.data.staff || []
  } catch { /* ignore */ }
}

async function loadFsd() {
  fsdError.value = ''
  try {
    const [pilotRes, atcRes] = await Promise.allSettled([
      flightplanApi.fsdOnline(),
      flightplanApi.fsdControllers(),
    ])
    if (pilotRes.status === 'fulfilled' && pilotRes.value?.data) {
      fsdPilots.value = Array.isArray(pilotRes.value.data) ? pilotRes.value.data : []
    }
    // 在线管制员来自 FlightController 快照表（独立接口 /fsd/controllers）
    if (atcRes.status === 'fulfilled' && atcRes.value?.data) {
      fsdAtc.value = Array.isArray(atcRes.value.data) ? atcRes.value.data : []
    }
  } catch (e) {
    fsdError.value = 'FSD 连接失败'
  }
}

</script>

<style scoped>
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--c-border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: 24px;
}
.stat-block {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  padding: 24px 20px;
  text-align: center;
}
.stat-num {
  font-size: 32px;
  font-weight: 700;
  color: var(--c-text);
  line-height: 1.1;
  margin-bottom: 4px;
  font-variant-numeric: tabular-nums;
}
.stat-desc {
  font-size: 13px;
  color: var(--c-text-muted);
}

.welcome-card {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}
.welcome-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--c-text);
}
.welcome-meta {
  font-size: 13px;
  color: var(--c-text-muted);
  margin-top: 2px;
}
.welcome-btn {
  font-size: 13px;
  font-weight: 500;
  color: var(--c-primary);
  text-decoration: none;
  padding: 6px 14px;
  border-radius: 8px;
  transition: background .15s;
}
.welcome-btn:hover {
  background: var(--c-primary-light);
  text-decoration: none;
}

/* 在线管理（合并自原在线管理页面） */
.text-2xl { font-size: 28px; line-height: 1.2; }
.ml-md { margin-left: 16px; }

@media (max-width: 768px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); }
}
</style>
