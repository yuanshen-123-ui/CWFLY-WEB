<script setup>
/**
 * 带状态机的提交按钮（对齐 CTYFLY-WEB 的 MorphLoginButton 核心体验）
 * status: idle | loading | success | error
 * error 状态 1.2s 后 emit settle，由父组件置回 idle
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  status: { type: String, default: 'idle' },
  label: { type: String, default: '提交' },
  block: { type: Boolean, default: true },
})
const emit = defineEmits(['settle'])

const ERR_MS = 1200
let settleTimer = null

const disabled = computed(() => props.status === 'loading' || props.status === 'success')
const srStatus = computed(() => (
  { loading: '提交中', success: '提交成功', error: '提交失败，请重试' }[props.status] || ''
))

watch(() => props.status, (s) => {
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
  if (s === 'error') {
    settleTimer = setTimeout(() => emit('settle'), ERR_MS)
  }
})
onUnmounted(() => { if (settleTimer) clearTimeout(settleTimer) })

const pressed = ref(false)
</script>

<template>
  <button
    type="submit"
    class="btn btn-primary cw-submit"
    :class="[`is-${status}`, { 'btn-block': block, 'is-pressed': pressed }]"
    :disabled="disabled"
    :aria-busy="status === 'loading' ? 'true' : 'false'"
    :aria-label="srStatus || label"
    @pointerdown="pressed = true"
    @pointerup="pressed = false"
    @pointerleave="pressed = false"
  >
    <span class="cw-submit__icon" aria-hidden="true">
      <span v-if="status === 'loading'" class="cw-submit__spinner" />
      <svg v-else-if="status === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <svg v-else-if="status === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </span>
    <span class="cw-submit__label">{{ status === 'loading' ? '提交中…' : label }}</span>
    <span class="sr-only" role="status" aria-live="polite">{{ srStatus }}</span>
  </button>
</template>

<style scoped>
.cw-submit { position: relative; gap: 8px; }
.cw-submit__icon { display: none; align-items: center; justify-content: center; width: 18px; height: 18px; }
.cw-submit.is-loading .cw-submit__icon,
.cw-submit.is-success .cw-submit__icon,
.cw-submit.is-error .cw-submit__icon { display: inline-flex; }
.cw-submit.is-loading .cw-submit__label { opacity: .75; }
.cw-submit.is-success { background: var(--c-success, #30d158); border-color: transparent; }
.cw-submit.is-error { background: var(--c-danger, #ff453a); border-color: transparent; animation: submit-shake .42s cubic-bezier(.36, .07, .19, .97) 2; }
.cw-submit:disabled { cursor: not-allowed; }
.cw-submit__spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, .35);
  border-top-color: #fff;
  animation: submit-spin .7s linear infinite;
}
.cw-submit__icon svg { width: 18px; height: 18px; }
@keyframes submit-spin { to { transform: rotate(360deg); } }
@keyframes submit-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  50% { transform: translateX(6px); }
  75% { transform: translateX(-3px); }
}
</style>
