/**
 * 导航布局偏好（与 CTYFLY-WEB 的 navlayout.js 对齐）
 *
 * - 布局：sidebar（左侧边栏，默认）/ topbar（顶部横排）
 * - 收拢：桌面端侧边栏 240px ⇄ 68px 图标栏
 * - 窄屏（< 860px）自动回退为侧边栏抽屉，顶部栏与收拢态都不生效
 * - 持久化：cw_nav_layout / cw_nav_collapsed
 */
import { ref, computed } from 'vue'

const LAYOUT_KEY = 'cw_nav_layout'
const COLLAPSE_KEY = 'cw_nav_collapsed'
const NARROW_MAX_WIDTH = 860

function readLayout() {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'topbar' ? 'topbar' : 'sidebar'
  } catch {
    return 'sidebar'
  }
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** 用户偏好：'sidebar' | 'topbar' */
export const navLayout = ref(readLayout())

/** 视口是否窄屏（< 860px） */
export const narrowScreen = ref(false)

/** 侧边栏是否收拢成图标栏（用户偏好，窄屏不生效） */
export const navCollapsed = ref(readCollapsed())

export function setNavLayout(mode) {
  const next = mode === 'topbar' ? 'topbar' : 'sidebar'
  navLayout.value = next
  try {
    if (next === 'topbar') localStorage.setItem(LAYOUT_KEY, 'topbar')
    else localStorage.removeItem(LAYOUT_KEY)
  } catch {
    /* 隐私模式：本次会话内生效 */
  }
}

export function toggleNavLayout() {
  setNavLayout(navLayout.value === 'topbar' ? 'sidebar' : 'topbar')
}

export function setNavCollapsed(v) {
  navCollapsed.value = !!v
  try {
    if (navCollapsed.value) localStorage.setItem(COLLAPSE_KEY, '1')
    else localStorage.removeItem(COLLAPSE_KEY)
  } catch {
    /* 忽略 */
  }
}

export function toggleNavCollapsed() {
  setNavCollapsed(!navCollapsed.value)
}

/** 真正生效的布局：窄屏强制侧边栏 */
export const effectiveNavLayout = computed(() => (narrowScreen.value ? 'sidebar' : navLayout.value))

/** 顶部栏是否生效（窄屏回退侧边栏） */
export const isTopLayout = computed(() => navLayout.value === 'topbar' && !narrowScreen.value)

/** 侧边栏收拢是否生效（窄屏是抽屉，不适用） */
export const isCollapsed = computed(() => navCollapsed.value && !narrowScreen.value)

let mqBound = false
export function initNavLayout() {
  if (mqBound || typeof window === 'undefined' || !window.matchMedia) return
  mqBound = true
  const mq = window.matchMedia(`(max-width: ${NARROW_MAX_WIDTH}px)`)
  const apply = () => {
    narrowScreen.value = mq.matches
  }
  apply()
  if (mq.addEventListener) mq.addEventListener('change', apply)
  else if (mq.addListener) mq.addListener(apply)
}

export default {
  navLayout,
  narrowScreen,
  navCollapsed,
  effectiveNavLayout,
  isTopLayout,
  isCollapsed,
  setNavLayout,
  toggleNavLayout,
  setNavCollapsed,
  toggleNavCollapsed,
  initNavLayout,
}
