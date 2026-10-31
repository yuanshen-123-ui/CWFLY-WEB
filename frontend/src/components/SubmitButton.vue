<script setup>
/**
 * 登录提交按钮 —— 形变状态机。
 *
 * 交互设计（2026-11 收口）：
 *   idle    长方形按钮（宽度撑满，显示文案）
 *   loading 收缩成圆球 + 旋转加载环（不显示任何文字）
 *   success 绿色圆球 + 白色对勾（描边绘制动画）
 *   error   红色圆球 + 白色叉号（抖动 + 描边绘制）
 *
 * - error 状态 1.2s、success 状态 1.6s 后 emit('settle')，由父组件决定是否置回 idle；
 *   登录页在 success 后自行跳转，组件随页面卸载。
 * - 尊重 prefers-reduced-motion：不做形变/抖动，只切换颜色与图标。
 * - 无障碍：保留 sr-only 实时状态，按钮 aria-label 随状态更新。
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  /** idle | loading | success | error */
  status: { type: String, default: 'idle' },
  /** 仅 idle 态展示的文案 */
  label: { type: String, default: '提交' },
  /** 是否撑满一行（idle 态有效） */
  block: { type: Boolean, default: true },
})
const emit = defineEmits(['settle'])

const ERROR_SETTLE_MS = 1200
const SUCCESS_SETTLE_MS = 1600

const srText = computed(() => ({
  loading: '提交中',
  success: '提交成功',
  error: '提交失败，请重试',
}[props.status] || ''))

const ariaLabel = computed(() => srText.value || props.label)
const disabled = computed(() => props.status === 'loading' || props.status === 'success')
const isMorph = computed(() => props.status !== 'idle')

let settleTimer = null
function clearSettleTimer() {
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

watch(() => props.status, (s) => {
  clearSettleTimer()
  if (s === 'error') {
    settleTimer = setTimeout(() => emit('settle'), ERROR_SETTLE_MS)
  } else if (s === 'success') {
    settleTimer = setTimeout(() => emit('settle'), SUCCESS_SETTLE_MS)
  }
})
onUnmounted(clearSettleTimer)

/** 按下反馈（仅 idle 态有意义） */
const pressed = ref(false)
function onPointerDown() {
  if (props.status === 'idle') pressed.value = true
}
function onPointerUp() {
  pressed.value = false
}
</script>

<template>
  <button
    type="submit"
    class="btn btn-primary cw-submit"
    :class="[`is-${status}`, { 'btn-block': block && !isMorph, 'is-pressed': pressed, 'is-morph': isMorph }]"
    :disabled="disabled"
    :aria-busy="status === 'loading' ? 'true' : 'false'"
    :aria-label="ariaLabel"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
  >
    <!-- idle：文字 -->
    <span class="cw-submit__label">{{ label }}</span>

    <!-- loading：圆球内的旋转环 -->
    <span v-if="status === 'loading'" class="cw-submit__glyph" aria-hidden="true">
      <span class="cw-submit__spinner" />
    </span>

    <!-- success：绿色圆球 + 对勾 -->
    <span v-else-if="status === 'success'" class="cw-submit__glyph" aria-hidden="true">
      <svg class="cw-submit__check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>

    <!-- error：红色圆球 + 叉 -->
    <span v-else-if="status === 'error'" class="cw-submit__glyph" aria-hidden="true">
      <svg class="cw-submit__cross" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="3" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </span>

    <span class="sr-only" role="status" aria-live="polite">{{ srText }}</span>
  </button>
</template>

<style scoped>
.cw-submit {
  --submit-circle: 48px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 0 24px;
  overflow: hidden;
  border-radius: 12px;
  /* 长方形 ↔ 圆球：宽/高/圆角/内边距同步形变，背景色单独过渡 */
  transition:
    width .46s cubic-bezier(.34, 1.28, .56, 1),
    height .46s cubic-bezier(.34, 1.28, .56, 1),
    padding .46s cubic-bezier(.34, 1.28, .56, 1),
    border-radius .46s cubic-bezier(.34, 1.28, .56, 1),
    background-color .28s ease,
    border-color .28s ease,
    box-shadow .28s ease,
    transform .12s ease;
}

/* 变成圆球：无论 block 与否都收成固定直径并水平居中 */
.cw-submit.is-morph {
  width: var(--submit-circle) !important;
  min-width: var(--submit-circle);
  max-width: var(--submit-circle);
  height: var(--submit-circle);
  margin-left: auto;
  margin-right: auto;
  padding: 0;
  border-radius: 50%;
}

.cw-submit.is-loading {
  cursor: progress;
}
.cw-submit.is-success {
  background: var(--c-success, #30d158);
  border-color: transparent;
  box-shadow: 0 6px 20px rgba(48, 209, 88, .32);
  cursor: default;
}
.cw-submit.is-error {
  background: var(--c-danger, #ff453a);
  border-color: transparent;
  box-shadow: 0 6px 20px rgba(255, 69, 58, .32);
  animation: cw-submit-shake .42s cubic-bezier(.36, .07, .19, .97) 2;
}
.cw-submit:disabled {
  cursor: not-allowed;
}

/* 文案：形变期间不占位、不显示 */
.cw-submit__label {
  transition: opacity .16s ease;
  white-space: nowrap;
}
.cw-submit.is-morph .cw-submit__label {
  opacity: 0;
  pointer-events: none;
}

/* 形变态图标层：始终绝对居中，避免形变抖动 */
.cw-submit__glyph {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transform: scale(.6);
  transition: opacity .2s ease, transform .32s cubic-bezier(.34, 1.4, .56, 1);
}
.cw-submit__glyph svg {
  width: 22px;
  height: 22px;
}
.cw-submit.is-loading .cw-submit__glyph,
.cw-submit.is-success .cw-submit__glyph,
.cw-submit.is-error .cw-submit__glyph {
  opacity: 1;
  transform: scale(1);
}

.cw-submit__spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, .35);
  border-top-color: #fff;
  animation: cw-submit-spin .7s linear infinite;
}

/* 对勾/叉号描边绘制 */
.cw-submit__check polyline {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: cw-submit-draw .34s .08s ease-out forwards;
}
.cw-submit__cross line {
  stroke-dasharray: 17;
  stroke-dashoffset: 17;
}
.cw-submit__cross line:nth-child(1) {
  animation: cw-submit-draw .2s .06s ease-out forwards;
}
.cw-submit__cross line:nth-child(2) {
  animation: cw-submit-draw .2s .18s ease-out forwards;
}

/* 按下微缩（仅 idle） */
.cw-submit.is-pressed:not(.is-morph) {
  transform: scale(.985);
}

@keyframes cw-submit-spin {
  to { transform: rotate(360deg); }
}
@keyframes cw-submit-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes cw-submit-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  50% { transform: translateX(6px); }
  75% { transform: translateX(-3px); }
}

/* 无动画偏好：不做形变位移/抖动，仅状态色与图标切换 */
@media (prefers-reduced-motion: reduce) {
  .cw-submit {
    transition: background-color .12s ease, border-color .12s ease;
  }
  .cw-submit.is-error {
    animation: none;
  }
  .cw-submit__glyph {
    transition: opacity .12s ease;
    transform: none;
  }
  .cw-submit__spinner {
    animation-duration: 1.4s;
  }
  .cw-submit__check polyline,
  .cw-submit__cross line {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>
