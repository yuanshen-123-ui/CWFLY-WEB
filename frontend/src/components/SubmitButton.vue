<script setup>
/**
 * 登录提交按钮 —— 形变状态机（v3：从两侧向中间收缩）。
 *
 * 形变方式：
 *   按钮放在一个「占满整行、水平居中」的网格容器里，形变时只动画按钮自身宽度。
 *   由于容器居中：左边缘向右、右边缘向左，同时向中间收缩成圆球（不是从一侧缩）。
 *
 * 状态：
 *   idle    长方形（显示文字）
 *   loading 圆球 + 慢速旋转环（无文字）
 *   success 绿色圆球 + 白色对勾（描边绘制，0.6s）
 *   error   红色圆球 + 白色叉号（两笔错峰绘制）
 *
 * 体验保护：服务端响应很快时（登录失败常在 100ms 内返回），会先把「收缩」播完
 * （最少 MIN_MORPH_MS），再显示成功/失败图标，确保用户看得到「从两侧收成圆球」的过程。
 *
 * - 尊重 prefers-reduced-motion：不做形变/抖动，只切换颜色与图标。
 * - 无障碍：保留 sr-only 实时状态，aria-label 随显示状态更新。
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

const ERROR_SETTLE_MS = 1400
const SUCCESS_SETTLE_MS = 2200
/** 收缩动画最短展示时长（ms）：保证「两侧向中间收」完整可见 */
const MIN_MORPH_MS = 700

/** 实际用于渲染的状态（可能比 props.status 稍晚，用于播完收缩动画） */
const displayStatus = ref(props.status)

let morphStartAt = 0
let pendingTimer = null
let settleTimer = null

function clearTimer(timer) {
  if (timer) clearTimeout(timer)
  return null
}

function scheduleSettle(status) {
  settleTimer = clearTimer(settleTimer)
  if (status === 'error') {
    settleTimer = setTimeout(() => emit('settle'), ERROR_SETTLE_MS)
  } else if (status === 'success') {
    settleTimer = setTimeout(() => emit('settle'), SUCCESS_SETTLE_MS)
  }
}

function applyStatus(next) {
  displayStatus.value = next
  scheduleSettle(next)
}

watch(() => props.status, (next) => {
  pendingTimer = clearTimer(pendingTimer)
  settleTimer = clearTimer(settleTimer)

  if (next === 'idle') {
    displayStatus.value = 'idle'
    morphStartAt = 0
    return
  }

  if (next === 'loading') {
    morphStartAt = Date.now()
    displayStatus.value = 'loading'
    return
  }

  // success / error：若收缩刚开始，先等收缩播完再切图标与颜色
  if (!morphStartAt) morphStartAt = Date.now()
  const elapsed = Date.now() - morphStartAt
  if (elapsed >= MIN_MORPH_MS) {
    applyStatus(next)
  } else {
    pendingTimer = setTimeout(() => applyStatus(props.status), MIN_MORPH_MS - elapsed)
  }
})

onUnmounted(() => {
  pendingTimer = clearTimer(pendingTimer)
  settleTimer = clearTimer(settleTimer)
})

const srText = computed(() => ({
  loading: '提交中',
  success: '提交成功',
  error: '提交失败，请重试',
}[displayStatus.value] || ''))

const ariaLabel = computed(() => props.status === 'idle' ? props.label : (srText.value || props.label))
const disabled = computed(() => props.status === 'loading' || props.status === 'success')
const isMorph = computed(() => props.status !== 'idle')

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
  <!-- 占满整行 + 网格居中：按钮宽度收窄时，左右边缘同时向中间收 -->
  <div class="cw-submit-wrap" :class="{ 'is-block': block }">
    <button
      type="submit"
      class="btn btn-primary cw-submit"
      :class="[`is-${displayStatus}`, { 'btn-block': block && !isMorph, 'is-pressed': pressed, 'is-morph': isMorph }]"
      :disabled="disabled"
      :aria-busy="displayStatus === 'loading' ? 'true' : 'false'"
      :aria-label="ariaLabel"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <span class="cw-submit__label">{{ label }}</span>

      <span v-if="displayStatus === 'loading'" class="cw-submit__glyph" aria-hidden="true">
        <span class="cw-submit__spinner" />
      </span>

      <span v-else-if="displayStatus === 'success'" class="cw-submit__glyph" aria-hidden="true">
        <svg class="cw-submit__check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>

      <span v-else-if="displayStatus === 'error'" class="cw-submit__glyph" aria-hidden="true">
        <svg class="cw-submit__cross" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="3" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>

      <span class="sr-only" role="status" aria-live="polite">{{ srText }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 满行居中容器：唯一职责是把按钮固定在水平中线上 */
.cw-submit-wrap {
  /* 固定 1fr 列宽 = 容器全宽：按钮 width:100% 才有稳定的百分比基准，
     否则列宽会随按钮内容收缩，导致 width 过渡失效（瞬间变圆）。 */
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;
  align-items: center;
  width: 100%;
}
.cw-submit-wrap:not(.is-block) {
  display: inline-grid;
  grid-template-columns: auto;
  width: auto;
}

.cw-submit {
  --submit-circle: 48px;
  --submit-shrink: .85s;
  --submit-ease: cubic-bezier(.45, 0, .25, 1);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 48px;
  padding: 0 24px;
  overflow: hidden;
  border-radius: 12px;
  /* 左、右边缘同时向内：宽度 + 圆角 + 内边距同步过渡 */
  transition:
    width var(--submit-shrink) var(--submit-ease),
    height var(--submit-shrink) var(--submit-ease),
    padding var(--submit-shrink) var(--submit-ease),
    border-radius var(--submit-shrink) var(--submit-ease),
    background-color .3s ease,
    border-color .3s ease,
    box-shadow .3s ease,
    transform .12s ease;
}

/* 圆球：宽度收到固定直径，由外层居中 → 两侧边缘对称内收 */
.cw-submit.is-morph {
  /* 只动画 width；不要在这里改 min/max-width —— 它们会瞬间把宽度夹到 48px，
     导致 width 过渡来不及播放（视觉上像“瞬间跳到圆球”）。 */
  width: var(--submit-circle);
  height: var(--submit-circle);
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
  animation: cw-submit-shake .46s cubic-bezier(.36, .07, .19, .97) 2;
}
.cw-submit:disabled {
  cursor: not-allowed;
}

/* 文案：形变开始即淡出 */
.cw-submit__label {
  transition: opacity .18s ease;
  white-space: nowrap;
}
.cw-submit.is-morph .cw-submit__label {
  opacity: 0;
  pointer-events: none;
}

/* 图标层绝对居中（相对按钮自身），不随宽度变化偏移 */
.cw-submit__glyph {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transform: scale(.55);
  transition: opacity .2s ease, transform .42s cubic-bezier(.3, 1.2, .5, 1);
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
  animation: cw-submit-spin .9s linear infinite;
}

/* 对勾/叉号描边绘制（慢速） */
.cw-submit__check polyline {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: cw-submit-draw .6s .15s ease-out forwards;
}
.cw-submit__cross line {
  stroke-dasharray: 17;
  stroke-dashoffset: 17;
}
.cw-submit__cross line:nth-child(1) {
  animation: cw-submit-draw .32s .1s ease-out forwards;
}
.cw-submit__cross line:nth-child(2) {
  animation: cw-submit-draw .32s .38s ease-out forwards;
}

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
    animation-duration: 1.6s;
  }
  .cw-submit__check polyline,
  .cw-submit__cross line {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>
