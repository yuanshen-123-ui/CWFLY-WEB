<template>
  <div class="events fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>飞行活动</h1>
        <p>{{ detailEvent ? detailEvent.title : '查看和报名飞行活动' }}</p>
      </div>
      <div class="flex gap-sm">
        <button v-if="detailEvent" class="btn btn-outline btn-sm" @click="closeDetail">← 返回列表</button>
        <button v-if="!detailEvent && userStore.hasAnyPermission()" class="btn btn-primary btn-sm" @click="openForm(null)">发起活动</button>
      </div>
    </div>

    <!-- ====== 活动列表视图 ====== -->
    <template v-if="!detailEvent">
      <!-- 活动表单 -->
      <div v-if="showForm" class="card p-lg mb-lg">
        <h3 class="mb-md">{{ editingItem ? '编辑活动' : '发起活动' }}</h3>
        <div class="event-form">
          <div class="form-row">
            <div class="form-col">
              <label class="text-sm font-bold mb-sm" style="display:block;">活动标题 *</label>
              <input v-model="form.title" class="input" placeholder="如: 北京→上海连飞活动" />
            </div>
            <div class="form-col">
              <label class="text-sm font-bold mb-sm" style="display:block;">活动时间 *</label>
              <DatePicker v-model="form.date" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-col">
              <label class="text-sm font-bold mb-sm" style="display:block;">起飞机场</label>
              <input v-model="form.dep" class="input" placeholder="如 ZBAA" maxlength="4" />
            </div>
            <div class="form-col">
              <label class="text-sm font-bold mb-sm" style="display:block;">到达机场</label>
              <input v-model="form.arr" class="input" placeholder="如 ZSSS" maxlength="4" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-col">
              <label class="text-sm font-bold mb-sm" style="display:block;">航路</label>
              <input v-model="form.route" class="input" placeholder="如 ZBAA - ZSSS" />
            </div>
            <div class="form-col">
              <label class="text-sm font-bold mb-sm" style="display:block;">飞行距离</label>
              <input v-model="form.distance" class="input" placeholder="如 1,088 km" />
            </div>
          </div>
          <div class="mb-md">
            <label class="text-sm font-bold mb-sm" style="display:block;">NOTAMS</label>
            <input v-model="form.notams" class="input" placeholder="航行通告，如 ZBAA RWY18L/36R 关闭" />
          </div>
          <div class="mb-md">
            <label class="text-sm font-bold mb-sm" style="display:block;">管制席位 <button class="btn btn-outline btn-xs" @click="addPosition" type="button">+ 添加席位</button></label>
            <div v-for="(pos, i) in form.positions" :key="i" class="flex gap-sm items-center mb-xs">
              <SelectMenu v-model="pos.type" :options="[{ value: 'DEL', label: '放行 DEL' }, { value: 'GND', label: '地面 GND' }, { value: 'TWR', label: '塔台 TWR' }, { value: 'APP', label: '进近 APP' }, { value: 'CTR', label: '区域 CTR' }]" placeholder="席位" style="width:100px;" @change="autoFrequency(pos)" />
              <input v-model="pos.callsign" class="input" placeholder="如 ZBAA_TWR" style="flex:1;" />
              <input v-model="pos.frequency" class="input" placeholder="频率" style="width:80px;" />
              <SelectMenu v-model="pos.rating" :options="[{ value: 'S1', label: 'S1' }, { value: 'S2', label: 'S2' }, { value: 'S3', label: 'S3' }, { value: 'C1', label: 'C1' }, { value: 'C2', label: 'C2' }, { value: 'C3', label: 'C3' }, { value: 'I1', label: 'I1' }, { value: 'I2', label: 'I2' }, { value: 'I3', label: 'I3' }]" placeholder="等级" style="width:90px;" />
              <button class="btn btn-outline btn-xs" style="color:var(--c-danger);" @click="form.positions.splice(i,1)" type="button">×</button>
            </div>
            <p class="text-xs text-muted mt-sm">添加席位后自动匹配常用频率，也可手动修改</p>
          </div>
          <div class="form-row">
            <div class="form-col">
              <label class="text-sm font-bold mb-sm" style="display:block;">发布人</label>
              <input v-model="form.publisher" class="input" placeholder="发布人" />
            </div>
            <div class="form-col">
              <label class="text-sm font-bold mb-sm" style="display:block;">状态</label>
              <SelectMenu v-model="form.status" :options="[{ value: '报名中', label: '报名中' }, { value: '进行中', label: '进行中' }, { value: '筹备中', label: '筹备中' }, { value: '已结束', label: '已结束' }]" />
            </div>
          </div>
          <div class="mb-md">
            <label class="text-sm font-bold mb-sm" style="display:block;">描述</label>
            <textarea v-model="form.desc" class="input" rows="3" placeholder="活动描述" style="resize:vertical;"></textarea>
          </div>
          <div class="mb-md">
            <label class="text-sm font-bold mb-sm" style="display:block;">活动海报</label>
            <input v-model="form.poster" class="input" placeholder="海报图片链接" />
            <img v-if="form.poster" :src="form.poster" class="poster-preview" />
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-primary" @click="submitForm">{{ editingItem ? '保存' : '发布' }}</button>
            <button class="btn btn-outline" @click="showForm=false">取消</button>
          </div>
        </div>
      </div>

      <!-- 活动列表 -->
      <div v-if="list.length" class="events-list">
        <div v-for="ev in sortedList" :key="ev.id" class="card p-md mb-md card--hover event-card" @click="openDetail(ev)">
          <div class="flex gap-md" style="align-items:flex-start;">
            <img v-if="ev.poster" :src="ev.poster" class="event-poster" @click.stop="previewPoster=ev.poster" />
            <div class="flex-1">
              <h3 class="mb-sm">{{ ev.title }}</h3>
              <div class="text-sm text-secondary">
                <span>{{ ev.date }} &middot; {{ ev.route }}</span>
                <span class="ml-md">管制:
                  <span v-if="ev.atcPositions">
                    <span v-for="(pos, i) in parsePositions(ev.atcPositions)" :key="i" class="pos-chip">{{ pos.type }} {{ pos.callsign }} {{ pos.frequency }}</span>
                  </span>
                  <span v-else>{{ ev.controller || '-' }}</span>
                </span>
              </div>
              <div v-if="ev.dep || ev.arr" class="text-xs text-muted mt-xs">{{ ev.dep || '-' }} → {{ ev.arr || '-' }} <span v-if="ev.distance">· {{ ev.distance }}</span></div>
              <p class="text-sm text-muted mt-sm">{{ ev.desc }}</p>
            </div>
            <div class="flex items-center gap-sm flex-shrink-0">
              <span class="badge" :class="statusBadge(ev.status)">{{ ev.status }}</span>
              <span class="text-sm" style="color:var(--c-primary);white-space:nowrap;">查看详情 ›</span>
            </div>
          </div>
          <div v-if="userStore.hasAnyPermission()" class="flex gap-sm mt-sm justify-end">
            <button class="btn btn-outline btn-xs" @click.stop="openForm(ev)">编辑</button>
            <button class="btn btn-outline btn-xs" style="color:var(--c-danger);" @click.stop="delEvent(ev)">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="card p-lg text-center text-muted">暂无活动安排</div>

      <!-- 海报预览弹窗 -->
      <div v-if="previewPoster" class="modal-overlay" @click.self="previewPoster=''">
        <div class="modal card p-lg" style="text-align:center;">
          <img :src="previewPoster" style="max-width:90vw;max-height:80vh;border-radius:8px;" />
          <button class="btn btn-outline mt-md" @click="previewPoster=''">关闭</button>
        </div>
      </div>
    </template>

    <!-- ====== 活动详情视图 ====== -->
    <template v-else-if="detailEvent">
      <!-- 顶部: 海报 + 信息 -->
      <div class="detail-header card p-lg mb-lg">
        <div class="detail-layout">
          <div class="detail-poster" v-if="detailEvent.poster">
            <img :src="detailEvent.poster" @click="previewPoster=detailEvent.poster" />
          </div>
          <div class="detail-info" :class="{ 'full-width': !detailEvent.poster }">
            <h2 class="mb-md">{{ detailEvent.title }}</h2>
            <div class="info-grid">
              <div class="info-item"><span class="info-label">活动时间</span><span>{{ detailEvent.date }}</span></div>
              <div class="info-item"><span class="info-label">起飞机场</span><span>{{ detailEvent.dep || '-' }}</span></div>
              <div class="info-item"><span class="info-label">到达机场</span><span>{{ detailEvent.arr || '-' }}</span></div>
              <div class="info-item"><span class="info-label">发布人</span><span>{{ detailEvent.publisher || '-' }}</span></div>
              <div class="info-item"><span class="info-label">航路</span><span>{{ detailEvent.route || '-' }}</span></div>
              <div class="info-item"><span class="info-label">飞行距离</span><span>{{ detailEvent.distance || '-' }}</span></div>
              <div class="info-item" v-if="detailEvent.notams"><span class="info-label">NOTAMS</span><span>{{ detailEvent.notams }}</span></div>
            </div>
            <div v-if="detailEvent.desc" class="text-sm text-muted mt-sm">{{ detailEvent.desc }}</div>
            <div class="flex gap-sm mt-md">
              <button class="btn btn-primary" @click="showPilotModal = true" :disabled="detailEvent.status !== '报名中'">飞行员报名</button>
              <button class="btn btn-outline" @click="activeTab='controller';scrollTo('controller-section')" :disabled="detailEvent.status !== '报名中'">管制员报名</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 概览 -->
      <div class="overview-grid card p-md mb-lg">
        <div class="overview-item">
          <span class="overview-num">{{ detailEvent.pilotCount ?? 0 }}</span>
          <span class="overview-label">飞行员报名</span>
        </div>
        <div class="overview-item">
          <span class="overview-num">{{ detailEvent.controllerCount ?? 0 }}</span>
          <span class="overview-label">管制员报名</span>
        </div>
        <div class="overview-item">
          <span class="overview-num">{{ remainingTime }}</span>
          <span class="overview-label">剩余时间</span>
        </div>
        <div class="overview-item">
          <span class="badge overview-badge" :class="statusBadge(detailEvent.status)">{{ detailEvent.status }}</span>
          <span class="overview-label">活动状态</span>
        </div>
      </div>

      <!-- 选项卡 -->
      <div class="tabs mb-lg">
        <button class="tab-btn" :class="{ active: activeTab === 'pilot' }" @click="activeTab='pilot'">飞行员</button>
        <button class="tab-btn" :class="{ active: activeTab === 'controller' }" @click="activeTab='controller'">管制员</button>
      </div>

      <!-- 飞行员列表 -->
      <div v-if="activeTab === 'pilot'" class="card p-lg">
        <h3 class="mb-md">已报名机组</h3>
        <div v-if="detailEvent.pilots && detailEvent.pilots.length" class="table-wrap">
          <table v-sort>
            <thead><tr><th>CID</th><th>用户名</th><th>呼号</th><th>机型</th><th>报名时间</th></tr></thead>
            <tbody>
              <tr v-for="p in detailEvent.pilots" :key="p.id">
                <td>{{ p.userId }}</td>
                <td>{{ p.user?.username || '未知' }}</td>
                <td>{{ p.callsign || '-' }}</td>
                <td>{{ p.aircraft || '-' }}</td>
                <td class="text-sm">{{ p.createdAt ? new Date(p.createdAt).toLocaleString('zh-CN') : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="text-center text-muted py-lg">暂无飞行员报名</div>
      </div>

      <!-- 管制员列表 -->
      <div v-if="activeTab === 'controller'" id="controller-section" class="card p-lg">
        <h3 class="mb-md">管制席位列表</h3>
        <div v-if="parsedPositions.length" class="table-wrap">
          <table v-sort>
            <thead><tr><th>席位</th><th>呼号</th><th>频率</th><th>所需等级</th><th>报名管制员</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="pos in parsedPositions" :key="pos.callsign">
                <td>{{ pos.type || '-' }}</td>
                <td class="font-bold">{{ pos.callsign }}</td>
                <td>{{ pos.frequency || '-' }}</td>
                <td><span class="rating-tag">{{ pos.rating || '无要求' }}</span></td>
                <td>
                  <span v-if="getPositionController(pos.callsign)" class="text-success">
                    {{ getPositionController(pos.callsign).userId }}
                    ({{ getPositionController(pos.callsign).user?.username || '未知' }})
                  </span>
                  <span v-else class="text-muted">未报名</span>
                </td>
                <td>
                  <button v-if="getPositionController(pos.callsign)" class="btn btn-outline btn-xs" disabled>已报名</button>
                  <button v-else class="btn btn-primary btn-xs" @click="joinControllerPosition(pos)" :disabled="detailEvent.status !== '报名中'">立即报名</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="text-center text-muted py-lg">暂未设置管制席位</div>
      </div>
    </template>

    <!-- 飞行员报名弹窗 -->
    <div v-if="showPilotModal" class="modal-overlay" @click.self="showPilotModal=false">
      <div class="modal card p-lg" style="max-width:400px;">
        <h3 class="mb-md">飞行员报名</h3>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">活动呼号</label>
          <input v-model="pilotForm.callsign" class="input" placeholder="如 CSN1234" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">活动机型</label>
          <input v-model="pilotForm.aircraft" class="input" placeholder="如 A320" />
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitPilotJoin" :disabled="pilotJoining">{{ pilotJoining ? '报名中...' : '确认报名' }}</button>
          <button class="btn btn-outline" @click="showPilotModal=false">取消</button>
        </div>
        <p v-if="pilotMsg" class="text-sm mt-sm" :style="{ color: pilotMsgType === 'ok' ? 'var(--c-success)' : 'var(--c-danger)' }">{{ pilotMsg }}</p>
      </div>
    </div>

    <!-- 海报预览弹窗 -->
    <div v-if="previewPoster" class="modal-overlay" @click.self="previewPoster=''">
      <div class="modal card p-lg" style="text-align:center;">
        <img :src="previewPoster" style="max-width:90vw;max-height:80vh;border-radius:8px;" />
        <button class="btn btn-outline mt-md" @click="previewPoster=''">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { eventsApi } from '@/api'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const list = ref([])
// 活动列表排序：报名中置顶；筹备中/已结束 按时间逆序（最新在前）
const sortedList = computed(() => {
  const rank = s => (s === '报名中' ? 0 : s === '筹备中' ? 1 : s === '已结束' ? 2 : 3)
  return [...list.value].sort((a, b) => {
    const ra = rank(a.status), rb = rank(b.status)
    if (ra !== rb) return ra - rb
    return (b._start ?? Infinity) - (a._start ?? Infinity)
  })
})
const previewPoster = ref('')
const showForm = ref(false)
const editingItem = ref(null)

// 详情视图状态
const detailEvent = ref(null)
const activeTab = ref('pilot')

// 飞行员报名弹窗
const showPilotModal = ref(false)
const pilotForm = ref({ callsign: '', aircraft: '' })
const pilotJoining = ref(false)
const pilotMsg = ref('')
const pilotMsgType = ref('ok')

// 常用席位默认频率（中国主要机场）
const DEFAULT_FREQS = {
  DEL: { ZBAA: '121.600', ZSSS: '121.700', ZSPD: '121.700', ZGGG: '121.800', ZGSZ: '121.900', ZBTJ: '121.800', ZPPP: '121.700', ZUCK: '121.850', ZSHC: '121.800', ZSNJ: '121.800', ZHHH: '121.700', ZGHA: '121.800', default: '121.600' },
  GND: { ZBAA: '121.900', ZSSS: '121.700', ZSPD: '121.650', ZGGG: '121.700', ZGSZ: '121.750', ZBTJ: '121.950', ZPPP: '121.900', ZUCK: '121.750', ZSHC: '121.700', ZSNJ: '121.650', ZHHH: '121.650', ZGHA: '121.750', default: '121.900' },
  TWR: { ZBAA: '118.100', ZSSS: '118.100', ZSPD: '118.450', ZGGG: '118.800', ZGSZ: '118.450', ZBTJ: '118.500', ZPPP: '118.100', ZUCK: '118.200', ZSHC: '118.600', ZSNJ: '118.850', ZHHH: '118.600', ZGHA: '118.350', default: '118.000' },
  APP: { ZBAA: '120.600', ZSSS: '119.450', ZSPD: '125.450', ZGGG: '120.400', ZGSZ: '120.350', ZBTJ: '119.400', ZPPP: '119.600', ZUCK: '119.700', ZSHC: '119.450', ZSNJ: '119.900', ZHHH: '119.700', ZGHA: '120.200', default: '119.700' },
  CTR: { ZBPE: '134.200', ZSHA: '126.450', ZGZU: '126.550', ZPKM: '126.400', ZYSH: '134.150', ZHWH: '134.000', ZLHW: '134.200', ZWUQ: '124.150', default: '133.200' },
}

function autoFrequency(pos) {
  if (!pos.type || !form.value.dep) return
  const freqs = DEFAULT_FREQS[pos.type]
  if (!freqs) return
  const icao = form.value.dep.toUpperCase()
  pos.frequency = freqs[icao] || freqs.default || ''
}

function statusBadge(s) {
  return s === '报名中' ? 'badge-success' : s === '进行中' ? 'badge-info' : s === '已结束' ? 'badge-default' : 'badge-warning'
}

function parsePositions(json) {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// 解析当前详情活动的管制席位
const parsedPositions = computed(() => {
  if (!detailEvent.value) return []
  return parsePositions(detailEvent.value.atcPositions)
})

// 获取某个席位的报名管制员
function getPositionController(callsign) {
  if (!detailEvent.value?.controllers) return null
  return detailEvent.value.controllers.find(c => c.position === callsign) || null
}

// 计算剩余时间
const remainingTime = computed(() => {
  if (!detailEvent.value?.date) return '-'
  const eventDate = new Date(detailEvent.value.date)
  if (isNaN(eventDate.getTime())) return '-'
  const now = new Date()
  const diff = eventDate.getTime() - now.getTime()
  if (diff <= 0) return '已开始'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days}天${hours}小时`
  return `${hours}小时`
})

function scrollTo(id) {
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 100)
}

function addPosition() {
  form.value.positions.push({ type: '', callsign: '', frequency: '', rating: '' })
}

const form = ref({
  title: '', date: '', dep: '', arr: '', route: '', distance: '',
  notams: '', atcPositions: '', publisher: '', desc: '', poster: '', status: '报名中',
  positions: []
})

onMounted(async () => {
  try {
    const res = await eventsApi.list()
    list.value = res.data
  } catch { /* ignore */ }
})

// 打开活动详情
async function openDetail(ev) {
  try {
    const res = await eventsApi.detail(ev.id)
    detailEvent.value = res.data
    activeTab.value = 'pilot'
    pilotMsg.value = ''
  } catch (e) {
    alert(e.message)
  }
}

function closeDetail() {
  detailEvent.value = null
  activeTab.value = 'pilot'
  showPilotModal.value = false
  // 刷新列表
  eventsApi.list().then(res => { list.value = res.data }).catch(() => {})
}

function openForm(e) {
  editingItem.value = e || null
  if (e) {
    const parsed = e.atcPositions ? (() => { try { return JSON.parse(e.atcPositions) } catch { return [] } })() : []
    form.value = { ...e, positions: parsed.length ? parsed.map(p => ({ ...p, rating: p.rating || '' })) : [{ type: '', callsign: '', frequency: '', rating: '' }] }
  } else {
    form.value = { title: '', date: '', dep: '', arr: '', route: '', distance: '', notams: '', atcPositions: '', publisher: userStore.username || '', desc: '', poster: '', status: '报名中', positions: [{ type: '', callsign: '', frequency: '', rating: '' }] }
  }
  showForm.value = true
}

async function submitForm() {
  if (!form.value.title || !form.value.date) return alert('请填写标题和时间')
  const payload = { ...form.value, atcPositions: JSON.stringify(form.value.positions.filter(p => p.type)) }
  try {
    if (editingItem.value) {
      await eventsApi.update(editingItem.value.id, payload)
      Object.assign(editingItem.value, payload)
      showForm.value = false
      editingItem.value = null
    } else {
      const res = await eventsApi.create(payload)
      list.value.unshift(res.data)
      showForm.value = false
    }
  } catch (e) { alert(e.response?.data?.message || e.message || '操作失败') }
}

async function delEvent(ev) {
  if (!confirm(`确定删除活动「${ev.title}」？`)) return
  try {
    await eventsApi.remove(ev.id)
    list.value = list.value.filter(x => x.id !== ev.id)
  } catch (e) { alert(e.response?.data?.message || e.message || '删除失败') }
}

// 飞行员报名提交
async function submitPilotJoin() {
  if (!pilotForm.value.callsign) return alert('请输入活动呼号')
  pilotJoining.value = true
  pilotMsg.value = ''
  try {
    await eventsApi.join(detailEvent.value.id, {
      type: 'pilot',
      callsign: pilotForm.value.callsign,
      aircraft: pilotForm.value.aircraft
    })
    pilotMsg.value = '报名成功！'
    pilotMsgType.value = 'ok'
    showPilotModal.value = false
    // 刷新详情
    const res = await eventsApi.detail(detailEvent.value.id)
    detailEvent.value = res.data
  } catch (e) {
    pilotMsg.value = e.message
    pilotMsgType.value = 'err'
  } finally {
    pilotJoining.value = false
  }
}

// 管制员报名
async function joinControllerPosition(pos) {
  try {
    await eventsApi.join(detailEvent.value.id, {
      type: 'controller',
      position: pos.callsign
    })
    alert(`已报名${pos.callsign}席位！`)
    // 刷新详情
    const res = await eventsApi.detail(detailEvent.value.id)
    detailEvent.value = res.data
  } catch (e) {
    alert(e.message)
  }
}
</script>

<style scoped>
/* 通用 */
.pos-chip { display:inline-block; background:var(--c-bg-light); padding:2px 6px; border-radius:4px; font-size:11px; margin:2px; white-space:nowrap; }
.event-poster { width:120px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; flex-shrink:0; }
.events-list .card { transition:all .15s; }
.events-list .card:hover { transform:translateY(-2px); box-shadow:var(--shadow-md); }
.event-card { cursor:pointer; }
.event-card h3 { color:var(--c-text); transition:color .15s; }
.event-card:hover h3 { color:var(--c-primary); }
.poster-preview { display:block; margin-top:8px; max-width:200px; max-height:120px; border-radius:6px; object-fit:cover; }
.event-form { max-width:700px; }
.form-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
@media (max-width:640px) { .form-row { grid-template-columns:1fr; } }
.form-col { display:flex; flex-direction:column; }

/* 详情布局 */
.detail-layout { display:flex; gap:24px; align-items:flex-start; }
.detail-poster { flex-shrink:0; width:320px; }
.detail-poster img { width:100%; border-radius:12px; cursor:pointer; object-fit:cover; max-height:320px; }
.detail-info { flex:1; min-width:0; }
.detail-info.full-width { width:100%; }
.info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.info-item { display:flex; flex-direction:column; gap:2px; }
.info-label { font-size:12px; color:var(--c-muted); }
.overview-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; text-align:center; }
.overview-item { display:flex; flex-direction:column; align-items:center; gap:4px; }
.overview-num { font-size:28px; font-weight:700; color:var(--c-primary); }
.overview-label { font-size:12px; color:var(--c-muted); }
.overview-badge { font-size:14px; padding:4px 12px; }

/* 选项卡 */
.tabs { display:flex; gap:0; border-bottom:2px solid var(--c-border); }
.tab-btn { padding:10px 24px; border:none; background:none; cursor:pointer; font-size:14px; font-weight:500; color:var(--c-muted); border-bottom:2px solid transparent; margin-bottom:-2px; transition:all .15s; }
.tab-btn:hover { color:var(--c-text); }
.tab-btn.active { color:var(--c-primary); border-bottom-color:var(--c-primary); }

/* 等级标签 */
.rating-tag { display:inline-block; background:var(--c-bg-light); padding:2px 8px; border-radius:4px; font-size:12px; font-weight:600; }

/* 响应式 */
@media (max-width:768px) {
  .detail-layout { flex-direction:column; }
  .detail-poster { width:100%; max-width:400px; }
  .info-grid { grid-template-columns:1fr; }
  .overview-grid { grid-template-columns:repeat(2,1fr); }
}
</style>
