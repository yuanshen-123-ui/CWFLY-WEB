<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>活动管理</h1>
        <p>创建和管理飞行活动</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="openForm(null)">+ 创建活动</button>
    </div>

    <!-- 编辑/创建弹窗（毛玻璃, 样式同用户管理, 宽度随内容） -->
    <Teleport to="body">
      <Transition name="modal">
      <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
        <div class="modal-card">
          <h3 class="modal-title">{{ editingItem ? '编辑活动' : '创建活动' }}</h3>
          <div class="event-form">
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">活动标题 *</label>
            <input v-model="form.title" class="input" placeholder="如: 北京→上海连飞活动" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">活动时间 *</label>
            <DatePicker v-model="formDateTime" with-time />
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">起飞机场 (ICAO)</label>
            <input v-model="form.dep" class="input" placeholder="如 ZBAA" maxlength="4" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">到达机场 (ICAO)</label>
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
          <label class="text-sm font-bold mb-sm" style="display:block;">管制席位</label>
          <div class="table-wrap seat-sheet" @mouseup="endDrag" @mouseleave="endDrag">
            <table ref="seatTableEl" class="seat-table" tabindex="0" @keydown="onSeatKeydown">
              <thead>
                <tr>
                  <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(pos, i) in form.positions" :key="i" :class="{ 'seat-row-selected': isRowSelected(i) }">
                  <td v-for="(col, c) in columns" :key="col.key"
                      :class="{ 'seat-cell-selected': isCellSelected(i, c) }"
                      @mousedown.prevent="onCellMouseDown(i, c)"
                      @mouseenter="onCellMouseEnter(i, c)"
                      @dblclick="onCellDblClick($event)">
                    <input v-model="pos[col.key]" class="cell-input" :placeholder="col.placeholder"
                           @input="onCellInput(pos, col.key)" @keydown.enter="onCellEnter"
                           @focus="openSeatDropdown(i, c, col.key, $event)" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Teleport to="body">
            <div v-if="seatDropdown" class="seat-dropdown"
                 :style="{ left: seatDropdown.x + 'px', top: seatDropdown.y + 'px', minWidth: seatDropdown.w + 'px' }"
                 @mousedown.stop>
              <div v-for="opt in seatDropdownOpts" :key="opt" class="seat-dropdown-item"
                   :class="{ active: isSeatDropdownActive(opt) }" @click="pickSeatOption(opt)">{{ opt }}</div>
            </div>
          </Teleport>
          <p class="text-xs text-muted mt-sm">双击空白行输入添加席位；拖动选中单元格，方向键移动选区，选中整行后按 Delete 删除</p>
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
          <div class="flex gap-sm items-center">
            <input type="file" accept="image/*" ref="posterInput" style="display:none;" @change="uploadPoster" />
            <button class="btn btn-outline btn-sm" @click="$refs.posterInput.click()" :disabled="posterUploading">{{ posterUploading ? '上传中...' : '上传海报' }}</button>
            <button v-if="form.poster" class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="form.poster=''">删除</button>
          </div>
          <img v-if="form.poster" :src="form.poster" class="poster-preview" />
        </div>
            <div class="modal-actions">
              <button class="btn btn-primary" @click="submitForm">{{ editingItem ? '保存' : '创建' }}</button>
              <button class="btn btn-outline" @click="showForm=false">取消</button>
            </div>
          </div>
        </div>
      </div>
      </Transition>
    </Teleport>

    <!-- 活动列表 -->
    <div class="card">
      <div class="table-wrap">
        <table class="event-list" v-sort="{ index: 1, desc: true }">
          <thead>
            <tr>
              <th>标题</th>
              <th>时间</th>
              <th>海报</th>
              <th>起飞机场</th>
              <th>到达机场</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in sortedEvents" :key="e.id">
              <td class="font-bold">{{ e.title }}</td>
              <td class="text-sm">{{ e.date }}{{ e.time ? ' ' + e.time : '' }}</td>
              <td>
                <img v-if="e.poster" :src="e.poster" class="poster-thumb" />
                <span v-else class="text-muted text-sm">-</span>
              </td>
              <td>{{ e.dep || '-' }}</td>
              <td>{{ e.arr || '-' }}</td>
              <td>
                <span class="badge" :class="statusBadge(e.status)">{{ e.status }}</span>
                <span v-if="isExpired(e) && e.status !== '已结束'" class="badge badge-default" style="margin-left:4px;" title="活动时间已过，建议标记为已结束">已过期</span>
              </td>
              <td>
                <button class="btn btn-outline btn-sm" @click="openForm(e)">编辑</button>
              </td>
            </tr>
            <tr v-if="!events.length">
              <td colspan="7" class="text-center text-muted">暂无活动</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 报名管理弹窗 -->
    <Transition name="modal">
    <div v-if="regTarget" class="modal-overlay" @click.self="regTarget=null">
      <div class="modal card p-lg" style="width:720px;max-width:100%;">
        <div class="flex justify-between items-center mb-md">
          <h3 class="mb-0">报名管理：{{ regTarget.title }}</h3>
          <button class="btn btn-outline btn-sm" @click="regTarget=null">关闭</button>
        </div>
        <p class="text-sm text-muted mb-md">{{ regTarget.date }} · {{ regTarget.dep || '-' }} → {{ regTarget.arr || '-' }}</p>

        <h4 class="mb-sm">飞行员报名 ({{ regTarget.pilots?.length || 0 }})</h4>
        <div class="table-wrap mb-lg">
          <table v-sort>
            <thead><tr><th>CID</th><th>用户名</th><th>呼号</th><th>机型</th><th>报名时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="p in regTarget.pilots || []" :key="p.id">
                <td>{{ p.userId }}</td>
                <td>{{ p.user?.username || '未知' }}</td>
                <td>{{ p.callsign || '-' }}</td>
                <td>{{ p.aircraft || '-' }}</td>
                <td class="text-sm">{{ p.createdAt ? new Date(p.createdAt).toLocaleString('zh-CN') : '-' }}</td>
                <td><button class="btn btn-outline btn-xs btn-danger" @click="cancelReg(p)">取消报名</button></td>
              </tr>
              <tr v-if="!(regTarget.pilots || []).length"><td colspan="6" class="text-center text-muted">暂无飞行员报名</td></tr>
            </tbody>
          </table>
        </div>

        <h4 class="mb-sm">管制员报名 ({{ regTarget.controllers?.length || 0 }})</h4>
        <div class="table-wrap">
          <table v-sort>
            <thead><tr><th>CID</th><th>用户名</th><th>席位</th><th>呼号</th><th>频率</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="c in regTarget.controllers || []" :key="c.id">
                <td>{{ c.userId }}</td>
                <td>{{ c.user?.username || '未知' }}</td>
                <td>{{ c.position || c.type || '-' }}</td>
                <td>{{ c.callsign || '-' }}</td>
                <td>{{ c.frequency || '-' }}</td>
                <td><button class="btn btn-outline btn-xs btn-danger" @click="cancelReg(c)">取消报名</button></td>
              </tr>
              <tr v-if="!(regTarget.controllers || []).length"><td colspan="6" class="text-center text-muted">暂无管制员报名</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import api, { adminApi } from '@/api'

const events = ref([])
// 活动列表排序：报名中置顶；筹备中/已结束 按时间逆序（与 Events.vue 一致）
const sortedEvents = computed(() => {
  const rank = s => (s === '报名中' ? 0 : s === '筹备中' ? 1 : s === '已结束' ? 2 : 3)
  return [...events.value].sort((a, b) => {
    const ra = rank(a.status), rb = rank(b.status)
    if (ra !== rb) return ra - rb
    return (b._start ?? Infinity) - (a._start ?? Infinity)
  })
})
const showForm = ref(false)
const editingItem = ref(null)
// 席位 → 默认等级映射
const RATING_MAP = {
  DEL: 'S1', GND: 'S1', TWR: 'S2', APP: 'S3', CTR: 'C1',
}

// ---- 电子表格式席位编辑 ----
const columns = [
  { key: 'type', label: '席位', placeholder: '席位' },
  { key: 'callsign', label: '呼号', placeholder: '如 ZBAA_TWR' },
  { key: 'frequency', label: '频率', placeholder: '频率' },
  { key: 'rating', label: '等级', placeholder: '等级' },
]
const blankPos = () => ({ type: '', callsign: '', frequency: '', rating: '' })
const isBlankPos = p => !p.type && !p.callsign && !p.frequency && !p.rating
// 保证表格末尾始终有一行空白
function ensureTrailingBlank() {
  const arr = form.value.positions
  const last = arr[arr.length - 1]
  if (!last || !isBlankPos(last)) arr.push(blankPos())
}
const dragStart = ref(null)      // { r, c }
const selCells = ref([])         // [[r,c], ...]
const dragMoved = ref(false)     // 是否真的发生了拖选(多格)
const seatTableEl = ref(null)
function onCellMouseDown(r, c) {
  dragStart.value = { r, c }
  dragMoved.value = false
  selCells.value = [[r, c]]
  // 让表格获得焦点,支持方向键导航
  if (seatTableEl.value) seatTableEl.value.focus({ preventScroll: true })
}
function onCellMouseEnter(r, c) {
  if (!dragStart.value) return
  const { r: sr, c: sc } = dragStart.value
  dragMoved.value = dragMoved.value || sr !== r || sc !== c
  const r1 = Math.min(sr, r), r2 = Math.max(sr, r)
  const c1 = Math.min(sc, c), c2 = Math.max(sc, c)
  selCells.value = []
  for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) selCells.value.push([i, j])
}
function endDrag() {
  dragStart.value = null
}
function isCellSelected(r, c) {
  return selCells.value.some(([rr, cc]) => rr === r && cc === c)
}
function isRowSelected(r) {
  return columns.every((_, c) => isCellSelected(r, c))
}
function onCellDblClick(e) {
  const input = e.target.closest('input')
  if (input) { input.focus(); input.select() }
}
// 回车完成输入:失焦恢复箭头光标
function onCellEnter(e) {
  e.preventDefault()
  closeSeatDropdown()
  e.target.blur()
}
// ---- 席位/等级自定义下拉浮层(替代原生 datalist, 定位更准确) ----
const seatDropdown = ref(null)   // { r, c, key, x, y, w }
const SEAT_TYPE_OPTS = ['DEL', 'GND', 'TWR', 'APP', 'CTR']
const SEAT_RATING_OPTS = ['S1', 'S2', 'S3', 'C1', 'C2', 'C3', 'I1', 'I2', 'I3']
const seatDropdownOpts = computed(() =>
  seatDropdown.value ? (seatDropdown.value.key === 'type' ? SEAT_TYPE_OPTS : SEAT_RATING_OPTS) : []
)
function openSeatDropdown(r, c, key, e) {
  if (key !== 'type' && key !== 'rating') return
  const rect = e.target.getBoundingClientRect()
  seatDropdown.value = { r, c, key, x: rect.left, y: rect.bottom + 4, w: rect.width }
}
function closeSeatDropdown() { seatDropdown.value = null }
function isSeatDropdownActive(opt) {
  const d = seatDropdown.value
  if (!d) return false
  const pos = form.value.positions[d.r]
  return pos ? pos[d.key] === opt : false
}
function pickSeatOption(opt) {
  const d = seatDropdown.value
  if (!d) return
  const pos = form.value.positions[d.r]
  if (pos) { pos[d.key] = opt; autoRating(pos) }
  closeSeatDropdown()
}
// 点击页面其他区域时关闭浮层
function onSeatSheetDocMouseDown(e) {
  if (seatDropdown.value && !e.target.closest('.seat-dropdown')) closeSeatDropdown()
  // 点击表格以外的空白区域 → 取消选中
  if (selCells.value.length && !e.target.closest('.seat-sheet')) {
    selCells.value = []
    dragStart.value = null
  }
}
// 席位变化时自动填充默认等级;等级为空或仍是默认值(未被手动定制)则跟随更新
function autoRating(pos) {
  if (!pos.type) return
  const t = pos.type.toUpperCase()
  const defaults = Object.values(RATING_MAP)
  for (const k of Object.keys(RATING_MAP)) {
    if (t.includes(k) || k.includes(t)) {
      const def = RATING_MAP[k]
      if (!pos.rating || defaults.includes(pos.rating)) {
        pos.rating = def
      }
      return
    }
  }
}
function onCellInput(pos, key) {
  if (key === 'type') autoRating(pos)
  ensureTrailingBlank()
}
function onSeatKeydown(e) {
  // 方向键:移动选区(编辑输入框内时不拦截, 让光标正常移动)
  const nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
  if (nav[e.key]) {
    const target = e.target
    if (target && target.classList && target.classList.contains('cell-input')) return
    e.preventDefault()
    moveSelection(nav[e.key][0], nav[e.key][1])
    return
  }
  if (e.key !== 'Delete' || !dragMoved.value || !selCells.value.length) return
  e.preventDefault()
  const fullRows = [...new Set(selCells.value.map(([r]) => r))]
    .filter(r => columns.every((_, c) => selCells.value.some(([rr, cc]) => rr === r && cc === c)))
  if (fullRows.length) {
    // 删除整行
    fullRows.sort((a, b) => b - a).forEach(r => form.value.positions.splice(r, 1))
  } else {
    // 清空选中的单元格
    selCells.value.forEach(([r, c]) => {
      const pos = form.value.positions[r]
      if (pos) pos[columns[c].key] = ''
    })
  }
  selCells.value = []
  ensureTrailingBlank()
}
// 整体移动选区(保持选区大小)
function moveSelection(dr, dc) {
  if (!selCells.value.length) return
  const rows = selCells.value.map(([r]) => r)
  const cols = selCells.value.map(([, c]) => c)
  const minR = Math.min(...rows), maxR = Math.max(...rows)
  const minC = Math.min(...cols), maxC = Math.max(...cols)
  const nr = minR + dr, nc = minC + dc
  if (nr < 0 || nc < 0 || maxR + dr >= form.value.positions.length || maxC + dc >= columns.length) return
  selCells.value = selCells.value.map(([r, c]) => [r + dr, c + dc])
  dragMoved.value = true
}

const form = ref({
  title: '', date: '', time: '', dep: '', arr: '', route: '', distance: '',
  notams: '', atcPositions: '', publisher: '', desc: '', poster: '', status: '筹备中',
  positions: []
})

// datetime-local 输入框与 date/time 两字段的双向绑定：
// 读取时拼 "YYYY-MM-DDTHH:mm"，写入时拆回 date/time（time 无秒）
const formDateTime = computed({
  get() {
    const d = form.value.date || ''
    const t = (form.value.time || '').slice(0, 5)
    return d && t ? `${d}T${t}` : d ? `${d}T00:00` : ''
  },
  set(v) {
    if (!v) { form.value.date = ''; form.value.time = ''; return }
    const [d, t] = v.split('T')
    form.value.date = d || ''
    form.value.time = t ? t.slice(0, 5) : ''
  }
})

const posterUploading = ref(false)
const posterInput = ref(null)

async function uploadPoster(e) {
  const file = e.target.files[0]
  if (!file || !editingItem.value) return alert('请先保存活动再上传海报')
  posterUploading.value = true
  try {
    const fd = new FormData()
    fd.append('poster', file)
    const res = await api.post('/admin/events/' + editingItem.value.id + '/poster', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    form.value.poster = res.data.poster
    editingItem.value.poster = res.data.poster
  } catch (e) { alert('上传失败: ' + e.message) }
  finally { posterUploading.value = false }
}

function statusBadge(s) {
  return s === '报名中' ? 'badge-success' : s === '进行中' ? 'badge-info' : s === '已结束' ? 'badge-default' : 'badge-warning'
}

/** 活动时间是否已过（date+time 解析，兼容 MM/DD 格式；无日期视为未过期） */
function isExpired(e) {
  const d = (e.date || '').trim()
  if (!d) return false
  let ds = d
  if (/^\d{1,2}[-/]\d{1,2}$/.test(d)) {
    const p = d.split(/[-/]/)
    ds = `${new Date().getFullYear()}-${p[0]}-${p[1]}`
  }
  const t = (e.time || '').trim()
  const dt = new Date(`${ds}${t ? 'T' + t : 'T00:00'}`)
  return !isNaN(dt.getTime()) && dt.getTime() <= Date.now()
}

onMounted(async () => {
  document.addEventListener('mousedown', onSeatSheetDocMouseDown)
  try {
    const res = await adminApi.events()
    events.value = res.data
  } catch { /* ignore */ }
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onSeatSheetDocMouseDown)
})

function openForm(e) {
  editingItem.value = e || null
  if (e) {
    const parsed = e.atcPositions ? (() => { try { return JSON.parse(e.atcPositions) } catch { return [] } })() : []
    form.value = { ...e, positions: parsed.length ? parsed.map(p => ({ ...p, rating: p.rating || '' })) : [blankPos()] }
  } else {
    form.value = { title: '', date: '', time: '', dep: '', arr: '', route: '', distance: '', notams: '', atcPositions: '', publisher: '', desc: '', poster: '', status: '筹备中', positions: [blankPos()] }
  }
  ensureTrailingBlank()
  selCells.value = []
  dragStart.value = null
  showForm.value = true
}

async function submitForm() {
  if (!form.value.title || !form.value.date) return alert('请填写标题和日期')
  // 序列化席位为JSON字符串
  const payload = { ...form.value, atcPositions: JSON.stringify(form.value.positions.filter(p => p.type)) }
  try {
    if (editingItem.value) {
      await adminApi.updateEvent(editingItem.value.id, payload)
      Object.assign(editingItem.value, payload)
    } else {
      const res = await adminApi.createEvent(payload)
      events.value.unshift(res.data)
    }
    showForm.value = false
    editingItem.value = null
  } catch (e) { alert(e.message) }
}

// 报名管理
const regTarget = ref(null)

async function cancelReg(r) {
  if (!confirm(`确定取消 ${r.user?.username || r.userId} 的报名？`)) return
  try {
    await adminApi.cancelEventReg(r.id)
    regTarget.value.pilots = (regTarget.value.pilots || []).filter(x => x.id !== r.id)
    regTarget.value.controllers = (regTarget.value.controllers || []).filter(x => x.id !== r.id)
    alert('已取消报名')
  } catch (e) { alert('取消失败: ' + e.message) }
}
</script>

<style scoped>
.event-form { min-width: 480px; max-width: 700px; }
.form-row { display: flex; gap: 16px; margin-bottom: 16px; }
.form-col { flex: 1; }

/* 管制席位电子表格 */
.seat-sheet { user-select: none; -webkit-user-select: none; }
.seat-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; outline: none; }
.seat-table th, .seat-table td { padding: 0; vertical-align: middle; }
.seat-table th { font-size: 12px; color: var(--c-text-muted); font-weight: 600; white-space: nowrap; text-align: center; padding: 6px 4px; border-bottom: 1px solid var(--glass-border-strong); }
.seat-table td { border-right: 1px solid var(--glass-border-strong); border-bottom: 1px solid var(--glass-border-strong); position: relative; }
.seat-table td:last-child { border-right: none; }
.seat-table th:nth-child(1), .seat-table td:nth-child(1) { width: 16%; }
.seat-table th:nth-child(2), .seat-table td:nth-child(2) { width: auto; }
.seat-table th:nth-child(3), .seat-table td:nth-child(3) { width: 18%; }
.seat-table th:nth-child(4), .seat-table td:nth-child(4) { width: 18%; }
.cell-input { width: 100%; box-sizing: border-box; min-width: 0; border: none; background: transparent; color: var(--c-text); padding: 7px 8px; font-size: 13px; outline: none; cursor: default; }
/* 席位表格不需要 hover 行高亮(覆盖全局 tr:hover td) */
.seat-table tbody tr:hover td,
.seat-table tbody tr:hover { background: transparent; }
.cell-input:focus { cursor: text; }
/* 席位/等级下拉浮层 */
.seat-dropdown {
  position: fixed;
  z-index: 3000;
  padding: 4px;
  border-radius: 10px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(16px) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(16px) saturate(var(--glass-saturate));
  max-height: 220px;
  overflow-y: auto;
}
.seat-dropdown-item {
  padding: 7px 12px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
  color: var(--c-text);
  white-space: nowrap;
  transition: background-color var(--transition), color var(--transition);
}
.seat-dropdown-item:hover { background: var(--c-primary-light); color: var(--c-primary); }
.seat-dropdown-item.active { background: var(--c-primary-light); color: var(--c-primary); font-weight: 600; }
.seat-cell-selected { background: var(--c-primary-light) !important; }
.seat-cell-selected .cell-input { color: var(--c-primary); }
.seat-row-selected td { background: var(--c-primary-light) !important; }
.seat-row-selected .cell-input { color: var(--c-primary); }
.cell-input:focus { box-shadow: inset 0 0 0 2px var(--c-primary); }

/* 编辑/创建弹窗（毛玻璃, 样式同用户管理; 宽度随内容） */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.modal-card {
  width: fit-content;
  min-width: 480px;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  overflow-y: auto;
  padding: 26px 28px;
  border-radius: 20px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
}
.modal-title { margin: 0 0 20px; font-size: 18px; font-weight: 600; }
.modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
.pos-chip { display:inline-block; background:var(--c-bg-light); padding:2px 6px; border-radius:4px; font-size:11px; margin:1px; white-space:nowrap; }
.poster-thumb { width:60px; height:40px; object-fit:cover; border-radius:4px; cursor:pointer; }
.poster-preview { display:block; max-width:200px; max-height:120px; margin-top:8px; border-radius:6px; object-fit:contain; }
.rating-dot { display:inline-block; background:var(--c-primary-light, #e0f0ff); color:var(--c-primary, #0066cc); padding:0 4px; border-radius:3px; font-size:10px; font-weight:600; margin-left:2px; }
@media (max-width: 600px) { .form-row { flex-direction: column; gap: 16px; } }

/* 活动列表列宽: 第1列30%, 第2列10%, 第3列8%, 第4~5列5%, 其余(状态/操作)填满右侧 */
.event-list th:nth-child(1), .event-list td:nth-child(1) { width: 25%; }
.event-list th:nth-child(2), .event-list td:nth-child(2) { width: 10%; }
.event-list th:nth-child(3), .event-list td:nth-child(3) { width: 8%; }
.event-list th:nth-child(4), .event-list td:nth-child(4),
.event-list th:nth-child(5), .event-list td:nth-child(5) { width: 8%; }
</style>
