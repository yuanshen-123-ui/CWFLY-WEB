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
 *
 * 动效（新增）：applyThemeWithTransition(x, y) —— 基于 View Transitions API
 * 的「圆形扩散」主题切换，样式见 src/styles/motion.css。不支持或
 * prefers-reduced-motion: reduce 时自动降级为直接切换（返回 false）。
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

/* ============================================================
   主题切换圆形扩散（View Transitions API）
   ------------------------------------------------------------
   样式见 src/styles/motion.css「1) 主题切换圆形扩散」：
   - ::view-transition-old(root) 关闭默认交叉淡入（保持静止垫底）
   - ::view-transition-new(root) 用 clip-path: circle() 从点击点扩散
   - 动画期间 html 带 .theme-transitioning（结束 / 异常必摘除）

   接入示例（Lead 在主题按钮上调用）：
     function setTheme(mode, ev) {
       setThemeMode(mode)                                   // 先改 mode（背景图 watch 会接管）
       applyThemeWithTransition(ev?.clientX, ev?.clientY)   // 再从点击点扩散 UI 配色
     }
   ============================================================ */

/** 扩散动画时长（ms）。与 motion.css 中 --theme-dur 的兜底值保持一致 */
export const THEME_TRANSITION_MS = 640

/** 动画期间挂在 <html> 上的类名（motion.css 用它限定 ::view-transition 伪元素样式） */
export const THEME_TRANSITION_CLASS = 'theme-transitioning'

let themeTransitioning = false // 是否有扩散动画进行中（并发点击防抖）
let queuedTransition = null    // 动画期间再点击：只记最后一次，结束后补一次（不堆积）

/** 当前环境是否支持 View Transitions API */
export function supportsThemeTransition() {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
}

/** 用户是否要求减少动效（prefers-reduced-motion: reduce） */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (e) {
    return false
  }
}

/** 是否正在播放主题扩散动画 */
export function isThemeTransitioning() {
  return themeTransitioning
}

/** 规范化扩散圆心：非法坐标回退到「右上角」（主题按钮常见位置），并夹在视口内 */
function resolveThemeSpot(x, y) {
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 0
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 0
  let px = Number(x)
  let py = Number(y)
  if (!Number.isFinite(px)) px = vw - 32
  if (!Number.isFinite(py)) py = 32
  return {
    x: Math.min(Math.max(px, 0), vw || px),
    y: Math.min(Math.max(py, 0), vh || py),
  }
}

/** 把圆心 / 半径 / 时长写进 html 的 CSS 变量，供 motion.css 的扩散关键帧使用 */
function setThemeSpot(x, y) {
  const root = document.documentElement
  const vw = window.innerWidth || 1
  const vh = window.innerHeight || 1
  // 半径 = 圆心到视口四个角的最远距离（+2px 余量），保证圆一定铺满全屏
  const radius = Math.ceil(Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y))) + 2
  root.style.setProperty('--theme-x', `${x}px`)
  root.style.setProperty('--theme-y', `${y}px`)
  root.style.setProperty('--theme-r', `${radius}px`)
  root.style.setProperty('--theme-dur', `${THEME_TRANSITION_MS}ms`)
}

/**
 * 在 View Transition 快照回调里切换 data-theme。
 * 任何异常都回退到「直接切换」——主题状态绝不能丢。
 */
function runThemeViewTransition(x, y) {
  return new Promise((resolve) => {
    const root = document.documentElement
    let settled = false
    let vt = null
    let safetyTimer = null
    // 进入即置忙：补播（drainQueuedTransition）也必须标记「动画中」，
    // 否则补播期间再点击会并发启动第三个 View Transition。
    themeTransitioning = true

    const finalize = (animated) => {
      if (settled) return
      settled = true
      if (safetyTimer) clearTimeout(safetyTimer)
      root.classList.remove(THEME_TRANSITION_CLASS)
      themeTransitioning = false
      // 兜底：如果因为浏览器跳过/异常导致 data-theme 没变或没变全，这里补一次
      try {
        const expected = isDarkTheme() ? 'dark' : 'light'
        if (root.getAttribute('data-theme') !== expected) applyTheme()
      } catch (e) { /* 忽略：不能因兜底失败而抛错 */ }
      resolve(animated)
    }

    try {
      setThemeSpot(x, y)
      root.classList.add(THEME_TRANSITION_CLASS)
      vt = document.startViewTransition(() => {
        // 快照回调内同步切换 data-theme（motion.css 在此期间关闭 CSS 过渡，
        // 保证「新快照」拍到的是最终配色，而不是 1s 补间的起点）
        applyTheme()
      })
    } catch (err) {
      // 浏览器拒绝（如页面隐藏 / API 异常）→ 回退直接切换
      console.warn('[theme] View Transition 不可用，已回退为直接切换:', err)
      try { applyTheme() } catch (e) { /* 忽略 */ }
      finalize(false)
      return
    }

    // 正常结束 → true；被浏览器跳过/异常 → false（此时已由 finalize 兜底切换主题）
    if (vt && vt.finished && typeof vt.finished.then === 'function') {
      vt.finished.then(() => finalize(true), () => finalize(false))
    } else {
      finalize(true)
    }
    // ready 拒绝不影响收尾（finished 会统一处理），这里只吞掉未处理的 rejection
    if (vt && vt.ready && typeof vt.ready.catch === 'function') {
      vt.ready.catch(() => { /* 由 finished / safetyTimer 收尾 */ })
    }
    // 极端情况下 finished 不触发（浏览器实现差异/后台节流）→ 强制清理，
    // 避免 .theme-transitioning 残留导致全站过渡被长时间禁用。
    // 时长必须明显大于动画本身（THEME_TRANSITION_MS），否则会在动画未播完时提前摘类。
    safetyTimer = setTimeout(() => finalize(true), THEME_TRANSITION_MS + 1200)
  })
}

/** 依次消费排队中的点击（动画期间最多积压一次） */
function drainQueuedTransition() {
  if (!queuedTransition) return Promise.resolve(false)
  const spot = queuedTransition
  queuedTransition = null
  return runThemeViewTransition(spot.x, spot.y)
    .then((animated) => drainQueuedTransition().then((rest) => animated || rest))
}

/**
 * 带「圆形扩散」动效地应用当前主题（从点击点向外铺开）。
 *
 * 降级与并发策略：
 * - 不支持 View Transitions 或 prefers-reduced-motion: reduce → 直接 applyTheme()，返回 false
 * - 动画进行中再次点击 → 本次不播动画（返回 false），只记录最后一次点击，
 *   当前动画结束后自动补一次扩散，保证「最后一次主题状态」一定被应用
 * - 任何运行时异常 → 回退直接切换，绝不丢主题切换
 *
 * @param {number} [x] 扩散圆心 X（一般传点击事件 e.clientX）
 * @param {number} [y] 扩散圆心 Y（一般传点击事件 e.clientY）
 * @returns {Promise<boolean>} true=播放了扩散动画；false=降级为直接切换 / 本次被并发合并
 */
export function applyThemeWithTransition(x, y) {
  if (typeof document === 'undefined') return Promise.resolve(false)

  // 降级：不支持动画能力 或 用户要求减少动效 → 直接切换
  if (!supportsThemeTransition() || prefersReducedMotion()) {
    try { applyTheme() } catch (e) { /* 忽略 */ }
    return Promise.resolve(false)
  }

  // 并发点击：只保留最后一次，动画结束后补播
  if (themeTransitioning) {
    queuedTransition = resolveThemeSpot(x, y)
    return Promise.resolve(false)
  }

  const spot = resolveThemeSpot(x, y)
  themeTransitioning = true
  return runThemeViewTransition(spot.x, spot.y)
    .then((animated) => drainQueuedTransition().then((rest) => animated || rest))
    .catch((err) => {
      // runThemeViewTransition 内部已 try/catch，这里只是最后一道保险
      console.warn('[theme] 主题扩散动画异常，回退直接切换:', err)
      try { applyTheme() } catch (e) { /* 忽略 */ }
      themeTransitioning = false
      try { document.documentElement.classList.remove(THEME_TRANSITION_CLASS) } catch (e) { /* 忽略 */ }
      return false
    })
}
