// @vitest-environment jsdom
/**
 * useOnlineMapData 组合式函数单元测试（地图页机组 / 管制边界数据加载与轮询）
 *
 * 覆盖点：
 * - 首次加载：loading 遮罩先置 true 再复位、pilots/boundaries 赋值、connected 置 true、onUpdate 回调一次
 * - 静默轮询（silent=true）不弹 loading；失败静默、不抛错、不覆盖旧数据、connected 保持原值
 * - boundaries 单独失败时回退空数组、仍视为加载成功（connected=true）
 * - 空响应（data 缺失 / null）回退空数组
 * - startPolling 按 REFRESH_INTERVAL=5s 触发（4999ms 不触发 / 5000ms 触发）、重复 start 只保留一个定时器
 * - stopPolling 清理定时器且幂等；模拟页面 onUnmounted 调用后不再发起请求
 * - 每次成功轮询都会 onUpdate + connected=true
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useOnlineMapData } from '../useOnlineMapData.js'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    fsdOnline: vi.fn(),
    fsdBoundaries: vi.fn(),
  },
}))

vi.mock('@/api', () => ({ flightplanApi: apiMock }))

/** 创建一个可手动 resolve/reject 的 promise（用于观察「请求挂起期间」的状态） */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 构造被测组合式函数及其外部 ref/回调 */
function createContext() {
  const pilots = ref([])
  const boundaries = ref([])
  const loading = ref(false)
  const connected = ref(false)
  const onUpdate = vi.fn()
  const composable = useOnlineMapData({ pilots, boundaries, loading, connected, onUpdate })
  return { pilots, boundaries, loading, connected, onUpdate, ...composable }
}

/** 排空微任务，确保 await 链走完 */
async function flushPromises() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

beforeEach(() => {
  apiMock.fsdOnline.mockReset()
  apiMock.fsdBoundaries.mockReset()
  apiMock.fsdOnline.mockResolvedValue({ data: [] })
  apiMock.fsdBoundaries.mockResolvedValue({ data: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('首次加载', () => {
  it('成功时：loading 先 true 后 false，写入 pilots/boundaries，connected=true，onUpdate 一次', async () => {
    apiMock.fsdOnline.mockResolvedValue({ data: [{ cid: 'CCA123' }] })
    apiMock.fsdBoundaries.mockResolvedValue({ data: [{ name: 'ZSSS' }] })
    const ctx = createContext()

    const pending = ctx.loadPilots()
    expect(ctx.loading.value).toBe(true)
    await pending
    expect(ctx.loading.value).toBe(false)
    expect(ctx.pilots.value).toEqual([{ cid: 'CCA123' }])
    expect(ctx.boundaries.value).toEqual([{ name: 'ZSSS' }])
    expect(ctx.connected.value).toBe(true)
    expect(ctx.onUpdate).toHaveBeenCalledTimes(1)
  })

  it('fsdOnline 失败时静默：不抛错、不覆盖旧数据、connected 不置 true、loading 复位、onUpdate 不调用', async () => {
    apiMock.fsdOnline.mockRejectedValue(new Error('network down'))
    const ctx = createContext()
    ctx.pilots.value = [{ cid: 'KEEP' }]

    const pending = ctx.loadPilots()
    await expect(pending).resolves.toBeUndefined()
    expect(ctx.loading.value).toBe(false)
    expect(ctx.pilots.value).toEqual([{ cid: 'KEEP' }])
    expect(ctx.connected.value).toBe(false)
    expect(ctx.onUpdate).not.toHaveBeenCalled()
  })

  it('boundaries 单独失败时回退空数组，整体仍算成功（connected=true）', async () => {
    apiMock.fsdOnline.mockResolvedValue({ data: [{ cid: 'A1' }] })
    apiMock.fsdBoundaries.mockRejectedValue(new Error('boundaries 502'))
    const ctx = createContext()

    await ctx.loadPilots()
    expect(ctx.boundaries.value).toEqual([])
    expect(ctx.pilots.value).toEqual([{ cid: 'A1' }])
    expect(ctx.connected.value).toBe(true)
    expect(ctx.onUpdate).toHaveBeenCalledTimes(1)
  })

  it('响应缺 data / data 为 null 时回退空数组', async () => {
    apiMock.fsdOnline.mockResolvedValue({})
    apiMock.fsdBoundaries.mockResolvedValue({ data: null })
    const ctx = createContext()

    await ctx.loadPilots()
    expect(ctx.pilots.value).toEqual([])
    expect(ctx.boundaries.value).toEqual([])
  })
})

describe('静默刷新', () => {
  it('silent=true 时请求挂起期间不打开 loading 遮罩', async () => {
    const d = deferred()
    apiMock.fsdOnline.mockReturnValue(d.promise)
    const ctx = createContext()

    const pending = ctx.loadPilots(true)
    expect(ctx.loading.value).toBe(false)
    d.resolve({ data: [{ cid: 'SILENT' }] })
    await pending
    expect(ctx.loading.value).toBe(false)
    expect(ctx.pilots.value).toEqual([{ cid: 'SILENT' }])
    expect(ctx.connected.value).toBe(true)
  })

  it('静默刷新失败同样静默，且 connected 保持上一次成功的值', async () => {
    apiMock.fsdOnline.mockRejectedValue(new Error('timeout'))
    const ctx = createContext()
    ctx.connected.value = true
    ctx.pilots.value = [{ cid: 'LAST' }]

    await expect(ctx.loadPilots(true)).resolves.toBeUndefined()
    expect(ctx.connected.value).toBe(true)
    expect(ctx.pilots.value).toEqual([{ cid: 'LAST' }])
    expect(ctx.loading.value).toBe(false)
  })
})

describe('5s 轮询', () => {
  it('startPolling 后 4999ms 不请求、5000ms 触发一次静默请求', async () => {
    vi.useFakeTimers()
    apiMock.fsdOnline.mockResolvedValue({ data: [{ cid: 'POLL' }] })
    const ctx = createContext()

    ctx.startPolling()
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(4999)
    expect(apiMock.fsdOnline).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(apiMock.fsdOnline).toHaveBeenCalledTimes(1)
    expect(ctx.pilots.value).toEqual([{ cid: 'POLL' }])
    expect(ctx.loading.value).toBe(false)
  })

  it('重复 startPolling 会先清理旧定时器，5s 内只请求一次', async () => {
    vi.useFakeTimers()
    const ctx = createContext()

    ctx.startPolling()
    ctx.startPolling()
    ctx.startPolling()
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(apiMock.fsdOnline).toHaveBeenCalledTimes(1)
  })

  it('每个轮询周期各请求一次，成功后 connected=true 且 onUpdate 累加', async () => {
    vi.useFakeTimers()
    const ctx = createContext()

    ctx.startPolling()
    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(apiMock.fsdOnline).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(apiMock.fsdOnline).toHaveBeenCalledTimes(2)
    expect(ctx.onUpdate).toHaveBeenCalledTimes(2)
    expect(ctx.connected.value).toBe(true)
  })
})

describe('stopPolling 与页面卸载', () => {
  it('stopPolling 立即清理定时器且幂等', async () => {
    vi.useFakeTimers()
    const ctx = createContext()
    ctx.startPolling()
    expect(vi.getTimerCount()).toBe(1)

    ctx.stopPolling()
    expect(vi.getTimerCount()).toBe(0)
    expect(() => ctx.stopPolling()).not.toThrow()

    await vi.advanceTimersByTimeAsync(20000)
    expect(apiMock.fsdOnline).not.toHaveBeenCalled()
  })

  it('页面 onUnmounted 调用 stopPolling 后不再发起请求（含已到期但未执行的周期）', async () => {
    vi.useFakeTimers()
    const ctx = createContext()
    ctx.startPolling()

    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(apiMock.fsdOnline).toHaveBeenCalledTimes(1)

    // 模拟组件卸载
    ctx.stopPolling()
    await vi.advanceTimersByTimeAsync(60000)
    await flushPromises()
    expect(apiMock.fsdOnline).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('未启动轮询时 stopPolling 也安全', () => {
    vi.useFakeTimers()
    const ctx = createContext()
    expect(() => ctx.stopPolling()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('返回值契约', () => {
  it('返回 loadPilots / startPolling / stopPolling 三个函数', () => {
    const ctx = createContext()
    expect(typeof ctx.loadPilots).toBe('function')
    expect(typeof ctx.startPolling).toBe('function')
    expect(typeof ctx.stopPolling).toBe('function')
  })
})
