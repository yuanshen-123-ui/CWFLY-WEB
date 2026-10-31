/**
 * fieldFeedback.js 单元测试
 *
 * 覆盖点：
 * - errors / shaking 初始状态按字段初始化
 * - fail()：错误文案立即写入；抖动标记先清 false、下一帧（rAF）才置 true，因此重复 fail 能重播动画
 * - input()：该字段有错时收起；无错时是空操作；只影响目标字段
 * - clear() / clearAll()：同时清错误与抖动
 * - hasError() / firstErrorField()：按 fields 声明顺序返回第一个错误字段
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFieldFeedback } from '../fieldFeedback.js'

/** 手动驱动的 requestAnimationFrame 队列 */
let rafQueue = []

function flushRaf() {
  const queue = rafQueue
  rafQueue = []
  queue.forEach((cb) => cb(16))
}

function pendingRafCount() {
  return rafQueue.length
}

beforeEach(() => {
  rafQueue = []
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    rafQueue.push(cb)
    return rafQueue.length
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('初始化', () => {
  it('按传入字段初始化 errors 与 shaking', () => {
    const fb = useFieldFeedback(['account', 'password'])
    expect(fb.errors).toEqual({ account: '', password: '' })
    expect(fb.shaking).toEqual({ account: false, password: false })
    expect(fb.hasError()).toBe(false)
    expect(fb.firstErrorField()).toBe('')
  })

  it('不传字段时是安全的空集合', () => {
    const fb = useFieldFeedback()
    expect(fb.hasError()).toBe(false)
    expect(fb.firstErrorField()).toBe('')
    expect(() => fb.clearAll()).not.toThrow()
  })
})

describe('fail / 抖动动画', () => {
  it('错误文案立即生效，抖动在下一帧才打开', () => {
    const fb = useFieldFeedback(['account'])
    fb.fail('account', '请填写账号')
    expect(fb.errors.account).toBe('请填写账号')
    expect(fb.shaking.account).toBe(false)
    expect(pendingRafCount()).toBe(1)

    flushRaf()
    expect(fb.shaking.account).toBe(true)
  })

  it('重复 fail 同一字段会先清抖动、下一帧再打开（保证动画重播）', () => {
    const fb = useFieldFeedback(['account'])
    fb.fail('account', '第一次错误')
    flushRaf()
    expect(fb.shaking.account).toBe(true)

    fb.fail('account', '第二次错误')
    expect(fb.errors.account).toBe('第二次错误')
    expect(fb.shaking.account).toBe(false)
    flushRaf()
    expect(fb.shaking.account).toBe(true)
  })

  it('一个字段出错不影响其他字段的抖动状态', () => {
    const fb = useFieldFeedback(['account', 'password'])
    fb.fail('password', '密码错误')
    flushRaf()
    expect(fb.shaking.password).toBe(true)
    expect(fb.shaking.account).toBe(false)
  })
})

describe('input / clear / clearAll', () => {
  it('用户修改出错字段时自动收起错误', () => {
    const fb = useFieldFeedback(['account', 'password'])
    fb.fail('account', '请填写账号')
    flushRaf()
    fb.input('account')
    expect(fb.errors.account).toBe('')
    expect(fb.shaking.account).toBe(false)
    expect(fb.hasError()).toBe(false)
  })

  it('字段本来无错时 input 是空操作，不影响其它字段', () => {
    const fb = useFieldFeedback(['account', 'password'])
    fb.fail('password', '密码错误')
    fb.input('account')
    expect(fb.errors.account).toBe('')
    expect(fb.errors.password).toBe('密码错误')
    expect(fb.shaking.password).toBe(false)
  })

  it('clear 只清目标字段，clearAll 清所有字段的文案与抖动', () => {
    const fb = useFieldFeedback(['a', 'b', 'c'])
    fb.fail('a', 'A 错误')
    fb.fail('b', 'B 错误')
    fb.clear('a')
    expect(fb.errors.a).toBe('')
    expect(fb.errors.b).toBe('B 错误')

    flushRaf()
    expect(fb.shaking.b).toBe(true)
    fb.clearAll()
    expect(fb.errors).toEqual({ a: '', b: '', c: '' })
    expect(fb.shaking).toEqual({ a: false, b: false, c: false })
    expect(fb.hasError()).toBe(false)
  })
})

describe('hasError / firstErrorField', () => {
  it('按 fields 声明顺序返回第一个出错字段', () => {
    const fb = useFieldFeedback(['account', 'password', 'captcha'])
    fb.fail('captcha', '验证码错误')
    fb.fail('password', '密码错误')
    expect(fb.hasError()).toBe(true)
    expect(fb.firstErrorField()).toBe('password')
  })

  it('全部收起后 hasError 为 false、firstErrorField 为空串', () => {
    const fb = useFieldFeedback(['account', 'password'])
    fb.fail('account', '请填写账号')
    fb.fail('password', '请填写密码')
    fb.input('account')
    expect(fb.firstErrorField()).toBe('password')
    fb.input('password')
    expect(fb.hasError()).toBe(false)
    expect(fb.firstErrorField()).toBe('')
  })
})
