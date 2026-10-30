/**
 * 主题模式管理（全局单例, 跨组件共享）
 *
 * mode: auto(默认) / light / dark
 *   - light: 恒为浅色
 *   - dark:  恒为深色
 *   - auto:  按北京时间自动 —— 19:00-07:00 深色, 07:00-19:00 浅色
 *            （背景渐变、问候语也按同一北京时间, 配色切换与时段完全一致）
 *
 * 状态写入 localStorage['cw_theme'], 并应用到 document.documentElement[data-theme]
 * （global.css 中 html[data-theme='dark'] 定义深色变量覆盖）
 *
 * 供 AppLayout（顶部按钮 + auto 定时检查）、OnlineMap（高德深浅底图）、
 * Dashboard（问候语）共享。
 */
import { ref } from 'vue'
import { getBeijingHour } from './timeBg'

export const THEME_KEY = 'cw_theme'

export const themeMode = ref(
  typeof localStorage !== 'undefined'
    ? (localStorage.getItem(THEME_KEY) || 'auto')
    : 'auto'
)

/** 当前是否深色（含 auto 按北京时间 19:00-07:00 判断） */
export function isDarkTheme() {
  if (themeMode.value === 'dark') return true
  if (themeMode.value === 'light') return false
  const h = getBeijingHour()
  return h >= 19 || h < 7
}

/** 将当前主题应用到 html[data-theme] */
export function applyTheme() {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', isDarkTheme() ? 'dark' : 'light')
}

let uiApplyTimer = null

/**
 * 延迟应用 UI 主题（默认 2 秒）:
 * 手动切换时先让背景图动画（watch(themeMode) 立即触发）执行,
 * 2 秒后再切换 UI 配色, 形成「先图片后界面」的层次动画。
 */
export function scheduleApplyTheme(delay = 2000) {
  clearTimeout(uiApplyTimer)
  uiApplyTimer = setTimeout(applyTheme, delay)
}

/** 设置主题模式并立即生效, 返回是否为深色 */
export function setThemeMode(mode) {
  themeMode.value = mode
  try { localStorage.setItem(THEME_KEY, mode) } catch (e) { /* 忽略 */ }
  // 注: 不再在此立即调度 UI——UI 切换时机改由 App.vue 的 watch(themeMode)
  // 在「背景图缓存完成、图片渐变真正开始」后才 scheduleApplyTheme()（仍为渐变后 2 秒）
  return isDarkTheme()
}
