<script setup>
/**
 * 统一风格下拉选择（对齐 CTYFLY-WEB 的 SelectMenu，替换原生 <select>）
 * options: [{ value, label, hint? }]
 * 面板 Teleport 到 body，避免被卡片层叠上下文遮挡；自动上下翻转、Esc/外点关闭。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'change'])

const rootEl = ref(null)
const triggerEl = ref(null)
const panelEl = ref(null)
const open = ref(false)
const panelStyle = ref({})

const current = computed(() => props.options.find((o) => o.value === props.modelValue))
const displayText = computed(() => {
  if (current.value) return current.value.label
  return props.modelValue === '' || props.modelValue === undefined || props.modelValue === null
    ? ''
    : String(props.modelValue)
})

function updatePosition() {
  const rect = triggerEl.value?.getBoundingClientRect()
  if (!rect) return
  const panelH = Math.min(props.options.length * 40 + 12, 260)
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - rect.width - 8)
  let top
  if (window.innerHeight - rect.bottom < panelH && rect.top > panelH) {
    top = Math.max(8, rect.top - panelH - 6)
  } else {
    top = rect.bottom + 6
  }
  panelStyle.value = { left: `${left}px`, top: `${top}px`, width: `${rect.width}px` }
}

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) nextTick(() => { updatePosition(); centerSelected() })
}

function centerSelected() {
  const panel = panelEl.value
  if (!panel) return
  const active = panel.querySelector('.sm-option.active')
  if (!active) return
  const p = panel.getBoundingClientRect()
  const a = active.getBoundingClientRect()
  panel.scrollTop += (a.top - p.top) - (p.height - a.height) / 2
}

function onWindowChange() {
  if (open.value) updatePosition()
}

function pick(option) {
  emit('update:modelValue', option.value)
  emit('change', option.value)
  open.value = false
}

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

defineExpose({ open, close: () => { open.value = false } })
</script>

<template>
  <div ref="rootEl" class="sm" :class="{ disabled }">
    <button
      ref="triggerEl"
      :id="id || undefined"
      type="button"
      class="sm-trigger"
      :disabled="disabled"
      :aria-haspopup="'listbox'"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="sm-value" :class="{ empty: !displayText }">{{ displayText || placeholder }}</span>
      <span class="sm-chevron" :class="{ open }" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>

    <Teleport to="body">
      <transition name="sm-pop">
        <div v-if="open" ref="panelEl" class="sm-panel" :style="panelStyle" role="listbox">
          <div v-if="!options.length" class="sm-empty">暂无可选项</div>
          <button
            v-for="o in options"
            :key="String(o.value)"
            type="button"
            class="sm-option"
            :class="{ active: o.value === modelValue }"
            role="option"
            :aria-selected="o.value === modelValue"
            @click="pick(o)"
          >
            <span class="sm-option-label">
              {{ o.label }}
              <span v-if="o.hint" class="sm-hint">{{ o.hint }}</span>
            </span>
            <span v-if="o.value === modelValue" class="sm-check" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.sm { position: relative; width: 100%; }
.sm-trigger {
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
.sm-trigger:hover { border-color: var(--c-primary); }
.sm-trigger:focus-visible {
  outline: none;
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3.5px rgba(0, 113, 227, .18);
}
.sm.disabled { opacity: .55; pointer-events: none; }
.sm-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-value.empty { color: var(--c-text-muted); }
.sm-chevron {
  display: flex;
  color: var(--c-text-secondary);
  transition: transform .2s ease;
}
.sm-chevron.open { transform: rotate(180deg); }
</style>

<style>
/* Teleport 到 body 的面板不能写在 scoped 里 */
.sm-panel {
  position: fixed;
  z-index: 3000;
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 12px;
  background: var(--glass-bg-strong);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border-strong);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .18);
}
.sm-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: none;
  font-family: inherit;
  font-size: 14px;
  color: var(--c-text);
  text-align: left;
  cursor: pointer;
}
.sm-option:hover { background: rgba(0, 113, 227, .08); color: var(--c-primary); }
.sm-option.active { color: var(--c-primary); font-weight: 600; }
.sm-option-label { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.sm-hint { font-size: 12px; color: var(--c-text-muted); }
.sm-check { display: flex; color: var(--c-primary); }
.sm-empty { padding: 10px; font-size: 13px; color: var(--c-text-muted); text-align: center; }
.sm-pop-enter-active, .sm-pop-leave-active { transition: opacity .14s ease, transform .14s ease; }
.sm-pop-enter-from, .sm-pop-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
