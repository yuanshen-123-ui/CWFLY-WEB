<script>
/**
 * 弹窗 AppModal
 *
 * 可访问性与交互契约（与页面业务解耦，只负责「弹窗外壳」）：
 *  - Teleport 到 body，避免被页面 overflow/transform 裁切
 *  - role="dialog" + aria-modal="true" + aria-labelledby（有标题时）
 *  - Esc 关闭、遮罩点击关闭（均可单独禁用）
 *  - 打开时记录并迁移焦点（优先 [autofocus]，否则聚焦对话框），关闭后还原焦点
 *  - 打开时锁定 body 滚动（多弹窗叠加用计数保护）
 *  - Tab / Shift+Tab 在弹窗内循环，防止焦点逃逸到背后页面
 *  - beforeClose 钩子可拦截关闭（返回 false 或抛错则不关闭），用于「未保存拦截」
 *  - v-model:open 受控用法：<AppModal v-model:open="visible" title="标题" />
 *
 * 模块级状态（不随实例重置）：滚动锁计数 + 标题 id 序号
 */
let modalUid = 0
let scrollLockCount = 0
let bodyOverflowBackup = ''

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    bodyOverflowBackup = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
}

function unlockBodyScroll() {
  if (scrollLockCount === 0) return
  scrollLockCount -= 1
  if (scrollLockCount === 0) document.body.style.overflow = bodyOverflowBackup
}
</script>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  /** 是否打开（配合 v-model:open） */
  open: { type: Boolean, default: false },
  /** 标题文本；也可用 #title 插槽完全自定义 */
  title: { type: String, default: '' },
  /** 无标题时提供给屏幕阅读器的对话框名称 */
  ariaLabel: { type: String, default: '对话框' },
  /** 卡片最大宽度 */
  width: { type: String, default: '540px' },
  /** 点击遮罩关闭 */
  closeOnOverlay: { type: Boolean, default: true },
  /** 按 Esc 关闭 */
  closeOnEsc: { type: Boolean, default: true },
  /** 显示右上角关闭按钮 */
  showClose: { type: Boolean, default: true },
  /** 关闭前拦截：返回 false（或抛错）则取消关闭 */
  beforeClose: { type: Function, default: null },
})

const emit = defineEmits(['update:open', 'close', 'opened', 'closed'])

const dialogRef = ref(null)
const active = ref(false)
const closing = ref(false)
let lastActive = null
let deactivateTimer = null
const titleId = `cw-modal-title-${++modalUid}`

const cardStyle = computed(() => ({ maxWidth: props.width }))

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

function focusableItems() {
  const el = dialogRef.value
  if (!el) return []
  return Array.from(el.querySelectorAll(FOCUSABLE)).filter(
    (node) => !node.hasAttribute('disabled') && node.getClientRects().length > 0,
  )
}

/** 打开：锁定滚动、挂键盘监听、迁移焦点 */
function activate() {
  if (active.value) return
  active.value = true
  lastActive = document.activeElement
  lockBodyScroll()
  document.addEventListener('keydown', onKeydown, true)
  nextTick(() => {
    const el = dialogRef.value
    if (!el) return
    const auto = el.querySelector('[autofocus]')
    if (auto && typeof auto.focus === 'function') auto.focus({ preventScroll: true })
    else el.focus({ preventScroll: true })
    emit('opened')
  })
}

/** 关闭/卸载：解除滚动锁、还原焦点（幂等） */
function deactivate() {
  clearTimeout(deactivateTimer)
  deactivateTimer = null
  if (!active.value) return
  active.value = false
  document.removeEventListener('keydown', onKeydown, true)
  unlockBodyScroll()
  const previous = lastActive
  lastActive = null
  if (previous && previous !== document.body && typeof previous.focus === 'function' && document.contains(previous)) {
    previous.focus({ preventScroll: true })
  }
  emit('closed')
}

function scheduleDeactivate() {
  clearTimeout(deactivateTimer)
  if (!active.value) return
  // 等离场过渡（全局 .3s）结束后再还原焦点，避免焦点落在还在淡出的遮罩上
  deactivateTimer = setTimeout(deactivate, 360)
}

function onKeydown(event) {
  if (!active.value) return
  if (event.key === 'Escape') {
    if (!props.closeOnEsc) return
    // 弹窗内的下拉 / 日期面板（Teleport 到 body）自己会响应 Esc：
    // 让它们先收起，避免一次 Esc 把弹窗一起关掉
    if (document.querySelector('.sm-panel, .dp-panel')) return
    event.preventDefault()
    event.stopPropagation()
    requestClose('esc')
    return
  }
  if (event.key === 'Tab') trapFocus(event)
}

/** 焦点陷阱：Tab 到首/尾时回卷，焦点在外部时拉回弹窗 */
function trapFocus(event) {
  const el = dialogRef.value
  if (!el) return
  const items = focusableItems()
  if (!items.length) {
    event.preventDefault()
    el.focus({ preventScroll: true })
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const current = document.activeElement
  const outside = !el.contains(current)
  if (event.shiftKey) {
    if (outside || current === first) {
      event.preventDefault()
      last.focus({ preventScroll: true })
    }
  } else if (outside || current === last) {
    event.preventDefault()
    first.focus({ preventScroll: true })
  }
}

/**
 * 请求关闭：先过 beforeClose 钩子，通过后由父组件更新 v-model:open
 * @param {'button'|'overlay'|'esc'|'programmatic'} reason 关闭来源
 */
async function requestClose(reason = 'programmatic') {
  if (!props.open || closing.value) return
  if (typeof props.beforeClose === 'function') {
    closing.value = true
    try {
      const result = await props.beforeClose(reason)
      if (result === false) return
    } catch {
      return
    } finally {
      closing.value = false
    }
  }
  if (!props.open) return
  emit('update:open', false)
  emit('close', reason)
}

function onOverlayClick() {
  if (!props.closeOnOverlay) return
  requestClose('overlay')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      clearTimeout(deactivateTimer)
      deactivateTimer = null
      activate()
    } else {
      scheduleDeactivate()
    }
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(deactivate)

defineExpose({ close: requestClose })
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" @after-leave="deactivate">
      <div v-if="open" class="cw-modal-overlay" @click.self="onOverlayClick">
        <div
          ref="dialogRef"
          class="cw-modal-card modal-card"
          :style="cardStyle"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title || $slots.title ? titleId : undefined"
          :aria-label="title || $slots.title ? undefined : ariaLabel"
          tabindex="-1"
        >
          <header v-if="title || $slots.title || showClose" class="cw-modal-head">
            <h3 v-if="title || $slots.title" :id="titleId" class="cw-modal-title">
              <slot name="title">{{ title }}</slot>
            </h3>
            <button
              v-if="showClose"
              type="button"
              class="cw-modal-close"
              aria-label="关闭"
              title="关闭"
              @click="requestClose('button')"
            >
              <Icon name="close" :size="15" />
            </button>
          </header>

          <div class="cw-modal-body" :class="{ 'cw-modal-body--with-foot': $slots.footer }">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="cw-modal-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cw-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.cw-modal-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 88vh;
  overflow: hidden;
  border-radius: 20px;
  background: var(--glass-bg-strong, rgba(255, 255, 255, 0.42));
  border: 1px solid var(--glass-border-strong, rgba(255, 255, 255, 0.45));
  box-shadow: var(--glass-shadow-lg, 0 18px 56px rgba(0, 0, 0, 0.16));
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  color: var(--c-text, #1d1d1f);
  outline: none;
}
.cw-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 26px 12px;
}
.cw-modal-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
}
.cw-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--c-text-secondary, #424245);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}
.cw-modal-close:hover {
  background: rgba(120, 120, 128, 0.16);
  color: var(--c-text, #1d1d1f);
}
.cw-modal-close:focus-visible {
  outline: 2px solid var(--c-primary, #0071e3);
  outline-offset: 2px;
}
.cw-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 4px 26px 26px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.cw-modal-body--with-foot {
  padding-bottom: 8px;
}
.cw-modal-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 26px 24px;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .cw-modal-overlay { padding: 12px; }
  .cw-modal-head { padding: 18px 18px 10px; }
  .cw-modal-body { padding: 2px 18px 20px; }
  .cw-modal-foot { padding: 10px 18px 18px; }
}
/* 减少动态效果：不要下滑动画（全局过渡仍保留淡入淡出） */
@media (prefers-reduced-motion: reduce) {
  .cw-modal-card {
    animation: none !important;
  }
}
</style>
