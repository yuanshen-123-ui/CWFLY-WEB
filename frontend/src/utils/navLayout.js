/**
 * 导航布局偏好（侧边栏 / 顶部栏）
 * - 持久化在 localStorage: cw_nav_layout
 * - 窄屏（< 860px）自动回退为侧边栏抽屉（effectiveNavLayout 强制 sidebar）
 */
import { ref, computed } from 'vue'

const STORAGE_KEY = 'cw_nav_layout'
const NARROW_MAX_WIDTH = 860

function readPreference() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'topbar' ? 'topbar' : 'sidebar'
  } catch {
    return 'sidebar'
  }
}

/** 用户偏好：'sidebar' | 'topbar' */
export const navLayout = ref(readPreference())

/** 当前视口是否为窄屏（< 860px） */
export const narrowScreen = ref(false)

/** 实际生效布局：窄屏时强制侧边栏（抽屉） */
export const effectiveNavLayout = computed(() => (narrowScreen.value ? 'sidebar' : navLayout.value))

export function setNavLayout(mode) {
  const next = mode === 'topbar' ? 'topbar' : 'sidebar'
  navLayout.value = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* 隐私模式忽略 */
  }
}

let mqBound = false
export function initNavLayout() {
  if (mqBound || typeof window === 'undefined' || !window.matchMedia) return
  mqBound = true
  const mq = window.matchMedia(`(max-width: ${NARROW_MAX_WIDTH}px)`)
  const apply = () => { narrowScreen.value = mq.matches }
  apply()
  if (mq.addEventListener) mq.addEventListener('change', apply)
  else if (mq.addListener) mq.addListener(apply)
}

export default { navLayout, narrowScreen, effectiveNavLayout, setNavLayout, initNavLayout }
