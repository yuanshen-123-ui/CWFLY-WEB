// @vitest-environment jsdom
/**
 * navLayout.js 单元测试
 *
 * 覆盖点：
 * - 持久化：cw_nav_layout（topbar 才落库，切回 sidebar 会删 key）、cw_nav_collapsed（'1' 表示收拢）
 * - 非法存量值（既不是 topbar 也不是 sidebar）回退 sidebar
 * - toggleNavLayout / toggleNavCollapsed 往返
 * - 860px 断点：窄屏强制 sidebar + 顶部栏/收拢态失效；监听器回调实时切换
 * - initNavLayout 幂等（只绑一次 matchMedia）、无 matchMedia 时安全返回、兼容旧 addListener API
 * - localStorage 抛异常（隐私模式/配额）时读回退默认值、写失败不崩溃且本次会话内仍生效
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const LAYOUT_KEY = 'cw_nav_layout'
const COLLAPSE_KEY = 'cw_nav_collapsed'
const NARROW_QUERY = '(max-width: 860px)'

/** 重新加载模块（模块级 ref 的初始值来自 localStorage，必须每个用例重新 import） */
async function loadNavLayout() {
  vi.resetModules()
  return import('../navLayout.js')
}

/** 构造 matchMedia 的假实现 */
function createMediaQuery(matches, api = 'addEventListener') {
  const listeners = []
  const mq = {
    matches,
    media: NARROW_QUERY,
    addEventListener: api === 'addEventListener' ? vi.fn((type, cb) => listeners.push(cb)) : undefined,
    addListener: api === 'addListener' ? vi.fn((cb) => listeners.push(cb)) : undefined,
  }
  const matchMedia = vi.fn(() => mq)
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    mq,
    matchMedia,
    listeners,
    /** 模拟视口变化：改 matches 后触发已注册的监听器 */
    change(nextMatches) {
      mq.matches = nextMatches
      listeners.forEach((cb) => cb())
    },
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('初始值（从 localStorage 读取）', () => {
  it('没有任何存储时默认 sidebar / 未收拢', async () => {
    const m = await loadNavLayout()
    expect(m.navLayout.value).toBe('sidebar')
    expect(m.navCollapsed.value).toBe(false)
    expect(m.narrowScreen.value).toBe(false)
    expect(m.effectiveNavLayout.value).toBe('sidebar')
    expect(m.isTopLayout.value).toBe(false)
    expect(m.isCollapsed.value).toBe(false)
  })

  it('存量 cw_nav_layout=topbar 时初始为顶部栏', async () => {
    localStorage.setItem(LAYOUT_KEY, 'topbar')
    const m = await loadNavLayout()
    expect(m.navLayout.value).toBe('topbar')
    expect(m.isTopLayout.value).toBe(true)
  })

  it('存量 cw_nav_collapsed=1 时初始为收拢', async () => {
    localStorage.setItem(COLLAPSE_KEY, '1')
    const m = await loadNavLayout()
    expect(m.navCollapsed.value).toBe(true)
    expect(m.isCollapsed.value).toBe(true)
  })

  it('非法存量值（"garbage"）回退 sidebar 且不认为收拢', async () => {
    localStorage.setItem(LAYOUT_KEY, 'garbage')
    localStorage.setItem(COLLAPSE_KEY, 'true')
    const m = await loadNavLayout()
    expect(m.navLayout.value).toBe('sidebar')
    expect(m.navCollapsed.value).toBe(false)
  })
})

describe('setNavLayout / toggleNavLayout 持久化', () => {
  it('切到 topbar 会写入 cw_nav_layout=topbar', async () => {
    const m = await loadNavLayout()
    m.setNavLayout('topbar')
    expect(m.navLayout.value).toBe('topbar')
    expect(localStorage.getItem(LAYOUT_KEY)).toBe('topbar')
  })

  it('切回 sidebar 会删除 cw_nav_layout（而不是写 sidebar）', async () => {
    localStorage.setItem(LAYOUT_KEY, 'topbar')
    const m = await loadNavLayout()
    m.setNavLayout('sidebar')
    expect(m.navLayout.value).toBe('sidebar')
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull()
  })

  it('非法参数按 sidebar 处理并清理 key', async () => {
    localStorage.setItem(LAYOUT_KEY, 'topbar')
    const m = await loadNavLayout()
    m.setNavLayout('sideways')
    expect(m.navLayout.value).toBe('sidebar')
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull()
  })

  it('toggleNavLayout 往返切换并同步持久化', async () => {
    const m = await loadNavLayout()
    m.toggleNavLayout()
    expect(m.navLayout.value).toBe('topbar')
    expect(localStorage.getItem(LAYOUT_KEY)).toBe('topbar')
    m.toggleNavLayout()
    expect(m.navLayout.value).toBe('sidebar')
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull()
  })
})

describe('setNavCollapsed / toggleNavCollapsed 持久化', () => {
  it('收拢写 1，展开删 key', async () => {
    const m = await loadNavLayout()
    m.setNavCollapsed(true)
    expect(m.navCollapsed.value).toBe(true)
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe('1')
    m.setNavCollapsed(false)
    expect(m.navCollapsed.value).toBe(false)
    expect(localStorage.getItem(COLLAPSE_KEY)).toBeNull()
  })

  it('真值转成布尔（!!v）后持久化', async () => {
    const m = await loadNavLayout()
    m.setNavCollapsed('yes')
    expect(m.navCollapsed.value).toBe(true)
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe('1')
  })

  it('toggleNavCollapsed 往返切换', async () => {
    const m = await loadNavLayout()
    m.toggleNavCollapsed()
    expect(m.navCollapsed.value).toBe(true)
    m.toggleNavCollapsed()
    expect(m.navCollapsed.value).toBe(false)
    expect(localStorage.getItem(COLLAPSE_KEY)).toBeNull()
  })
})

describe('860px 窄屏断点', () => {
  it('initNavLayout 使用 (max-width: 860px) 查询并在窄屏强制 sidebar', async () => {
    const media = createMediaQuery(true)
    const m = await loadNavLayout()
    localStorage.setItem(LAYOUT_KEY, 'topbar')
    m.setNavLayout('topbar')
    m.setNavCollapsed(true)

    m.initNavLayout()
    expect(media.matchMedia).toHaveBeenCalledTimes(1)
    expect(media.matchMedia).toHaveBeenCalledWith(NARROW_QUERY)
    expect(m.narrowScreen.value).toBe(true)
    // 窄屏下：顶部栏与收拢态都不生效，实际布局固定 sidebar
    expect(m.effectiveNavLayout.value).toBe('sidebar')
    expect(m.isTopLayout.value).toBe(false)
    expect(m.isCollapsed.value).toBe(false)
    // 用户偏好本身不被覆盖
    expect(m.navLayout.value).toBe('topbar')
    expect(m.navCollapsed.value).toBe(true)
  })

  it('视口变化时监听器实时更新 narrowScreen 与生效布局', async () => {
    const media = createMediaQuery(false)
    const m = await loadNavLayout()
    m.setNavLayout('topbar')
    m.initNavLayout()
    expect(m.narrowScreen.value).toBe(false)
    expect(m.isTopLayout.value).toBe(true)

    media.change(true)
    expect(m.narrowScreen.value).toBe(true)
    expect(m.isTopLayout.value).toBe(false)
    expect(m.effectiveNavLayout.value).toBe('sidebar')

    media.change(false)
    expect(m.narrowScreen.value).toBe(false)
    expect(m.isTopLayout.value).toBe(true)
  })

  it('initNavLayout 幂等：重复调用只绑定一次 matchMedia', async () => {
    const media = createMediaQuery(false)
    const m = await loadNavLayout()
    m.initNavLayout()
    m.initNavLayout()
    m.initNavLayout()
    expect(media.matchMedia).toHaveBeenCalledTimes(1)
    expect(media.listeners).toHaveLength(1)
  })

  it('兼容旧的 addListener API（无 addEventListener 时）', async () => {
    const media = createMediaQuery(true, 'addListener')
    const m = await loadNavLayout()
    m.initNavLayout()
    expect(media.mq.addListener).toHaveBeenCalledTimes(1)
    expect(media.listeners).toHaveLength(1)
    expect(m.narrowScreen.value).toBe(true)
    media.change(false)
    expect(m.narrowScreen.value).toBe(false)
  })

  it('环境没有 matchMedia 时 initNavLayout 安全返回', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const m = await loadNavLayout()
    expect(() => m.initNavLayout()).not.toThrow()
    expect(m.narrowScreen.value).toBe(false)
  })
})

describe('localStorage 不可用（隐私模式 / 配额异常）', () => {
  it('读取抛异常时回退默认值，不阻断模块加载', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage is disabled')
    })
    const m = await loadNavLayout()
    expect(m.navLayout.value).toBe('sidebar')
    expect(m.navCollapsed.value).toBe(false)
  })

  it('写入抛异常时本次会话内仍然生效且不抛出', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const m = await loadNavLayout()
    expect(() => m.setNavLayout('topbar')).not.toThrow()
    expect(m.navLayout.value).toBe('topbar')
    expect(() => m.setNavCollapsed(true)).not.toThrow()
    expect(m.navCollapsed.value).toBe(true)
  })
})

describe('默认导出', () => {
  it('包含全部 API', async () => {
    const m = await loadNavLayout()
    const keys = [
      'navLayout',
      'narrowScreen',
      'navCollapsed',
      'effectiveNavLayout',
      'isTopLayout',
      'isCollapsed',
      'setNavLayout',
      'toggleNavLayout',
      'setNavCollapsed',
      'toggleNavCollapsed',
      'initNavLayout',
    ]
    keys.forEach((k) => expect(m.default).toHaveProperty(k))
  })
})
