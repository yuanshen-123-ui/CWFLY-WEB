<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>飞行计划</h1>
        <p>提交飞行计划到连飞网络</p>
      </div>
      <div class="flex gap-sm flex-wrap">
        <button class="btn btn-outline btn-sm" @click="showImport=true">从 SimBrief 导入</button>
        <button class="btn btn-outline btn-sm" @click="sharePlan" :disabled="!currentPlan">分享飞行计划</button>
        <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="deletePlan" :disabled="!currentPlan">删除飞行计划</button>
      </div>
    </div>

    <!-- SimBrief 导入对话框 -->
    <div v-if="showImport" class="card p-lg mb-lg fade-in">
      <h3 class="mb-md">从 SimBrief 导入</h3>
      <div class="flex gap-sm items-end" style="max-width:500px;">
        <div style="flex:1;">
          <label class="text-sm font-bold mb-sm" style="display:block;">SimBrief 用户 ID</label>
          <input v-model="simbriefId" class="input" placeholder="输入 SimBrief User ID" />
        </div>
        <button class="btn btn-primary" @click="importSimbrief" :disabled="importing">导入</button>
        <button class="btn btn-outline" @click="showImport=false; simbriefId=''">取消</button>
      </div>
    </div>

    <!-- 主表单 -->
    <div class="card p-lg">
      <div class="fp-form">
        <!-- 第一行：呼号 + 飞行类型 -->
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 呼号</label>
            <input v-model="form.callsign" class="input" placeholder="如 CES1234" maxlength="7" @input="sanitizeInput('callsign')" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 飞行类型</label>
            <select v-model="form.flightType" class="input">
              <option value="IFR">IFR（仪表飞行）</option>
              <option value="VFR">VFR（目视飞行）</option>
            </select>
          </div>
        </div>

        <!-- 第二行：飞机类型 + 二次雷达代码 -->
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 飞机类型 (ICAO)</label>
            <input v-model="form.aircraft" class="input" placeholder="如 A320 / B738" maxlength="5" @input="sanitizeInput('aircraft')" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">二次雷达代码 (仅 ICAO)</label>
            <input v-model="form.transponder" class="input" placeholder="LB1" @input="sanitizeInput('transponder')" />
          </div>
        </div>

        <!-- 第三行：尾流分类 + 巡航高度 -->
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 尾流分类</label>
            <select v-model="form.wakeCategory" class="input">
              <option value="">请选择</option>
              <option value="L">轻型机 (MTOW&lt;=7000kg)</option>
              <option value="M">中型机 (MTOW&lt;=136000kg)</option>
              <option value="H">重型机</option>
              <option value="J">超重型机 (A388)</option>
            </select>
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 巡航高度 (ft)</label>
            <input v-model="form.cruiseAlt" class="input" placeholder="如 35000（请勿填写 FL 开头）" @input="sanitizeInput('cruiseAlt'); onAltInput()" />
            <p v-if="altWarning" class="text-xs mt-xs" style="color:var(--c-warning);">{{ altWarning }}</p>
          </div>
        </div>

        <!-- 第四行：离场机场 + 到达机场 -->
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 离场机场 (ICAO)</label>
            <input v-model="form.depIcao" class="input" placeholder="如 ZSSS" maxlength="4" @input="sanitizeInput('depIcao')" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 到达机场 (ICAO)</label>
            <input v-model="form.arrIcao" class="input" placeholder="如 ZGHA" maxlength="4" @input="sanitizeInput('arrIcao')" />
          </div>
        </div>

        <!-- 第五行：备降机场 + 离场时间 -->
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 备降机场 (ICAO)</label>
            <input v-model="form.alternate" class="input" placeholder="如 ZHHH" maxlength="4" @input="sanitizeInput('alternate')" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 离场时间 (HHMM)</label>
            <input v-model="form.depTime" class="input" placeholder="如 2204" maxlength="4" @input="sanitizeInput('depTime')" />
          </div>
        </div>

        <!-- 第六行：飞行时间 + 巡航真空速 -->
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 飞行时间 (HH:MM)</label>
            <input v-model="form.flightTime" class="input" placeholder="如 0230" maxlength="4" @input="sanitizeInput('flightTime')" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 巡航真空速 (knots)</label>
            <input v-model="form.cruiseSpeed" class="input" placeholder="如 450" maxlength="3" inputmode="numeric" @input="sanitizeInput('cruiseSpeed')" />
          </div>
        </div>

        <!-- 第七行：滞空时间 + 设备代码 -->
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 滞空时间 (HH:MM)</label>
            <input v-model="form.endurance" class="input" placeholder="如 0400" maxlength="4" @input="sanitizeInput('endurance')" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">* 设备代码 (ICAO/FAA)</label>
            <input v-model="form.equipment" class="input" placeholder="SDE3FGHIRWY" @input="sanitizeInput('equipment')" />
          </div>
        </div>

        <!-- 航路 -->
        <div class="mb-md fp-full">
          <label class="text-sm font-bold mb-sm" style="display:block;">* 航路</label>
          <textarea v-model="form.route" class="input" rows="4" placeholder="如 BTO A461 ZHO W129 IG..." style="font-family:monospace;resize:vertical;" @input="sanitizeInput('route')"></textarea>
        </div>

        <!-- 备注 -->
        <div class="mb-md fp-full">
          <label class="text-sm font-bold mb-sm" style="display:block;">备注</label>
          <input v-model="form.remarks" class="input" placeholder="可选备注信息" @input="sanitizeInput('remarks')" />
        </div>

        <!-- 同步到 FSD（强制同步，不显示选项） -->
        <input v-model="form.syncFsd" type="hidden" value="true" />

        <!-- 按钮 -->
        <div class="flex gap-sm fp-full">
          <button class="btn btn-primary" @click="submitPlan" :disabled="submitting">
            {{ submitting ? '提交中...' : '提交飞行计划' }}
          </button>
          <button class="btn btn-outline" @click="resetForm">重置</button>
          <button v-if="currentPlan" class="btn btn-outline" @click="syncToFsd" :disabled="syncing">
            {{ syncing ? '同步中...' : '导入 ICAO 计划' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 我的飞行计划列表 -->
    <div class="card mt-lg">
      <div class="p-md" style="border-bottom:1px solid var(--c-border-light);">
        <h3 class="font-bold">我的飞行计划</h3>
      </div>
      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>呼号</th>
              <th>机型</th>
              <th>离场</th>
              <th>到达</th>
              <th>航路</th>
              <th>FSD 同步</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in myPlans" :key="p.id" :class="{ 'row-active': currentPlan?.id === p.id }" style="cursor:pointer;" @click="selectPlan(p)">
              <td class="font-bold">{{ p.callsign }}</td>
              <td>{{ p.aircraft || '-' }}</td>
              <td>{{ p.depIcao }}</td>
              <td>{{ p.arrIcao }}</td>
              <td class="text-sm text-muted truncate" style="max-width:200px;">{{ p.route || '-' }}</td>
              <td>
                <span class="badge" :class="p.syncFsd ? 'badge-success' : 'badge-default'">
                  {{ p.syncFsd ? '已同步' : '未同步' }}
                </span>
              </td>
              <td class="text-muted text-sm">{{ p.filedAt }}</td>
              <td>
                <div class="flex gap-xs">
                  <button class="btn btn-outline btn-sm" @click.stop="loadPlan(p)">载入</button>
                  <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click.stop="delPlan(p)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!myPlans.length">
              <td colspan="8" class="text-center text-muted">暂无飞行计划</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 分享弹窗 -->
    <div v-if="shareModal" class="modal-overlay" @click.self="shareModal=false">
      <div class="modal card p-lg">
        <h3 class="mb-md">分享飞行计划</h3>
        <p class="text-sm text-muted mb-md">使用以下链接或分享码分享你的飞行计划：</p>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">分享链接</label>
          <div class="flex gap-sm">
            <input :value="shareUrl" class="input" readonly ref="shareUrlInput" @click="$event.target.select()" />
            <button class="btn btn-primary btn-sm" @click="copyShareUrl">复制</button>
          </div>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">分享码</label>
          <div class="flex gap-sm">
            <input :value="currentPlan?.shareId" class="input" readonly style="font-weight:700;font-size:18px;text-align:center;letter-spacing:3px;" />
            <button class="btn btn-outline btn-sm" @click="copyShareCode">复制</button>
          </div>
        </div>
        <button class="btn btn-outline w-full" @click="shareModal=false">关闭</button>
      </div>
    </div>
    <!-- 站内提示 Toast -->
    <div class="toast-container">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="'toast-' + t.type" @click="removeToast(t.id)">
        {{ t.message }}
      </div>
    </div>

    <!-- 确认弹窗 -->
    <div v-if="confirmDialog.show" class="modal-overlay" @click.self="cancelConfirm">
      <div class="modal card p-lg" style="max-width:400px;">
        <h3 class="mb-md">确认操作</h3>
        <p class="mb-lg">{{ confirmDialog.message }}</p>
        <div class="flex gap-sm justify-end">
          <button class="btn btn-outline" @click="cancelConfirm">取消</button>
          <button class="btn btn-danger" @click="confirmDialog.resolve(true); confirmDialog.show=false">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { flightplanApi } from '@/api'

const route = useRoute()
const router = useRouter()

const form = ref({
  callsign: '',
  flightType: 'IFR',
  aircraft: '',
  wakeCategory: '',
  equipment: '',
  transponder: '',
  depIcao: '',
  depTime: '',
  cruiseAlt: '',
  cruiseSpeed: '',
  arrIcao: '',
  alternate: '',
  flightTime: '',
  endurance: '',
  route: '',
  remarks: '',
  syncFsd: true
})

const myPlans = ref([])

// ===== 飞行计划字段格式校验（与后端一致）: 不匹配的字段提交时清空抛弃 =====
const FP_PATTERNS = {
  callsign: /^[A-Za-z0-9]{1,7}$/,       // 呼号: 英文+数字 最大7位
  flightType: /^(IFR|VFR)$/i,           // 飞行类型
  aircraft: /^[A-Za-z0-9]{1,5}$/,       // 飞机类型: 英文+数字 最大5位
  transponder: /^[A-Za-z0-9]+$/,        // 二次雷达代码: 英文+数字 无位数限制
  wakeCategory: /^(L|M|H|J)$/i,         // 尾流分类代码
  cruiseAlt: /^\d{1,5}$/,               // 巡航高度: 数字 最大5位
  depIcao: /^[A-Za-z]{1,4}$/i,          // 离场机场: 英文 最大4位
  arrIcao: /^[A-Za-z]{1,4}$/i,          // 到达机场: 英文 最大4位
  alternate: /^[A-Za-z]{1,4}$/i,        // 备降机场: 英文 最大4位
  depTime: /^\d{4}$/,                   // 离场时间: 数字4位
  flightTime: /^\d{4}$/,                // 飞行时间: 数字4位
  cruiseSpeed: /^\d{3}$/,               // 巡航真空速: 数字3位
  endurance: /^\d{4}$/,                 // 滞空时间: 数字4位
  equipment: /^[A-Za-z0-9]+$/,          // 设备代码: 英文+数字 无位数限制
  route: /^[A-Za-z0-9\s]+$/,            // 航路: 英文+数字(含空格) 无位数限制
  remarks: /^[A-Za-z0-9\s]+$/           // 备注: 英文+数字(含空格) 无位数限制
}
const FP_FIELD_NAMES = {
  callsign: '呼号', flightType: '飞行类型', aircraft: '飞机类型',
  transponder: '二次雷达代码', wakeCategory: '尾流分类', cruiseAlt: '巡航高度',
  depIcao: '离场机场', arrIcao: '到达机场', alternate: '备降机场',
  depTime: '离场时间', flightTime: '飞行时间', cruiseSpeed: '巡航真空速',
  endurance: '滞空时间', equipment: '设备代码', route: '航路', remarks: '备注'
}
/** 校验并清空(抛弃)不匹配正则的字段, 返回被清空的字段中文名 */
function sanitizeForm() {
  const ignored = []
  for (const key in FP_FIELD_NAMES) {
    const v = form.value[key]
    if (typeof v === 'string' && v.trim() && !FP_PATTERNS[key].test(v.trim())) {
      form.value[key] = ''
      ignored.push(FP_FIELD_NAMES[key])
    }
  }
  return ignored
}

// ===== 输入实时清理规则: 超位数/非法字符直接抛弃 =====
const FP_INPUT_RULES = {
  callsign: { chars: 'A-Za-z0-9', max: 7 },      // 呼号: 英文+数字 最大7位
  aircraft: { chars: 'A-Za-z0-9', max: 5 },      // 飞机类型: 英文+数字 最大5位
  transponder: { chars: 'A-Za-z0-9', max: Infinity }, // 二次雷达: 无限制
  cruiseAlt: { chars: '0-9', max: 5 },           // 巡航高度: 数字 最大5位
  depIcao: { chars: 'A-Za-z', max: 4, upper: true },  // 机场: 英文 最大4位
  arrIcao: { chars: 'A-Za-z', max: 4, upper: true },
  alternate: { chars: 'A-Za-z', max: 4, upper: true },
  depTime: { chars: '0-9', max: 4 },             // 时间: 数字4位
  flightTime: { chars: '0-9', max: 4 },
  cruiseSpeed: { chars: '0-9', max: 3 },         // 真空速: 数字3位
  endurance: { chars: '0-9', max: 4 },
  equipment: { chars: 'A-Za-z0-9', max: Infinity }, // 设备代码: 无限制
  route: { chars: 'A-Za-z0-9\\s', max: Infinity },   // 航路: 英文数字空格
  remarks: { chars: 'A-Za-z0-9\\s', max: Infinity }  // 备注: 英文数字空格
}
/** 输入时实时清理: 抛弃超位部分与非法字符 */
function sanitizeInput(key) {
  const rule = FP_INPUT_RULES[key]
  if (!rule) return
  let v = form.value[key] == null ? '' : String(form.value[key])
  if (rule.max !== Infinity && v.length > rule.max) v = v.slice(0, rule.max)
  v = v.replace(new RegExp(`[^${rule.chars}]`, 'g'), '')
  if (rule.upper) v = v.toUpperCase()
  form.value[key] = v
}
const currentPlan = ref(null)
const submitting = ref(false)
const syncing = ref(false)
const importing = ref(false)
const showImport = ref(false)
const simbriefId = ref('')
const shareModal = ref(false)
const altWarning = ref('')
const submittedIds = ref(new Set())
let toastId = 0
const toasts = ref([])
function showToast(msg, type = 'success') {
  const id = ++toastId
  toasts.value.push({ id, message: msg, type })
  const duration = type === 'error' ? 4000 : 3000
  setTimeout(() => { removeToast(id) }, duration)
  if (type === 'error') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
function removeToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}
const confirmDialog = ref({ show: false, message: '', resolve: null })
function showConfirm(msg) {
  return new Promise(resolve => {
    confirmDialog.value = { show: true, message: msg, resolve }
  })
}
function cancelConfirm() {
  confirmDialog.value.resolve(false)
  confirmDialog.value.show = false
}

const shareUrl = computed(() => {
  if (!currentPlan.value?.shareId) return ''
  return `${window.location.origin}/flight-plan/share/${currentPlan.value.shareId}`
})

function onAltInput() {
  const val = form.value.cruiseAlt.toUpperCase()
  if (val.startsWith('FL')) {
    altWarning.value = '⚠️ 请勿填写 FL 开头，直接填写数字（如 35000），否则飞行计划无法被识别'
  } else {
    altWarning.value = ''
  }
}

onMounted(async () => {
  // JWT 校验: 未登录则跳转登录页（路由守卫已拦截, 此处兜底）
  if (!localStorage.getItem('cw_token')) {
    router.replace('/login')
    return
  }
  // 从 URL 查询参数预填表单（外部传入飞行计划）
  applyQueryParams()
  try {
    const res = await flightplanApi.list()
    myPlans.value = res.data
    // 仅当无 URL 参数时才自动载入第一条（避免覆盖参数预填的表单）
    if (myPlans.value.length > 0 && !hasQueryParams()) {
      loadPlan(myPlans.value[0])
    }
  } catch { /* ignore */ }
})

// ===== URL 参数预填：/flight-plan?callsign=...&flightType=... =====
// 支持参数: callsign/flightType/aircraft/transponder/wakeCategory/cruiseAlt/
//           depIcao/arrIcao/alticao(备降)/depTime/flightTime/flightspd(巡航真空速)/
//           hangtime(滞空)/equipment/route/remarks
const wakeMap = { '轻型机': 'L', '中型机': 'M', '重型机': 'H', '超重型机': 'J' }
function applyQueryParams() {
  const q = route.query
  const f = form.value
  // 参数名 → 表单字段名
  const PARAM_TO_FIELD = {
    callsign: 'callsign', flightType: 'flightType', aircraft: 'aircraft',
    transponder: 'transponder', wakeCategory: 'wakeCategory', cruiseAlt: 'cruiseAlt',
    depIcao: 'depIcao', arrIcao: 'arrIcao', alticao: 'alternate',
    depTime: 'depTime', flightTime: 'flightTime', flightspd: 'cruiseSpeed',
    hangtime: 'endurance', equipment: 'equipment', route: 'route', remarks: 'remarks'
  }
  for (const pname in PARAM_TO_FIELD) {
    if (q[pname] == null) continue
    const key = PARAM_TO_FIELD[pname]
    let v = String(q[pname]).trim()
    // 尾流分类: 中文名映射后按代码严格校验（仅 L/M/H/J, 其他抛弃）
    if (key === 'wakeCategory') {
      const mapped = wakeMap[v]
      const code = (mapped || v).toUpperCase()
      if (/^[LMHJ]$/.test(code)) f.wakeCategory = code
      continue
    }
    // 其余参数: 必须匹配对应正则, 不匹配直接抛弃（不填入）
    if (!FP_PATTERNS[key] || !FP_PATTERNS[key].test(v)) continue
    // 机场转大写
    if (key === 'depIcao' || key === 'arrIcao' || key === 'alternate') v = v.toUpperCase()
    f[key] = v
  }
}
function hasQueryParams() {
  return Object.keys(route.query).length > 0
}

function resetForm() {
  form.value = {
    callsign: '',
    flightType: 'IFR',
    aircraft: '',
    wakeCategory: '',
    equipment: '',
    transponder: '',
    depIcao: '',
    depTime: '',
    cruiseAlt: '',
    cruiseSpeed: '',
    arrIcao: '',
    alternate: '',
    flightTime: '',
    endurance: '',
    route: '',
    remarks: '',
    syncFsd: true
  }
  currentPlan.value = null
}

function selectPlan(p) {
  currentPlan.value = p
}

function loadPlan(p) {
  form.value = {
    callsign: p.callsign,
    flightType: p.flightType,
    aircraft: p.aircraft,
    wakeCategory: p.wakeCategory,
    equipment: p.equipment,
    transponder: p.transponder,
    depIcao: p.depIcao,
    depTime: p.depTime,
    cruiseAlt: p.cruiseAlt,
    cruiseSpeed: p.cruiseSpeed,
    arrIcao: p.arrIcao,
    alternate: p.alternate,
    flightTime: p.flightTime,
    endurance: p.endurance,
    route: p.route,
    remarks: p.remarks,
    syncFsd: false
  }
  currentPlan.value = p
}

// FSD 广播由 fsd-py 周期扫描执行(约 5s), 提交后轮询直到该计划显示"已同步"
async function waitFsdSync(id) {
  for (let i = 0; i < 8; i++) {  // 最多约 16s
    await new Promise(r => setTimeout(r, 2000))
    try {
      const r = await flightplanApi.list()
      const p = (r.data || []).find(x => x.id === id)
      if (p?.syncFsd) return p
    } catch {}
  }
  return null
}

async function submitPlan() {
  // 字段格式校验: 清空(抛弃)不匹配正则的内容
  const ignored = sanitizeForm()
  if (ignored.length) {
    showToast('已忽略不合法字段: ' + ignored.join('、'), 'error')
  }
  if (!form.value.callsign || !form.value.depIcao || !form.value.arrIcao) {
    return showToast('请填写呼号、离场机场和到达机场', 'error')
  }
  // 防重复提交：使用表单快照做唯一标识
  const snapshot = JSON.stringify(form.value)
  if (submittedIds.value.has(snapshot)) {
    return showToast('该飞行计划已提交，请勿重复提交', 'error')
  }
  submitting.value = true
  try {
    const res = await flightplanApi.submit({
      ...form.value,
      // number 输入框会提交数字，后端字段是字符串，统一转成字符串
      cruiseSpeed: String(form.value.cruiseSpeed ?? '')
    })
    submittedIds.value.add(snapshot)
    // 覆盖(30分钟内重复提交)时替换同 id 旧项并置顶, 避免列表重复
    myPlans.value = [res.data, ...myPlans.value.filter(x => x.id !== res.data.id)]
    currentPlan.value = res.data
    showToast(res.data.overwritten ? '飞行计划已更新！' : '飞行计划提交成功！')
    // 等待 fsd-py 周期广播完成后, 自动把该计划刷新为"已同步", 无需手动刷新页面
    waitFsdSync(res.data.id).then(p => {
      if (p) {
        const i = myPlans.value.findIndex(x => x.id === p.id)
        if (i >= 0) myPlans.value[i] = p
        if (currentPlan.value?.id === p.id) currentPlan.value = p
      }
    })
  } catch (e) {
    const errMsg = e.response?.data?.message || e.message || '网络错误'
    showToast('提交失败: ' + errMsg, 'error')
  } finally {
    submitting.value = false
  }
}

async function delPlan(p) {
  if (!(await showConfirm(`确定删除 ${p.callsign} 的飞行计划？`))) return
  try {
    await flightplanApi.delete(p.id)
    myPlans.value = myPlans.value.filter(x => x.id !== p.id)
    if (currentPlan.value?.id === p.id) currentPlan.value = null
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function deletePlan() {
  if (currentPlan.value) delPlan(currentPlan.value)
}

async function syncToFsd() {
  if (!currentPlan.value) return
  syncing.value = true
  try {
    await flightplanApi.syncToFsd(currentPlan.value.id)
    currentPlan.value.syncFsd = true
    showToast('飞行计划已同步到 FSD 连飞网络')
  } catch (e) {
    showToast('FSD 同步失败: ' + e.message, 'error')
  } finally {
    syncing.value = false
  }
}

async function importSimbrief() {
  if (!simbriefId.value) return showToast('请输入 SimBrief 用户 ID', 'error')
  importing.value = true
  try {
    const res = await flightplanApi.simbriefImport(simbriefId.value)
    myPlans.value.unshift(res.data)
    currentPlan.value = res.data
    loadPlan(res.data)
    showImport.value = false
    simbriefId.value = ''
    showToast('已从 SimBrief 导入飞行计划')
  } catch (e) {
    showToast('导入失败: ' + e.message, 'error')
  } finally {
    importing.value = false
  }
}

function sharePlan() {
  if (!currentPlan.value) return showToast('请先提交或选择一个飞行计划', 'error')
  shareModal.value = true
}

function copyShareUrl() {
  navigator.clipboard.writeText(shareUrl.value).then(() => {
    showToast('分享链接已复制')
  })
}

function copyShareCode() {
  if (currentPlan.value?.shareId) {
    navigator.clipboard.writeText(currentPlan.value.shareId).then(() => {
      showToast('分享码已复制')
    })
  }
}
</script>

<style scoped>
.fp-form {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  align-items: start;
}

/* form-row 不生成盒子, form-col 直接作为 3 列 grid 子项自动排列 */
.form-row {
  display: contents;
}

/* 占满整行的元素（航路/备注/按钮） */
.fp-full {
  grid-column: 1 / -1;
}

@media (max-width: 640px) {
  .fp-form {
    grid-template-columns: 1fr;
  }
}

.form-col {
  display: flex;
  flex-direction: column;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  animation: toastIn 0.3s ease;
  max-width: 360px;
}
.toast-success { background: #10b981; color: #fff; }
.toast-error { background: #ef4444; color: #fff; font-size: 15px; padding: 14px 24px; animation: toastShake 0.5s ease; }

@keyframes toastShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8px); }
  75% { transform: translateX(8px); }
}
.toast-info { background: #3b82f6; color: #fff; }
@keyframes toastIn {
  from { opacity: 0; transform: translateX(80px); }
  to { opacity: 1; transform: translateX(0); }
}

.row-active {
  background: var(--c-primary-light) !important;
}

/* 弹窗遮罩 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: 480px;
  max-width: 90vw;
}
</style>
