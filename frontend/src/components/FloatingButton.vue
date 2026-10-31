<template>
  <!-- 回顶悬浮按钮: 页面滚动超过阈值后淡入 + 上浮出现, 点击平滑回到顶部 -->
  <button
    type="button"
    class="cw-float-btn"
    :class="{ 'is-hidden': !visible }"
    :aria-hidden="!visible"
    :tabindex="visible ? 0 : -1"
    :aria-label="label"
    :title="label"
    @click="scrollToTop"
  >
    <svg class="cw-float-btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 19V6M12 6l-6 6M12 6l6 6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>

<script setup>
/**
 * 回顶按钮（全局只由 App.vue 挂载一次）
 *
 * 行为：
 * - 监听 window scroll（passive + requestAnimationFrame 节流），
 *   scrollY > threshold（默认 600px）时显示，否则隐藏
 * - 显示/隐藏的淡入 + translateY 过渡定义在 styles/motion.css（.cw-float-btn）
 * - 点击回到顶部：默认 behavior:'smooth'；
 *   prefers-reduced-motion: reduce 时 behavior:'instant'（尊重动效降级）
 * - 键盘可点：原生 <button>，Enter / Space 触发；
 *   隐藏态 tabindex=-1 + aria-hidden，不进入 Tab 顺序
 */
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  /** 触发显示的滚动距离（px） */
  threshold: { type: Number, default: 600 },
  /** 无障碍名称（同时用作 title 提示） */
  label: { type: String, default: '回到顶部' },
})

const visible = ref(false)

let ticking = false
let rafId = 0

function currentScrollTop() {
  if (typeof window === 'undefined') return 0
  return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
}

/** 是否要求减少动效（与 utils/theme.js 中的判断保持一致） */
function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (e) {
    return false
  }
}

function update() {
  ticking = false
  const y = currentScrollTop()
  // 只在跨越阈值时改状态，避免滚动过程中反复触发响应式更新
  if (y > props.threshold) {
    if (!visible.value) visible.value = true
  } else if (visible.value) {
    visible.value = false
  }
}

function onScroll() {
  if (ticking) return
  ticking = true
  rafId = requestAnimationFrame(update)
}

/** 回到顶部：reduced-motion 用 instant（无滚动动画） */
function scrollToTop() {
  const behavior = prefersReducedMotion() ? 'instant' : 'smooth'
  try {
    window.scrollTo({ top: 0, left: 0, behavior })
  } catch (e) {
    // 极旧浏览器不认识 options / 'instant'：退回无动画的经典调用
    try {
      window.scrollTo(0, 0)
    } catch (e2) {
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }
  }
}

onMounted(() => {
  update() // 刷新后处于页面中部时直接正确显示
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<style scoped>
/* 形状 / 配色 / 定位：动效（transition、显隐位移）统一在 styles/motion.css */
.cw-float-btn {
  position: fixed;
  right: 20px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 850; /* 高于页面内容(1-100)，低于桌宠 900 / 侧边栏 901 / 弹窗 1000+ */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--glass-border-strong, rgba(255, 255, 255, 0.45));
  background: var(--glass-bg-strong, rgba(255, 255, 255, 0.42));
  background-image: var(--glass-sheen, none);
  backdrop-filter: blur(var(--glass-blur, 20px)) saturate(var(--glass-saturate, 180%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 20px)) saturate(var(--glass-saturate, 180%));
  box-shadow: var(--glass-highlight, none), var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.1));
  color: var(--c-text, #1d1d1f);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}

.cw-float-btn:hover {
  background-color: var(--glass-bg, rgba(255, 255, 255, 0.22));
  border-color: rgba(255, 255, 255, 0.6);
  box-shadow: var(--glass-highlight, none), var(--glass-shadow-lg, 0 18px 56px rgba(0, 0, 0, 0.16));
  color: var(--c-primary, #0071e3);
}

.cw-float-btn:focus-visible {
  outline: 2px solid var(--c-primary, #0071e3);
  outline-offset: 2px;
}

html[data-theme='dark'] .cw-float-btn {
  border-color: rgba(255, 255, 255, 0.24);
  color: var(--c-text, #f5f5f7);
}

html[data-theme='dark'] .cw-float-btn:hover {
  background-color: rgba(28, 28, 30, 0.76);
  border-color: rgba(255, 255, 255, 0.36);
  color: #7ac0ff;
}

.cw-float-btn__icon {
  display: block;
  width: 22px;
  height: 22px;
}

/* 桌面端右下角有桌宠（DesktopPet: right/bottom 24px, 形象高约 130~160px），
   按钮上移让位，避免遮挡；桌宠在 ≤768px 隐藏，移动端保持 20px 底边距。 */
@media (min-width: 769px) {
  .cw-float-btn {
    bottom: calc(180px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
