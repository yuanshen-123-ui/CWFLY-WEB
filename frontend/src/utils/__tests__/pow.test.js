/**
 * pow.js 单元测试（PoW 令牌内存存取）
 *
 * 覆盖点：
 * - setPowToken / getPowToken / clearPowToken 基础读写；非字符串入参视为清空
 * - applyPowHeader：有令牌时写入 X-PoW-Token 并返回同一 headers 对象；无令牌时原样返回
 * - headers 只读（Object.freeze）时不抛错
 * - waitForPowToken：已有令牌立即 resolve；无令牌则挂起，超时返回空串；
 *   等待期间 setPowToken 立即唤醒所有等待者；超时后到达的令牌不会改变已结束的等待
 * - 默认导出包含全部 API
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import pow, {
  setPowToken,
  getPowToken,
  clearPowToken,
  applyPowHeader,
  waitForPowToken,
} from '../pow.js'

beforeEach(() => {
  clearPowToken()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('令牌基础存取', () => {
  it('初始为空串', () => {
    expect(getPowToken()).toBe('')
  })

  it('setPowToken 写入后可读回', () => {
    setPowToken('tok-abc')
    expect(getPowToken()).toBe('tok-abc')
  })

  it('非字符串入参视为清空令牌', () => {
    setPowToken('tok-abc')
    setPowToken(null)
    expect(getPowToken()).toBe('')
    setPowToken('tok-def')
    setPowToken({ token: 'x' })
    expect(getPowToken()).toBe('')
    setPowToken('tok-ghi')
    setPowToken(123)
    expect(getPowToken()).toBe('')
  })

  it('clearPowToken 清空令牌', () => {
    setPowToken('tok-abc')
    clearPowToken()
    expect(getPowToken()).toBe('')
  })
})

describe('applyPowHeader', () => {
  it('有令牌时写入 X-PoW-Token 并返回同一个对象', () => {
    setPowToken('tok-abc')
    const headers = { Accept: 'application/json' }
    const out = applyPowHeader(headers)
    expect(out).toBe(headers)
    expect(out['X-PoW-Token']).toBe('tok-abc')
    expect(out.Accept).toBe('application/json')
  })

  it('无令牌时不添加请求头', () => {
    const headers = { Accept: 'application/json' }
    expect(applyPowHeader(headers)).toBe(headers)
    expect(headers).not.toHaveProperty('X-PoW-Token')
  })

  it('重复调用会覆盖旧令牌', () => {
    setPowToken('old-token')
    const headers = {}
    applyPowHeader(headers)
    setPowToken('new-token')
    applyPowHeader(headers)
    expect(headers['X-PoW-Token']).toBe('new-token')
  })

  it('headers 只读（Object.freeze）时静默失败，不抛错', () => {
    setPowToken('tok-abc')
    const frozen = Object.freeze({})
    expect(() => applyPowHeader(frozen)).not.toThrow()
    expect(frozen).not.toHaveProperty('X-PoW-Token')
  })
})

describe('waitForPowToken', () => {
  it('已有令牌时立即 resolve', async () => {
    setPowToken('tok-ready')
    await expect(waitForPowToken()).resolves.toBe('tok-ready')
  })

  it('无令牌时挂起，超时返回空串', async () => {
    vi.useFakeTimers()
    const promise = waitForPowToken(2500)
    let settled = false
    promise.then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(2499)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toBe('')
  })

  it('等待期间 setPowToken 会立即唤醒等待者（无需等到超时）', async () => {
    vi.useFakeTimers()
    const promise = waitForPowToken(2500)
    const resolved = vi.fn()
    promise.then(resolved)

    await vi.advanceTimersByTimeAsync(100)
    expect(resolved).not.toHaveBeenCalled()

    setPowToken('tok-late')
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toHaveBeenCalledTimes(1)
    await expect(promise).resolves.toBe('tok-late')
  })

  it('多个等待者会被同一令牌一起唤醒', async () => {
    vi.useFakeTimers()
    const p1 = waitForPowToken(1000)
    const p2 = waitForPowToken(1000)
    setPowToken('tok-shared')
    await expect(p1).resolves.toBe('tok-shared')
    await expect(p2).resolves.toBe('tok-shared')
  })

  it('超时结束后再到达的令牌不会改变已 resolve 的结果', async () => {
    vi.useFakeTimers()
    const promise = waitForPowToken(50)
    await vi.advanceTimersByTimeAsync(50)
    await expect(promise).resolves.toBe('')

    setPowToken('tok-too-late')
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBe('')
  })

  it('自定义超时时长生效', async () => {
    vi.useFakeTimers()
    const promise = waitForPowToken(10)
    await vi.advanceTimersByTimeAsync(10)
    await expect(promise).resolves.toBe('')
  })
})

describe('默认导出', () => {
  it('包含全部 API', () => {
    ;['setPowToken', 'getPowToken', 'clearPowToken', 'applyPowHeader', 'waitForPowToken'].forEach(
      (k) => expect(typeof pow[k]).toBe('function'),
    )
  })
})
