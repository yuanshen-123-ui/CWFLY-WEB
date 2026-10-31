// @vitest-environment jsdom
/**
 * theme.js 单元测试（主题模式 + 主题切换扩散动效）
 *
 * 覆盖点：
 * - 初始模式从 localStorage['cw_theme'] 读取，缺失时回退 auto
 * - dark / light 固定模式不受时间影响
 * - auto 模式按北京时间 19:00-07:00 判深色，重点验证 18:59 / 19:00 / 06:59 / 07:00 边界
 * - setThemeMode 返回是否深色并写回 localStorage
 * - applyTheme 落到 html[data-theme]
 * - scheduleApplyTheme 延迟应用且只保留最后一次调度
 * - 扩散动效（motion-agent 新增 API）：
 *   supportsThemeTransition / prefersReducedMotion / isThemeTransitioning 的环境探测；
 *   不支持 View Transitions 或 prefers-reduced-motion: reduce 时**回退直接应用主题**（返回 false，主题不丢）；
 *   支持时播放动画并写入 --theme-x/y/r/dur、临时挂 .theme-transitioning 后清理；
 *   非法坐标回退右上角、并夹在视口内；
 *   动画进行中再次点击被合并（返回 false），结束后补播最后一次；
 *   startViewTransition 抛异常 / finished reject 时才回退且主题仍然生效。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const THEME_KEY = 'cw_theme'
const TRANSITION_CLASS = 'theme-transitioning'

/** 重新加载模块（themeMode / 动画状态都是模块级状态，必须每个用例重新 import） */
async function loadTheme() {
  vi.resetModules()
  return import('../theme.js')
}

/** 设置"当前时间"为北京时间 h:m */
function setBeijing(h, m = 0) {
  const utcHour = ((h - 8) % 24 + 24) % 24
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 1, utcHour, m, 0)))
}

/** 安装可控的 document.startViewTransition 桩，返回每次过渡的 finished 触发器 */
function stubViewTransition() {
  const pending = []
  let calls = 0
  const fn = vi.fn((cb) => {
    calls += 1
    cb()
    return {
      finished: new Promise((resolve, reject) => pending.push({ resolve, reject })),
      ready: Promise.resolve(),
    }
  })
  Object.defineProperty(document, 'startViewTransition', {
    value: fn,
    configurable: true,
    writable: true,
  })
  return {
    fn,
    get calls() {
      return calls
    },
    resolveLast() {
      pending[pending.length - 1].resolve()
    },
    rejectLast() {
      pending[pending.length - 1].reject(new Error('skip'))
    },
  }
}

/** 等待微任务队列排空（动画收尾 / 排队补播都是 Promise 链） */
async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete document.startViewTransition
})

describe('初始模式', () => {
  it('无存量时默认 auto', async () => {
    const m = await loadTheme()
    expect(m.themeMode.value).toBe('auto')
  })

  it('存量 dark / light 会被读取', async () => {
    localStorage.setItem(THEME_KEY, 'dark')
    let m = await loadTheme()
    expect(m.themeMode.value).toBe('dark')

    localStorage.setItem(THEME_KEY, 'light')
    m = await loadTheme()
    expect(m.themeMode.value).toBe('light')
  })
})

describe('isDarkTheme', () => {
  it('dark 模式恒为深色，light 模式恒为浅色（与时间无关）', async () => {
    vi.useFakeTimers()
    const m = await loadTheme()
    setBeijing(12, 0)
    m.setThemeMode('dark')
    expect(m.isDarkTheme()).toBe(true)
    setBeijing(23, 0)
    expect(m.isDarkTheme()).toBe(true)

    m.setThemeMode('light')
    setBeijing(23, 0)
    expect(m.isDarkTheme()).toBe(false)
    setBeijing(12, 0)
    expect(m.isDarkTheme()).toBe(false)
  })

  it('auto 模式按北京时间 19:00-07:00 判深色（含边界）', async () => {
    vi.useFakeTimers()
    const m = await loadTheme()
    m.setThemeMode('auto')

    setBeijing(18, 59)
    expect(m.isDarkTheme()).toBe(false)
    setBeijing(19, 0)
    expect(m.isDarkTheme()).toBe(true)
    setBeijing(23, 59)
    expect(m.isDarkTheme()).toBe(true)
    setBeijing(0, 0)
    expect(m.isDarkTheme()).toBe(true)
    setBeijing(6, 59)
    expect(m.isDarkTheme()).toBe(true)
    setBeijing(7, 0)
    expect(m.isDarkTheme()).toBe(false)
    setBeijing(12, 0)
    expect(m.isDarkTheme()).toBe(false)
  })
})

describe('setThemeMode / applyTheme', () => {
  it('setThemeMode 持久化并返回是否深色', async () => {
    const m = await loadTheme()
    expect(m.setThemeMode('dark')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(m.themeMode.value).toBe('dark')

    expect(m.setThemeMode('light')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })

  it('applyTheme 写入 html[data-theme]', async () => {
    const m = await loadTheme()
    m.setThemeMode('dark')
    m.applyTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    m.setThemeMode('light')
    m.applyTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('scheduleApplyTheme 延迟到指定时间后才应用，且新调度会取消旧调度', async () => {
    vi.useFakeTimers()
    const m = await loadTheme()
    m.setThemeMode('dark')

    m.scheduleApplyTheme(2000)
    vi.advanceTimersByTime(1999)
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()

    // 重新调度 100ms 后应用（旧定时器已被 clearTimeout）
    m.scheduleApplyTheme(100)
    vi.advanceTimersByTime(100)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    vi.advanceTimersByTime(2000)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

describe('主题扩散动效：环境探测', () => {
  it('常量与类名符合 motion.css 约定', async () => {
    const m = await loadTheme()
    expect(m.THEME_TRANSITION_MS).toBe(640)
    expect(m.THEME_TRANSITION_CLASS).toBe(TRANSITION_CLASS)
  })

  it('jsdom 默认没有 startViewTransition → supportsThemeTransition 为 false', async () => {
    const m = await loadTheme()
    expect(m.supportsThemeTransition()).toBe(false)
  })

  it('注入 startViewTransition 后 supportsThemeTransition 为 true', async () => {
    stubViewTransition()
    const m = await loadTheme()
    expect(m.supportsThemeTransition()).toBe(true)
  })

  it('prefersReducedMotion：无 matchMedia 时 false，按查询结果返回，查询抛错也兜底 false', async () => {
    let m = await loadTheme()
    expect(m.prefersReducedMotion()).toBe(false)

    const matchMedia = vi.fn(() => ({ matches: true }))
    vi.stubGlobal('matchMedia', matchMedia)
    m = await loadTheme()
    expect(m.prefersReducedMotion()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')

    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    m = await loadTheme()
    expect(m.prefersReducedMotion()).toBe(false)

    vi.stubGlobal('matchMedia', () => {
      throw new Error('boom')
    })
    m = await loadTheme()
    expect(m.prefersReducedMotion()).toBe(false)
  })

  it('初始 isThemeTransitioning 为 false', async () => {
    const m = await loadTheme()
    expect(m.isThemeTransitioning()).toBe(false)
  })
})

describe('主题扩散动效：降级回退（核心场景）', () => {
  it('不存在 startViewTransition 时回退为直接应用主题，返回 false', async () => {
    const m = await loadTheme()
    m.setThemeMode('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()

    const animated = await m.applyThemeWithTransition(120, 80)
    expect(animated).toBe(false)
    // 主题必须已经生效（降级不能丢主题）
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains(TRANSITION_CLASS)).toBe(false)
    expect(m.isThemeTransitioning()).toBe(false)
  })

  it('支持 API 但用户 prefers-reduced-motion: reduce 时也回退直接应用，不触发动画', async () => {
    stubViewTransition()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const m = await loadTheme()
    m.setThemeMode('light')
    document.documentElement.setAttribute('data-theme', 'dark')

    const animated = await m.applyThemeWithTransition(0, 0)
    expect(animated).toBe(false)
    expect(document.startViewTransition).not.toHaveBeenCalled()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('startViewTransition 抛异常时回退直接应用主题，返回 false 且清理过渡类', async () => {
    Object.defineProperty(document, 'startViewTransition', {
      value: () => {
        throw new Error('page hidden')
      },
      configurable: true,
      writable: true,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = await loadTheme()
    m.setThemeMode('dark')

    const animated = await m.applyThemeWithTransition(10, 10)
    expect(animated).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains(TRANSITION_CLASS)).toBe(false)
    expect(m.isThemeTransitioning()).toBe(false)
    warn.mockRestore()
  })

  it('finished reject（浏览器跳过过渡）时返回 false，但主题由兜底逻辑保证生效', async () => {
    const vt = stubViewTransition()
    const m = await loadTheme()
    m.setThemeMode('dark')

    const promise = m.applyThemeWithTransition(10, 10)
    expect(m.isThemeTransitioning()).toBe(true)
    vt.rejectLast()
    await expect(promise).resolves.toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(m.isThemeTransitioning()).toBe(false)
  })
})

describe('主题扩散动效：正常播放', () => {
  it('播放动画时写入扩散 CSS 变量、挂过渡类，结束后清理并返回 true', async () => {
    const vt = stubViewTransition()
    const m = await loadTheme()
    m.setThemeMode('dark')

    const promise = m.applyThemeWithTransition(200, 150)
    // 动画进行中：状态置位 + 过渡类 + CSS 变量
    expect(m.isThemeTransitioning()).toBe(true)
    expect(document.documentElement.classList.contains(TRANSITION_CLASS)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--theme-x')).toBe('200px')
    expect(document.documentElement.style.getPropertyValue('--theme-y')).toBe('150px')
    expect(document.documentElement.style.getPropertyValue('--theme-dur')).toBe('640ms')
    // 半径 = 圆心到四角最远距离 + 2px
    const expectedRadius =
      Math.ceil(
        Math.hypot(
          Math.max(200, window.innerWidth - 200),
          Math.max(150, window.innerHeight - 150),
        ),
      ) + 2
    expect(document.documentElement.style.getPropertyValue('--theme-r')).toBe(`${expectedRadius}px`)
    // 快照回调内已同步切换 data-theme
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    vt.resolveLast()
    await expect(promise).resolves.toBe(true)
    expect(m.isThemeTransitioning()).toBe(false)
    expect(document.documentElement.classList.contains(TRANSITION_CLASS)).toBe(false)
  })

  it('非法坐标回退到右上角（视口宽-32, 32）', async () => {
    const vt = stubViewTransition()
    const m = await loadTheme()
    m.setThemeMode('dark')

    const promise = m.applyThemeWithTransition(undefined, Number.NaN)
    expect(document.documentElement.style.getPropertyValue('--theme-x')).toBe(
      `${window.innerWidth - 32}px`,
    )
    expect(document.documentElement.style.getPropertyValue('--theme-y')).toBe('32px')
    vt.resolveLast()
    await promise
  })

  it('越界坐标会被夹在视口内', async () => {
    const vt = stubViewTransition()
    const m = await loadTheme()
    m.setThemeMode('dark')

    const promise = m.applyThemeWithTransition(-500, 99999)
    expect(document.documentElement.style.getPropertyValue('--theme-x')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--theme-y')).toBe(
      `${window.innerHeight}px`,
    )
    vt.resolveLast()
    await promise
  })

  it('动画进行中再次点击被合并：立即返回 false，结束后补播最后一次', async () => {
    const vt = stubViewTransition()
    const m = await loadTheme()
    m.setThemeMode('dark')

    const first = m.applyThemeWithTransition(10, 10)
    expect(m.isThemeTransitioning()).toBe(true)

    const second = await m.applyThemeWithTransition(20, 20)
    expect(second).toBe(false)
    expect(vt.calls).toBe(1)

    // 结束第一段动画 → 微任务里消费排队点击、补播第二次扩散
    vt.resolveLast()
    await flushMicrotasks()
    expect(vt.calls).toBe(2)

    // 补播的扩散结束后，最外层 Promise 才 resolve
    vt.resolveLast()
    await expect(first).resolves.toBe(true)
    await flushMicrotasks()
    expect(m.isThemeTransitioning()).toBe(false)
    expect(document.documentElement.classList.contains(TRANSITION_CLASS)).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
