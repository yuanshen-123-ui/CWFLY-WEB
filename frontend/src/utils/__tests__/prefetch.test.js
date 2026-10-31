// @vitest-environment jsdom
/**
 * prefetch.js 单元测试
 *
 * 覆盖点：
 * - 入参容错：非字符串、空串、不以 / 开头的路径直接忽略，不触碰 router
 * - 路由解析容错：resolve 抛异常、matched 为空/matched 缺失、components.default 不是函数，全部静默不抛
 * - 懒加载 loader：被调用一次；返回 rejected Promise 时挂 catch，不产生未处理拒绝
 * - 去重：同一路径只预取一次（即使首次 loader 失败也不重复重试）
 * - prefetchRoutesOnIdle：优先 requestIdleCallback({ timeout: 3000 })；无该 API 时 setTimeout 1200ms 兜底；空列表安全
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { routerMock } = vi.hoisted(() => ({ routerMock: { resolve: vi.fn() } }))

vi.mock('@/router', () => ({ default: routerMock }))

const { prefetchRoute, prefetchRoutesOnIdle } = await import('../prefetch.js')

/** 构造 router.resolve 的返回值，让指定 loader 成为默认懒加载组件 */
function mockResolveWith(loader) {
  routerMock.resolve.mockReturnValue({
    matched: [{ path: '/x', components: { default: loader } }],
  })
}

beforeEach(() => {
  routerMock.resolve.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('prefetchRoute 入参容错', () => {
  it('非字符串 / 空串 / 不以 / 开头的路径全部忽略', () => {
    const inputs = [null, undefined, 0, 42, {}, [], '', 'home', ' /home', 'http://example.com', './rel']
    inputs.forEach((input) => prefetchRoute(input))
    expect(routerMock.resolve).not.toHaveBeenCalled()
  })
})

describe('prefetchRoute 正常预取', () => {
  it('解析路由并调用懒加载 loader', () => {
    const loader = vi.fn(() => Promise.resolve({}))
    mockResolveWith(loader)

    prefetchRoute('/p1')
    expect(routerMock.resolve).toHaveBeenCalledTimes(1)
    expect(routerMock.resolve).toHaveBeenCalledWith('/p1')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('同一路径只预取一次（去重）', () => {
    const loader = vi.fn(() => Promise.resolve({}))
    mockResolveWith(loader)

    prefetchRoute('/p2')
    prefetchRoute('/p2')
    prefetchRoute('/p2')
    expect(routerMock.resolve).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('loader 同步抛错时静默吞掉，不影响后续预取', () => {
    const badLoader = vi.fn(() => {
      throw new Error('chunk load failed')
    })
    mockResolveWith(badLoader)
    expect(() => prefetchRoute('/p3')).not.toThrow()
    expect(badLoader).toHaveBeenCalledTimes(1)
  })

  it('loader 返回 rejected Promise 时挂 catch，不产生未处理拒绝', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('network down')))
    mockResolveWith(loader)

    prefetchRoute('/p4')
    // 让 rejected promise 的 catch 有机会执行；若有未处理拒绝，vitest 会让本用例失败
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('首次预取失败后不会重试（已加入已预取集合）', () => {
    const loader = vi.fn(() => Promise.reject(new Error('boom')))
    mockResolveWith(loader)

    prefetchRoute('/p5')
    prefetchRoute('/p5')
    expect(routerMock.resolve).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
  })
})

describe('prefetchRoute 路由解析容错', () => {
  it('router.resolve 抛异常时不向外抛', () => {
    routerMock.resolve.mockImplementation(() => {
      throw new Error('no route')
    })
    expect(() => prefetchRoute('/p6')).not.toThrow()
  })

  it('matched 为空数组时不抛错', () => {
    routerMock.resolve.mockReturnValue({ matched: [] })
    expect(() => prefetchRoute('/p7')).not.toThrow()
  })

  it('resolve 返回对象缺少 matched 时不抛错', () => {
    routerMock.resolve.mockReturnValue({})
    expect(() => prefetchRoute('/p8')).not.toThrow()
  })

  it('components.default 不是函数时不调用', () => {
    routerMock.resolve.mockReturnValue({ matched: [{ components: { default: 'not-a-loader' } }] })
    expect(() => prefetchRoute('/p9')).not.toThrow()
  })

  it('matched 记录没有 components 时不抛错', () => {
    routerMock.resolve.mockReturnValue({ matched: [{ path: '/p10' }] })
    expect(() => prefetchRoute('/p10')).not.toThrow()
  })
})

describe('prefetchRoutesOnIdle', () => {
  it('空列表 / 不传参数时安全返回', () => {
    expect(() => prefetchRoutesOnIdle()).not.toThrow()
    expect(() => prefetchRoutesOnIdle([])).not.toThrow()
  })

  it('优先使用 requestIdleCallback，timeout 为 3000ms，回调时批量预取', () => {
    const loader = vi.fn(() => Promise.resolve({}))
    mockResolveWith(loader)
    const idleCallbacks = []
    const requestIdleCallback = vi.fn((cb, opts) => idleCallbacks.push({ cb, opts }))
    vi.stubGlobal('requestIdleCallback', requestIdleCallback)

    prefetchRoutesOnIdle(['/i1', '/i2'])
    expect(requestIdleCallback).toHaveBeenCalledTimes(1)
    expect(idleCallbacks[0].opts).toEqual({ timeout: 3000 })
    expect(routerMock.resolve).not.toHaveBeenCalled()

    idleCallbacks[0].cb({ didTimeout: false, timeRemaining: () => 10 })
    expect(routerMock.resolve).toHaveBeenCalledTimes(2)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('没有 requestIdleCallback 时回退 setTimeout 1200ms', () => {
    expect('requestIdleCallback' in window).toBe(false)
    vi.useFakeTimers()
    const loader = vi.fn(() => Promise.resolve({}))
    mockResolveWith(loader)

    prefetchRoutesOnIdle(['/i3'])
    vi.advanceTimersByTime(1199)
    expect(routerMock.resolve).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(routerMock.resolve).toHaveBeenCalledTimes(1)
    expect(routerMock.resolve).toHaveBeenCalledWith('/i3')
  })
})
