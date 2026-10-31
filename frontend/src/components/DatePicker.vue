<script setup>
/**
 * 统一日期/日期时间选择器（替换原生 <input type="date|datetime-local">）
 * - v-model 字符串：'YYYY-MM-DD'；withTime 时 'YYYY-MM-DDTHH:mm'
 * - 面板 Teleport 到 body，自动上下翻转；Esc / 外点关闭
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  withTime: { type: Boolean, default: false },
  placeholder: { type: String, default: '选择日期' },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'change'])

const rootEl = ref(null)
const triggerEl = ref(null)
const panelEl = ref(null)
const open = ref(false)
const panelStyle = ref({})
const pad = (n) => String(n).padStart(2, '0')

const parsed = computed(() => {
  const raw = String(props.modelValue || '')
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) {
    const now = new Date()
    return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate(), hh: '00', mi: '00' }
  }
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), hh: m[4] || '00', mi: m[5] || '00' }
})

const view = ref({ y: parsed.value.y, mo: parsed.value.mo })
const picked = ref(props.modelValue ? { y: parsed.value.y, mo: parsed.value.mo, d: parsed.value.d } : null)
const hour = ref(parsed.value.hh)
const minute = ref(parsed.value.mi)

watch(() => props.modelValue, () => {
  view.value = { y: parsed.value.y, mo: parsed.value.mo }
  picked.value = props.modelValue ? { y: parsed.value.y, mo: parsed.value.mo, d: parsed.value.d } : null
  hour.value = parsed.value.hh
  minute.value = parsed.value.mi
})

const displayText = computed(() => {
  if (!props.modelValue) return ''
  return props.withTime ? `${props.modelValue.replace('T', ' ').slice(0, 16)}` : props.modelValue.slice(0, 10)
})

const monthLabel = computed(() => `${view.value.y} 年 ${view.value.mo} 月`)
const weekDays = ['一', '二', '三', '四', '五', '六', '日']

const days = computed(() => {
  const first = new Date(view.value.y, view.value.mo - 1, 1)
  const offset = (first.getDay() + 6) % 7 // 周一开头
  const total = new Date(view.value.y, view.value.mo, 0).getDate()
  const list = []
  for (let i = 0; i < offset; i++) list.push(null)
  for (let d = 1; d <= total; d++) list.push(d)
  return list
})

function updatePosition() {
  const rect = triggerEl.value?.getBoundingClientRect()
  if (!rect) return
  const width = Math.max(rect.width, 288)
  const panelH = props.withTime ? 380 : 330
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
  const top = window.innerHeight - rect.bottom < panelH && rect.top > panelH
    ? Math.max(8, rect.top - panelH - 6)
    : rect.bottom + 6
  panelStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px` }
}

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) nextTick(() => updatePosition())
}

function shiftMonth(delta) {
  let mo = view.value.mo + delta
  let y = view.value.y
  if (mo < 1) { mo = 12; y -= 1 }
  if (mo > 12) { mo = 1; y += 1 }
  view.value = { y, mo }
}

function pickDay(d) {
  if (!d) return
  picked.value = { y: view.value.y, mo: view.value.mo, d }
  if (!props.withTime) commit()
}

function commit() {
  if (!picked.value) return
  const base = `${picked.value.y}-${pad(picked.value.mo)}-${pad(picked.value.d)}`
  const value = props.withTime ? `${base}T${pad(hour.value)}:${pad(minute.value)}` : base
  emit('update:modelValue', value)
  emit('change', value)
  open.value = false
}

function clearValue() {
  emit('update:modelValue', '')
  emit('change', '')
  open.value = false
}

function onWindowChange() { if (open.value) updatePosition() }
function onDocClick(e) {
  if (!open.value) return
  const t = e.target
  if (rootEl.value?.contains(t) || panelEl.value?.contains(t)) return
  open.value = false
}
function onKey(e) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  window.addEventListener('scroll', onWindowChange, true)
  window.addEventListener('resize', onWindowChange)
  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onWindowChange, true)
  window.removeEventListener('resize', onWindowChange)
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="rootEl" class="dp" :class="{ disabled }">
    <button
      ref="triggerEl"
      :id="id || undefined"
      type="button"
      class="dp-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="dp-value" :class="{ empty: !displayText }">{{ displayText || placeholder }}</span>
      <span class="dp-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </span>
    </button>

    <Teleport to="body">
      <transition name="dp-pop">
        <div v-if="open" ref="panelEl" class="dp-panel" :style="panelStyle">
          <div class="dp-head">
            <button type="button" class="dp-nav" @click="shiftMonth(-1)">‹</button>
            <span class="dp-month">{{ monthLabel }}</span>
            <button type="button" class="dp-nav" @click="shiftMonth(1)">›</button>
          </div>
          <div class="dp-week">
            <span v-for="w in weekDays" :key="w">{{ w }}</span>
          </div>
          <div class="dp-days">
            <button
              v-for="(d, i) in days"
              :key="i"
              type="button"
              class="dp-day"
              :class="{
                empty: !d,
                active: d && picked && picked.y === view.y && picked.mo === view.mo && picked.d === d,
              }"
              :disabled="!d"
              @click="pickDay(d)"
            >{{ d || '' }}</button>
          </div>
          <div v-if="withTime" class="dp-time">
            <span>时间</span>
            <input v-model="hour" class="dp-time-input" maxlength="2" inputmode="numeric" aria-label="小时" />
            <span>:</span>
            <input v-model="minute" class="dp-time-input" maxlength="2" inputmode="numeric" aria-label="分钟" />
          </div>
          <div class="dp-foot">
            <button type="button" class="dp-btn" @click="clearValue">清空</button>
            <button v-if="withTime" type="button" class="dp-btn dp-btn--primary" @click="commit">确定</button>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dp { position: relative; width: 100%; }
.dp-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 14px;
  font-family: inherit;
  font-size: 15px;
  color: var(--c-text);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.dp-trigger:hover { border-color: var(--c-primary); }
.dp-trigger:focus-visible {
  outline: none;
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3.5px rgba(0, 113, 227, .18);
}
.dp.disabled { opacity: .55; pointer-events: none; }
.dp-value { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-value.empty { color: var(--c-text-muted); }
.dp-icon { display: flex; color: var(--c-text-secondary); }
</style>

<style>
.dp-panel {
  position: fixed;
  z-index: 3000;
  padding: 12px;
  border-radius: 14px;
  background: var(--glass-bg-strong);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border-strong);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .18);
  user-select: none;
}
.dp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.dp-month { font-size: 14px; font-weight: 600; color: var(--c-text); }
.dp-nav {
  width: 28px; height: 28px;
  border: none; border-radius: 8px;
  background: none; color: var(--c-text-secondary);
  font-size: 18px; line-height: 1; cursor: pointer;
}
.dp-nav:hover { background: rgba(0, 113, 227, .08); color: var(--c-primary); }
.dp-week, .dp-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.dp-week span {
  text-align: center; font-size: 11.5px; color: var(--c-text-muted); padding: 2px 0;
}
.dp-day {
  height: 32px; border: none; border-radius: 8px; background: none;
  font-family: inherit; font-size: 13px; color: var(--c-text); cursor: pointer;
}
.dp-day:hover:not(:disabled) { background: rgba(0, 113, 227, .1); color: var(--c-primary); }
.dp-day.active { background: var(--c-primary); color: #fff; font-weight: 600; }
.dp-day.empty { visibility: hidden; }
.dp-time { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 13px; color: var(--c-text-secondary); }
.dp-time-input {
  width: 48px; padding: 6px 8px; border-radius: 8px; font-family: inherit; font-size: 13px;
  border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--c-text); text-align: center;
}
.dp-time-input:focus { outline: none; border-color: var(--c-primary); }
.dp-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.dp-btn {
  padding: 6px 12px; border: none; border-radius: 8px; cursor: pointer;
  font-family: inherit; font-size: 13px; background: rgba(128, 128, 128, .12); color: var(--c-text);
}
.dp-btn--primary { background: var(--c-primary); color: #fff; }
.dp-pop-enter-active, .dp-pop-leave-active { transition: opacity .14s ease, transform .14s ease; }
.dp-pop-enter-from, .dp-pop-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
