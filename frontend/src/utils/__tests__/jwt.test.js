// @vitest-environment jsdom
/**
 * jwt.js 单元测试
 *
 * 覆盖点：
 * - decodeToken：空值、段数非法、base64 非法、payload 非 JSON、URL-safe base64（-/_）、正常解码
 * - getUserFromToken：无 token / 有效 token / localStorage 里是垃圾 token
 * - getTokenRemaining：无 token、payload 无 exp、未过期（正数）、已过期（负数）、exp 恰好等于当前时刻
 * - isTokenExpired：无 token 视为过期、已过期、未过期、边界（剩余 0ms）
 * - isTokenNearExpiry：窗口内 / 窗口外 / 恰好等于窗口（严格小于才算临近）/ 无 token
 * - 活跃窗口：getLastActive、touchLastActive、isWithinActiveWindow 的边界（恰好 7 天 / 超出 1ms）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  decodeToken,
  getUserFromToken,
  getTokenRemaining,
  isTokenExpired,
  isTokenNearExpiry,
  getLastActive,
  touchLastActive,
  isWithinActiveWindow,
  SESS_ACTIVE_WINDOW,
} from '../jwt.js'

/** 固定"当前时间"：2026-06-01T04:00:00Z = 北京时间 12:00 */
const NOW = Date.UTC(2026, 5, 1, 4, 0, 0)
const NOW_SEC = NOW / 1000

/** 把字符串编成 base64url（去掉 = 补位，+ -> -, / -> _） */
function b64url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 构造三段式 JWT（签名不参与前端解码，随便填） */
function makeToken(payload) {
  return `eyJhbGciOiJIUzI1NiJ9.${b64url(JSON.stringify(payload))}.c2ln`
}

function setToken(payload) {
  const token = makeToken(payload)
  localStorage.setItem('cw_token', token)
  return token
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('decodeToken', () => {
  it('空值（null / undefined / 空串 / 0）一律返回 null', () => {
    expect(decodeToken(null)).toBeNull()
    expect(decodeToken(undefined)).toBeNull()
    expect(decodeToken('')).toBeNull()
    expect(decodeToken(0)).toBeNull()
  })

  it('不是三段式 JWT 时返回 null', () => {
    expect(decodeToken('onlyonepart')).toBeNull()
    expect(decodeToken('two.parts')).toBeNull()
    expect(decodeToken('a.b.c.d')).toBeNull()
  })

  it('payload 不是合法 base64 时返回 null（不抛异常）', () => {
    expect(decodeToken('h.@@@.s')).toBeNull()
  })

  it('payload 是合法 base64 但不是 JSON 时返回 null', () => {
    expect(decodeToken(`h.${btoa('not-json')}.s`)).toBeNull()
    // 合法 base64 + 合法 JSON 标量同样解不出对象字段，但 JSON.parse 成功
    expect(decodeToken(`h.${btoa('123')}.s`)).toBe(123)
  })

  it('正常解码出 payload 字段', () => {
    const payload = { sub: 'u1', role: 'pilot', name: 'Zhang San', iat: 1700000000 }
    expect(decodeToken(makeToken(payload))).toEqual(payload)
  })

  it('支持 URL-safe base64：- 还原成 +，_ 还原成 /', () => {
    // 这两个 payload 的标准 base64 分别含 + 和 /，用 base64url 编码后可以被正确还原
    const plusPayload = { sub: '~~~', exp: 1893456000 }
    const slashPayload = { sub: '?~?' }
    const plusToken = `h.${b64url(JSON.stringify(plusPayload))}.s`
    const slashToken = `h.${b64url(JSON.stringify(slashPayload))}.s`
    // 确认构造出来的 token 真的含 URL-safe 字符，否则该用例失去意义
    expect(plusToken.split('.')[1]).toContain('-')
    expect(slashToken.split('.')[1]).toContain('_')
    expect(decodeToken(plusToken)).toEqual(plusPayload)
    expect(decodeToken(slashToken)).toEqual(slashPayload)
  })
})

describe('getUserFromToken', () => {
  it('localStorage 无 cw_token 时返回 null', () => {
    expect(getUserFromToken()).toBeNull()
  })

  it('localStorage 有有效 token 时返回身份 payload', () => {
    setToken({ sub: 'uid-42', role: 'controller' })
    expect(getUserFromToken()).toEqual({ sub: 'uid-42', role: 'controller' })
  })

  it('localStorage 里是被篡改的垃圾 token 时返回 null', () => {
    localStorage.setItem('cw_token', 'garbage-token')
    expect(getUserFromToken()).toBeNull()
  })
})

describe('getTokenRemaining', () => {
  it('无 token 时返回 -Infinity', () => {
    expect(getTokenRemaining()).toBe(-Infinity)
  })

  it('payload 没有 exp 时返回 -Infinity', () => {
    setToken({ sub: 'u1' })
    expect(getTokenRemaining()).toBe(-Infinity)
  })

  it('未过期时返回正数剩余毫秒（exp*1000 - now）', () => {
    setToken({ sub: 'u1', exp: NOW_SEC + 600 })
    expect(getTokenRemaining()).toBe(600_000)
  })

  it('已过期时返回负数', () => {
    setToken({ sub: 'u1', exp: NOW_SEC - 120 })
    expect(getTokenRemaining()).toBe(-120_000)
  })

  it('exp 恰好等于当前时刻时剩余为 0', () => {
    setToken({ sub: 'u1', exp: NOW_SEC })
    expect(getTokenRemaining()).toBe(0)
  })
})

describe('isTokenExpired', () => {
  it('无 token 视为已过期', () => {
    expect(isTokenExpired()).toBe(true)
  })

  it('token 已过期返回 true', () => {
    setToken({ sub: 'u1', exp: NOW_SEC - 1 })
    expect(isTokenExpired()).toBe(true)
  })

  it('token 还剩 1ms 时仍未过期', () => {
    setToken({ sub: 'u1', exp: NOW_SEC + 1 })
    // exp 精度到秒，构造 exp = nowSec + 1 表示剩余 1 秒
    expect(isTokenExpired()).toBe(false)
    expect(getTokenRemaining()).toBe(1000)
  })

  it('剩余恰好为 0 时算已过期（边界）', () => {
    setToken({ sub: 'u1', exp: NOW_SEC })
    expect(isTokenExpired()).toBe(true)
  })
})

describe('isTokenNearExpiry', () => {
  it('无 token 时返回 false（-Infinity 不满足 rem > 0）', () => {
    expect(isTokenNearExpiry(60_000)).toBe(false)
  })

  it('剩余时间落在窗口内返回 true', () => {
    setToken({ sub: 'u1', exp: NOW_SEC + 30 })
    expect(isTokenNearExpiry(60_000)).toBe(true)
  })

  it('剩余时间恰好等于窗口时不算临近（严格小于）', () => {
    setToken({ sub: 'u1', exp: NOW_SEC + 1 })
    expect(getTokenRemaining()).toBe(1000)
    expect(isTokenNearExpiry(1000)).toBe(false)
    expect(isTokenNearExpiry(1001)).toBe(true)
  })

  it('已过期时即使窗口很大也返回 false', () => {
    setToken({ sub: 'u1', exp: NOW_SEC - 1 })
    expect(isTokenNearExpiry(Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})

describe('活跃窗口', () => {
  it('SESS_ACTIVE_WINDOW 是 7 天', () => {
    expect(SESS_ACTIVE_WINDOW).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('无记录时 getLastActive 返回 0，isWithinActiveWindow 为 false', () => {
    expect(getLastActive()).toBe(0)
    expect(isWithinActiveWindow()).toBe(false)
  })

  it('touchLastActive 写入当前时间戳字符串', () => {
    touchLastActive()
    expect(localStorage.getItem('cw_last_active')).toBe(String(NOW))
    expect(getLastActive()).toBe(NOW)
    expect(isWithinActiveWindow()).toBe(true)
  })

  it('恰好 7 天前活跃仍在窗口内（<= 边界）', () => {
    localStorage.setItem('cw_last_active', String(NOW - SESS_ACTIVE_WINDOW))
    expect(isWithinActiveWindow()).toBe(true)
  })

  it('超过 7 天 1ms 就出窗口', () => {
    localStorage.setItem('cw_last_active', String(NOW - SESS_ACTIVE_WINDOW - 1))
    expect(isWithinActiveWindow()).toBe(false)
  })

  it('localStorage 里是损坏值（NaN）时不认为在活跃窗口内', () => {
    localStorage.setItem('cw_last_active', 'not-a-number')
    expect(Number.isNaN(getLastActive())).toBe(true)
    expect(isWithinActiveWindow()).toBe(false)
  })
})
