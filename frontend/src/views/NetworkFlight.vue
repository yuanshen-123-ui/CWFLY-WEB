<template>
  <div class="network fade-in">
    <!-- ====== 活动详情视图 ====== -->
    <template v-if="detailEvent">
      <button class="btn btn-outline btn-sm mb-lg" @click="closeDetail">← 返回活动列表</button>
      <div class="card p-lg mb-lg">
        <div class="flex gap-lg" style="align-items:flex-start;flex-wrap:wrap;">
          <img v-if="detailEvent.poster" :src="detailEvent.poster" class="detail-poster" />
          <div class="flex-1" style="min-width:260px;">
            <h2 class="mb-md">{{ detailEvent.title }}</h2>
            <div class="info-grid mb-md">
              <div class="info-item"><span class="info-label">活动时间</span><span>{{ detailEvent.date }}</span></div>
              <div class="info-item"><span class="info-label">起飞机场</span><span>{{ detailEvent.dep || '-' }}</span></div>
              <div class="info-item"><span class="info-label">到达机场</span><span>{{ detailEvent.arr || '-' }}</span></div>
              <div class="info-item"><span class="info-label">活动状态</span><span class="badge" :class="statusBadge(detailEvent._status || detailEvent.status)">{{ detailEvent._status || detailEvent.status }}</span></div>
              <div class="info-item" v-if="detailEvent.route"><span class="info-label">航路</span><span>{{ detailEvent.route }}</span></div>
              <div class="info-item" v-if="detailEvent.distance"><span class="info-label">距离</span><span>{{ detailEvent.distance }}</span></div>
              <div class="info-item" v-if="detailEvent.notams"><span class="info-label">NOTAMS</span><span>{{ detailEvent.notams }}</span></div>
            </div>
            <div v-if="detailEvent.desc" class="text-sm text-muted mb-md">{{ detailEvent.desc }}</div>
            <div class="flex gap-sm">
              <!-- 报名中/筹备中均可报名; 已结束不显示 -->
              <button v-if="['报名中','筹备中'].includes(detailEvent._status || detailEvent.status)" class="btn btn-primary" @click="openJoin(detailEvent)">飞行员报名</button>
              <button v-if="isController && ['报名中','筹备中'].includes(detailEvent._status || detailEvent.status)" class="btn btn-outline" @click="openCtrlFromDetail">管制员报名</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">已报名机组 ({{ detailEvent.pilots?.length || 0 }})</h3>
        <div class="table-wrap">
          <table v-sort>
            <thead><tr><th>CID</th><th>用户名</th><th>呼号</th><th>机型</th><th>报名时间</th><th v-if="hasMyReg">操作</th></tr></thead>
            <tbody>
              <tr v-for="p in detailEvent.pilots || []" :key="p.id">
                <td>{{ p.userId }}</td>
                <td>{{ p.user?.username || '未知' }}</td>
                <td>{{ p.callsign || '-' }}</td>
                <td>{{ p.aircraft || '-' }}</td>
                <td class="text-sm">{{ p.createdAt ? new Date(p.createdAt).toLocaleString('zh-CN') : '-' }}</td>
                <td v-if="hasMyReg"><button v-if="isMyReg(p)" class="btn btn-outline btn-xs btn-danger btn-cancel-xs" @click="cancelRegistration(p)">取消报名</button></td>
              </tr>
              <tr v-if="!(detailEvent.pilots || []).length"><td colspan="5" class="text-center text-muted">暂无飞行员报名</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">管制员 ({{ detailEvent.controllers?.length || 0 }})</h3>
        <div class="table-wrap">
          <table v-sort>
            <thead><tr><th>CID</th><th>用户名</th><th>席位</th><th>呼号</th><th>频率</th><th v-if="hasMyReg">操作</th></tr></thead>
            <tbody>
              <tr v-for="c in detailEvent.controllers || []" :key="c.id">
                <td>{{ c.userId }}</td>
                <td>{{ c.user?.username || '未知' }}</td>
                <td>{{ c.position || c.type || '-' }}</td>
                <td>{{ c.callsign || '-' }}</td>
                <td>{{ c.frequency || '-' }}</td>
                <td v-if="hasMyReg"><button v-if="isMyReg(c)" class="btn btn-outline btn-xs btn-danger btn-cancel-xs" @click="cancelRegistration(c)">取消报名</button></td>
              </tr>
              <tr v-if="!(detailEvent.controllers || []).length"><td colspan="5" class="text-center text-muted">暂无管制员报名</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ====== 活动列表 ====== -->
    <template v-else>
      <div class="page-header flex justify-between items-start flex-wrap gap-md">
        <div>
          <h1>连飞活动</h1>
          <p>参与实时连飞，体验管制服务</p>
        </div>
        <div class="flex gap-sm flex-wrap">
          <button class="btn btn-primary btn-sm" @click="openJoinDialog">报名参加</button>
          <button v-if="isController" class="btn btn-outline btn-sm" @click="openCtrlDialog">管制员报名</button>
          <button class="btn btn-accent btn-sm" @click="showCreateDialog = true">+ 自发活动</button>
        </div>
      </div>

      <!-- 活动列表 -->
      <div class="card p-lg mb-lg">
        <h3 class="mb-md">当前活动</h3>
        <div v-for="e in computedEvents" :key="e.id" class="flex justify-between items-center p-md event-item" @click="openDetail(e)">
          <div>
            <h4 class="font-bold event-title">{{ e.title }}</h4>
            <p class="text-sm text-muted">{{ e.date }} &middot; {{ e.dep }} → {{ e.arr }} &middot; {{ e._status }}</p>
          </div>
          <div class="flex gap-sm items-center">
            <span class="badge" :class="statusBadge(e._status)">{{ e._status }}</span>
            <span class="text-sm" style="color:var(--c-primary);white-space:nowrap;">查看详情 ›</span>
          </div>
        </div>
        <div v-if="!events.length" class="text-center text-muted p-md">暂无活动</div>
      </div>

      <!-- 在线机组 -->
      <div class="card p-lg mb-lg">
        <h3 class="mb-md">在线机组 ({{ pilots.length }})</h3>
        <div class="table-wrap">
          <table v-sort>
            <thead><tr><th>呼号</th><th>机型</th><th>离场</th><th>到达</th><th>高度</th><th>速度</th></tr></thead>
            <tbody>
              <tr v-for="p in pilots" :key="p.callsign">
                <td class="font-bold">{{ p.callsign }}</td><td>{{ p.aircraft || '-' }}</td>
                <td>{{ p.dep_icao || '-' }}</td><td>{{ p.arr_icao || '-' }}</td>
                <td>{{ p.altitude ? p.altitude + 'ft' : '-' }}</td><td>{{ p.groundspeed ? p.groundspeed + 'kt' : '-' }}</td>
              </tr>
              <tr v-if="!pilots.length"><td colspan="6" class="text-center text-muted">暂无在线机组</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 报名弹窗 -->
    <div v-if="showJoinDialog" class="modal-overlay" @click.self="showJoinDialog = false">
      <div class="modal card p-lg">
        <h3 class="mb-md">报名参加活动</h3>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">选择活动</label>
          <select v-model="joinEventId" class="input">
            <option value="">-- 请选择 --</option>
            <option v-for="e in activeEvents" :key="e.id" :value="e.id">{{ e.title }} ({{ e.date }})</option>
          </select>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">呼号</label>
          <input v-model="joinCallsign" class="input" placeholder="如 CES1234" maxlength="10" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">机型</label>
          <input v-model="joinAircraft" class="input" placeholder="如 A320" maxlength="8" />
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitJoin" :disabled="joinLoading">{{ joinLoading ? '提交中...' : '确认报名' }}</button>
          <button class="btn btn-outline" @click="showJoinDialog = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 管制员报名弹窗 -->
    <div v-if="showControllerDialog" class="modal-overlay" @click.self="showControllerDialog = false">
      <div class="modal card p-lg">
        <h3 class="mb-md">管制员报名</h3>
        <div v-if="!isController" class="text-sm text-muted mb-md">仅管制员（C1 及以上）可报名管制席位。</div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">选择活动</label>
          <select v-model="ctrlEventId" class="input" :disabled="!!detailEvent">
            <option value="">-- 请选择 --</option>
            <option v-for="e in activeEvents" :key="e.id" :value="e.id">{{ e.title }} ({{ e.date }})</option>
          </select>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">管制席位</label>
          <select v-model="ctrlPosition" class="input" :disabled="!isController">
            <option value="">请选择席位</option>
            <option v-for="(p, i) in ctrlPositions.length ? ctrlPositions : defaultPositions" :key="i" :value="p.callsign || p.type">{{ positionLabel(p) }}</option>
          </select>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitController" :disabled="ctrlLoading || !isController">{{ ctrlLoading ? '提交中...' : '确认报名' }}</button>
          <button class="btn btn-outline" @click="showControllerDialog = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 自发活动弹窗 -->
    <div v-if="showCreateDialog" class="modal-overlay" @click.self="showCreateDialog = false">
      <div class="modal card p-lg" style="width:520px;">
        <h3 class="mb-md">发起活动 <span class="text-sm text-muted">（需管理员审批）</span></h3>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">活动标题</label>
          <input v-model="createForm.title" class="input" placeholder="如 周末连飞活动" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">活动日期</label>
          <input v-model="createForm.date" class="input" type="date" />
        </div>
        <div class="flex gap-sm mb-md">
          <div style="flex:1;">
            <label class="text-sm font-bold mb-sm" style="display:block;">起飞机场</label>
            <input v-model="createForm.dep" class="input" placeholder="如 ZBAA" maxlength="4" />
          </div>
          <div style="flex:1;">
            <label class="text-sm font-bold mb-sm" style="display:block;">到达机场</label>
            <input v-model="createForm.arr" class="input" placeholder="如 ZSSS" maxlength="4" />
          </div>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">活动说明</label>
          <textarea v-model="createForm.description" class="input" rows="3" placeholder="活动路线、管制安排等"></textarea>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitCreate" :disabled="createLoading">{{ createLoading ? '提交中...' : '提交审批' }}</button>
          <button class="btn btn-outline" @click="showCreateDialog = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/user'
import { eventsApi, flightplanApi } from '@/api'
import { showBanner } from '@/utils/banner'

const user = useUserStore()
const events = ref([])
const pilots = ref([])
const detailEvent = ref(null)
const showJoinDialog = ref(false)
const joinEventId = ref('')
const joinCallsign = ref('')
const joinAircraft = ref('')
const joinLoading = ref(false)

const showControllerDialog = ref(false)
const ctrlEventId = ref('')
const ctrlPosition = ref('')
const ctrlLoading = ref(false)

const showCreateDialog = ref(false)
const createLoading = ref(false)
const createForm = ref({ title: '', date: '', dep: '', arr: '', description: '' })

// 解析活动开始时间戳(兼容 YYYY-MM-DD / MM/DD 格式; 无日期返回 Infinity)
function parseEventTime(e) {
  const d = (e.date || '').trim()
  const t = (e.time || '').trim()
  if (!d) return Infinity
  let ds = d
  if (/^\d{1,2}[\/-]\d{1,2}$/.test(d)) {
    const p = d.split(/[\/-]/)
    ds = `${new Date().getFullYear()}-${p[0]}-${p[1]}`
  }
  const dt = new Date(`${ds}${t ? 'T' + t : 'T00:00'}`)
  return isNaN(dt.getTime()) ? Infinity : dt.getTime()
}

// 动态活动状态: 过了活动时间 → 已结束; 未来活动里时间最近的一个 → 报名中, 其余 → 筹备中
// (同一时间只有一个活动能被报名); 无日期的活动保持原状态;
// 管理员手动标记"已结束"的活动始终已结束（不被时间规则复活）
const computedEvents = computed(() => {
  const now = Date.now()
  const list = events.value.map(e => ({ ...e, _start: parseEventTime(e), _status: e.status }))
  const future = list.filter(e => e._status !== '已结束' && e._start !== Infinity && e._start > now).sort((a, b) => a._start - b._start)
  const past = list.filter(e => e._status === '已结束' || (e._start !== Infinity && e._start <= now))
  future.forEach((e, i) => { e._status = i === 0 ? '报名中' : '筹备中' })
  past.forEach(e => { e._status = '已结束' })
  // 排序：报名中置顶；筹备中/已结束 按时间逆序（最新在前）
  const rank = s => (s === '报名中' ? 0 : s === '筹备中' ? 1 : s === '已结束' ? 2 : 3)
  return list.sort((a, b) => {
    const ra = rank(a._status), rb = rank(b._status)
    if (ra !== rb) return ra - rb
    return (b._start ?? Infinity) - (a._start ?? Infinity)
  })
})

// 可报名活动（报名中 + 筹备中，已结束不可报名）
const activeEvents = computed(() => computedEvents.value.filter(e => e._status !== '已结束'))

// 是否具备管制员资格（fsdLevel >= 5 = C1）
const isController = computed(() => (user.fsdLevel ?? 0) >= 5)

// 当前用户是否有该活动的报名
const hasMyReg = computed(() => {
  if (!detailEvent.value) return false
  const all = [...(detailEvent.value.pilots || []), ...(detailEvent.value.controllers || [])]
  return all.some(r => String(r.userId) === String(user.cid))
})

// 某条报名是否属于当前用户
function isMyReg(r) {
  return String(r.userId) === String(user.cid)
}

// 当前选中活动的管制席位（来自管理后台 atcPositions）
const ctrlPositions = computed(() => {
  if (!ctrlEventId.value) return []
  const ev = events.value.find(e => e.id === Number(ctrlEventId.value))
  if (!ev) return []
  try { return JSON.parse(ev.atcPositions || '[]') } catch { return [] }
})

// 默认席位（管理后台未配置时兜底）
const defaultPositions = [
  { type: 'DEL', callsign: '', frequency: '' },
  { type: 'GND', callsign: '', frequency: '' },
  { type: 'TWR', callsign: '', frequency: '' },
  { type: 'APP', callsign: '', frequency: '' },
  { type: 'CTR', callsign: '', frequency: '' },
]

function positionLabel(p) {
  const typeMap = { DEL: '放行', GND: '地面', TWR: '塔台', APP: '进近', CTR: '区域' }
  const type = typeMap[p.type] || p.type
  const parts = [type]
  if (p.callsign) parts.push(p.callsign)
  if (p.frequency) parts.push(p.frequency)
  return parts.join(' ')
}

function statusBadge(s) {
  return s === '报名中' ? 'badge-success' : s === '进行中' ? 'badge-info' : s === '已结束' ? 'badge-default' : 'badge-warning'
}

// 打开活动详情
async function openDetail(e) {
  try {
    const res = await eventsApi.detail(e.id)
    const ev = res.data
    // 用全列表计算的动态状态覆盖详情状态(时间超过 → 已结束; 最近未来 → 报名中)
    const computed = computedEvents.value.find(x => x.id === ev.id)
    ev._status = computed ? computed._status : (ev.status || '筹备中')
    detailEvent.value = ev
  } catch (err) {
    showBanner('加载详情失败: ' + err.message)
  }
}

function closeDetail() {
  detailEvent.value = null
  eventsApi.list().then(r => { events.value = r.data }).catch(() => {})
}

// 用户取消自己的报名
async function cancelRegistration(r) {
  try {
    await eventsApi.cancelRegistration(r.id)
    openDetail({ id: detailEvent.value.id })
  } catch (e) { showBanner('取消失败: ' + e.message) }
}

function openCtrlFromDetail() {
  if (detailEvent.value) {
    ctrlEventId.value = detailEvent.value.id
    showControllerDialog.value = true
  }
}

function openJoin(e) {
  joinEventId.value = e.id
  showJoinDialog.value = true
}

// 列表页打开报名弹窗：默认选中“报名中”的活动
function openJoinDialog() {
  const first = activeEvents.value.find(e => e._status === '报名中') || activeEvents.value[0] || null
  joinEventId.value = first ? String(first.id) : ''
  showJoinDialog.value = true
}

// 列表页打开管制员报名弹窗：默认选中“报名中”的活动
function openCtrlDialog() {
  const first = activeEvents.value.find(e => e._status === '报名中') || activeEvents.value[0] || null
  ctrlEventId.value = first ? String(first.id) : ''
  showControllerDialog.value = true
}

onMounted(async () => {
  try { const r = await eventsApi.list(); events.value = r.data } catch {}
  try { const r = await flightplanApi.fsdOnline(); pilots.value = r.data || [] } catch {}
})

async function submitJoin() {
  if (!joinEventId.value) return showBanner('请选择活动')
  if (!joinCallsign.value) return showBanner('请输入呼号')
  joinLoading.value = true
  try {
    await eventsApi.join(joinEventId.value, { callsign: joinCallsign.value, aircraft: joinAircraft.value })
    showJoinDialog.value = false
    joinCallsign.value = ''
    joinAircraft.value = ''
    // 若在详情页，刷新详情
    if (detailEvent.value) openDetail({ id: joinEventId.value })
  } catch (e) { showBanner('报名失败: ' + e.message) }
  finally { joinLoading.value = false }
}

async function submitController() {
  if (!ctrlEventId.value) return showBanner('请选择活动')
  if (!ctrlPosition.value) return showBanner('请选择席位')
  ctrlLoading.value = true
  try {
    await eventsApi.join(ctrlEventId.value, { position: ctrlPosition.value, type: 'controller' })
    showControllerDialog.value = false
    ctrlPosition.value = ''
    // 若在详情页，刷新详情
    if (detailEvent.value) openDetail({ id: ctrlEventId.value })
  } catch (e) { showBanner('报名失败: ' + e.message) }
  finally { ctrlLoading.value = false }
}

async function submitCreate() {
  const f = createForm.value
  if (!f.title || !f.date || !f.dep || !f.arr) return showBanner('请填写完整信息')
  createLoading.value = true
  try {
    await eventsApi.create(f)
    showBanner('活动已提交，请等待管理员审核。')
    showCreateDialog.value = false
    createForm.value = { title: '', date: '', dep: '', arr: '', description: '' }
  } catch (e) { showBanner('提交失败: ' + e.message) }
  finally { createLoading.value = false }
}
</script>

<style scoped>
.modal-overlay { position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;background:rgba(0,0,0,0.08);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:overlayFadeIn .25s ease; }
.modal { background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,0.12);width:480px;max-width:100%;max-height:90vh;overflow-y:auto;animation:modalPopIn .3s cubic-bezier(.34,1.56,.64,1); }
/* 深色模式: 遮罩加深、弹窗深色背景+边框, 避免与背景融合 */
html[data-theme='dark'] .modal-overlay { background:rgba(0,0,0,0.55); }
html[data-theme='dark'] .modal { background:#1c1c1e; border:1px solid var(--c-border); box-shadow:0 8px 40px rgba(0,0,0,0.55); }
@keyframes overlayFadeIn { from{opacity:0} to{opacity:1} }
@keyframes modalPopIn { from{opacity:0;transform:scale(.92) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
.btn-accent { background:#ff9f0a;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap; }
.btn-accent:hover { background:#e89400;transform:translateY(-1px); }
.network { max-width:960px;margin:0 auto;padding:16px; }
@media (max-width:640px) { .network { padding:8px; } }
.event-item { border-bottom:1px solid var(--c-border-light);cursor:pointer;transition:background .15s;border-radius:8px; }
.event-item:hover { background:var(--c-bg-light); }
.event-title { transition:color .15s; }
.event-item:hover .event-title { color:var(--c-primary); }
.btn-danger { color:var(--c-danger);border-color:var(--c-danger); }
.btn-danger:hover { background:var(--c-danger);color:#fff; }
.btn-cancel-xs { padding-left:8px; padding-right:8px; }
.detail-poster { width:220px; max-width:100%; border-radius:10px; object-fit:cover; box-shadow:var(--shadow-md); flex-shrink:0; }
.info-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px; }
.info-item { padding:8px 12px;background:var(--glass-bg);border-radius:var(--radius-sm); }
.info-label { display:block;font-size:12px;color:var(--c-text-secondary);margin-bottom:4px; }
</style>
