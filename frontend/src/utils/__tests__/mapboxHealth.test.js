// @vitest-environment jsdom
/**
 * mapboxHealth.js 单元测试（Mapbox 3D 可用性判定 / 会话级降级标记 / 令牌类错误识别）
 *
 * 覆盖点：
 * - hasMapboxToken：非字符串/空串/纯空白/占位符（undefined、null、your-token、xxx、placeholder…）
 *   全部判为不可用；真实 token（含前后空白 trim）判为可用；只占位符前缀不误伤 pk. 开头令牌
 * - sessionStorage 失效标记：mark / is / clear 三个函数的读写与幂等，注入式 storage 与默认 sessionStorage 两条路径，
 *   以及 getItem/setItem/removeItem 抛异常（隐私模式）时的安全降级
 * - isMapboxTokenError：401/403 状态码（含 e.error 包装、response.status、字符串状态码）、
 *   invalid access token / unauthorized / forbidden / "style ... 401" 等文案；无关错误不误报
 * - isMapboxDependentLayer / resolveMapboxFallback：依赖图层清单、三种降级原因与文案、判定优先级
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MAPBOX_INVALID_KEY,
  MAPBOX_FALLBACK_LAYER,
  MAPBOX_DEPENDENT_LAYERS,
  MAPBOX_UNAVAILABLE_MESSAGE,
  MAPBOX_INVALID_MESSAGE,
  MAPBOX_LOAD_FAILED_MESSAGE,
  hasMapboxToken,
  isMapboxMarkedInvalid,
  markMapboxInvalid,
  clearMapboxInvalid,
  isMapboxTokenError,
  isMapboxDependentLayer,
  resolveMapboxFallback,
} from '@/utils/mapboxHealth.js'

/** 可注入的假 Storage（可分别模拟三个方法抛异常） */
function makeStorage({ initial = {}, throwOnGet = false, throwOnSet = false, throwOnRemove = false } = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: vi.fn((k) => {
      if (throwOnGet) throw new Error('getItem fail')
      return map.has(k) ? map.get(k) : null
    }),
    setItem: vi.fn((k, v) => {
      if (throwOnSet) throw new Error('setItem fail')
      map.set(k, String(v))
    }),
    removeItem: vi.fn((k) => {
      if (throwOnRemove) throw new Error('removeItem fail')
      map.delete(k)
    }),
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('hasMapboxToken（令牌「看起来可用」判定）', () => {
  it('非字符串 / 空串 / 纯空白一律不可用', () => {
    expect(hasMapboxToken(undefined)).toBe(false)
    expect(hasMapboxToken(null)).toBe(false)
    expect(hasMapboxToken('')).toBe(false)
    expect(hasMapboxToken('   ')).toBe(false)
    expect(hasMapboxToken(123)).toBe(false)
    expect(hasMapboxToken({ token: 'pk.x' })).toBe(false)
    expect(hasMapboxToken([])).toBe(false)
  })

  it('配置残留的占位符判为不可用（大小写不敏感）', () => {
    const placeholders = [
      'undefined',
      'NULL',
      'None',
      'nil',
      'NaN',
      'your-token',
      'your_token',
      'YOUR-TOKEN',
      'xxx',
      'XXXX',
      'placeholder',
      'example',
      'change-me',
      'change_me',
      'todo',
      'TODO: fill me',
    ]
    placeholders.forEach((token) => expect(hasMapboxToken(token)).toBe(false))
  })

  it('真实令牌判为可用，前后空白会先 trim', () => {
    expect(hasMapboxToken('pk.eyJ1IjoiY3dmbHkiLCJhIjoiYWJjMTIzIn0')).toBe(true)
    expect(hasMapboxToken('  pk.abc123  ')).toBe(true)
    // 只按前缀命中占位符才判无效；pk. 开头的真实 token 不受影响
    expect(hasMapboxToken('pk.undefined')).toBe(true)
    expect(hasMapboxToken('sk.placeholder-ish')).toBe(true)
  })
})

describe('sessionStorage 失效标记', () => {
  it('mark → is → clear 全链路（默认 sessionStorage）', () => {
    expect(isMapboxMarkedInvalid()).toBe(false)
    expect(markMapboxInvalid()).toBe(true)
    expect(sessionStorage.getItem(MAPBOX_INVALID_KEY)).toBe('1')
    expect(isMapboxMarkedInvalid()).toBe(true)

    expect(clearMapboxInvalid()).toBe(true)
    expect(sessionStorage.getItem(MAPBOX_INVALID_KEY)).toBeNull()
    expect(isMapboxMarkedInvalid()).toBe(false)
  })

  it("注入 storage 时按注入对象读写，写 '1' / 只认 '1' 为失效", () => {
    const store = makeStorage()
    expect(isMapboxMarkedInvalid(store)).toBe(false)
    expect(markMapboxInvalid(store)).toBe(true)
    expect(store.setItem).toHaveBeenCalledWith(MAPBOX_INVALID_KEY, '1')
    expect(store.map.get(MAPBOX_INVALID_KEY)).toBe('1')
    expect(isMapboxMarkedInvalid(store)).toBe(true)

    const other = makeStorage({ initial: { [MAPBOX_INVALID_KEY]: '0' } })
    expect(isMapboxMarkedInvalid(other)).toBe(false)
  })

  it('标记是幂等的：重复 mark 仍返回 true 且状态不变', () => {
    const store = makeStorage()
    expect(markMapboxInvalid(store)).toBe(true)
    expect(markMapboxInvalid(store)).toBe(true)
    expect(store.setItem).toHaveBeenCalledTimes(2)
    expect(isMapboxMarkedInvalid(store)).toBe(true)
  })

  it('storage 为 null / undefined 兜底：读返回 false、写与清返回 false，不抛错', () => {
    expect(isMapboxMarkedInvalid(null)).toBe(false)
    expect(markMapboxInvalid(null)).toBe(false)
    expect(clearMapboxInvalid(null)).toBe(false)
    // undefined 表示「用默认 storage」，这里显式传 null 才是「没有可用 storage」
    expect(() => markMapboxInvalid(null)).not.toThrow()
  })

  it('storage 抛异常（隐私模式）时安全降级，不向外抛', () => {
    expect(isMapboxMarkedInvalid(makeStorage({ throwOnGet: true }))).toBe(false)
    expect(markMapboxInvalid(makeStorage({ throwOnSet: true }))).toBe(false)
    expect(clearMapboxInvalid(makeStorage({ throwOnRemove: true }))).toBe(false)
  })

  it('clear 幂等：未标记时清除仍返回 true', () => {
    const store = makeStorage()
    expect(clearMapboxInvalid(store)).toBe(true)
    expect(isMapboxMarkedInvalid(store)).toBe(false)
  })
})

describe('isMapboxTokenError（令牌 / 鉴权类错误识别）', () => {
  it('非对象 / 空值不判为令牌错误', () => {
    expect(isMapboxTokenError(null)).toBe(false)
    expect(isMapboxTokenError(undefined)).toBe(false)
    expect(isMapboxTokenError(0)).toBe(false)
    expect(isMapboxTokenError(42)).toBe(false)
    expect(isMapboxTokenError('')).toBe(false)
  })

  it('HTTP 401 / 403（含字符串状态码、response.status、map 事件的 e.error 包装）判为令牌错误', () => {
    expect(isMapboxTokenError({ status: 401 })).toBe(true)
    expect(isMapboxTokenError({ status: 403 })).toBe(true)
    expect(isMapboxTokenError({ statusCode: 401 })).toBe(true)
    expect(isMapboxTokenError({ status: '403' })).toBe(true)
    expect(isMapboxTokenError({ response: { status: 401 } })).toBe(true)
    expect(isMapboxTokenError({ error: { status: 401 } })).toBe(true)
    expect(isMapboxTokenError({ message: 'ok', error: { statusCode: 403 } })).toBe(true)
  })

  it('非 401/403 的状态码不误判（500 / 200）', () => {
    expect(isMapboxTokenError({ status: 500 })).toBe(false)
    expect(isMapboxTokenError({ status: 200, message: 'done' })).toBe(false)
    expect(isMapboxTokenError({ status: 402 })).toBe(false)
  })

  it('令牌 / 鉴权类文案判为令牌错误（大小写不敏感）', () => {
    const messages = [
      'Invalid access token',
      'access token is required',
      'Unauthorized',
      'Not authorized to load style',
      'Forbidden',
      'Failed to load style: 401',
      'Failed to load style: 403',
      'access token expired',
      'Access Token Invalid',
    ]
    messages.forEach((message) => expect(isMapboxTokenError({ message })).toBe(true))
  })

  it('字符串错误按 message 处理', () => {
    expect(isMapboxTokenError('Invalid access token')).toBe(true)
    expect(isMapboxTokenError('network down')).toBe(false)
  })

  it('无关文案 / 只提 access token 但不含 invalid/expired 的不误判', () => {
    expect(isMapboxTokenError({ message: 'network down' })).toBe(false)
    expect(isMapboxTokenError({ message: 'style loaded' })).toBe(false)
    expect(isMapboxTokenError({ message: 'access token loaded' })).toBe(false)
    expect(isMapboxTokenError({ message: '4xx error' })).toBe(false)
  })
})

describe('图层依赖与降级决策', () => {
  it('依赖 Mapbox 令牌的图层清单与 isMapboxDependentLayer 一致', () => {
    expect(MAPBOX_DEPENDENT_LAYERS).toEqual(['mapbox3d', 'mapbox3d_sat', 'mapbox'])
    MAPBOX_DEPENDENT_LAYERS.forEach((id) => expect(isMapboxDependentLayer(id)).toBe(true))
    expect(isMapboxDependentLayer('gaode')).toBe(false)
    expect(isMapboxDependentLayer('gaode_sat')).toBe(false)
    expect(isMapboxDependentLayer('arcgis')).toBe(false)
    expect(isMapboxDependentLayer('')).toBe(false)
    expect(isMapboxDependentLayer(undefined)).toBe(false)
    expect(isMapboxDependentLayer('MAPBOX3D')).toBe(false)
  })

  it('降级目标图层为 gaode（2D 高德，不依赖 Mapbox）', () => {
    expect(MAPBOX_FALLBACK_LAYER).toBe('gaode')
    expect(isMapboxDependentLayer(MAPBOX_FALLBACK_LAYER)).toBe(false)
  })

  it('未配置令牌 → no-token + 未配置文案', () => {
    const result = resolveMapboxFallback({ token: '' })
    expect(result).toEqual({
      available: false,
      reason: 'no-token',
      message: MAPBOX_UNAVAILABLE_MESSAGE,
    })
    expect(resolveMapboxFallback({ token: 'undefined' }).reason).toBe('no-token')
    expect(resolveMapboxFallback().reason).toBe('no-token')
  })

  it('令牌可用但本次会话已标记失效 → invalid-token + 失效文案', () => {
    const result = resolveMapboxFallback({ token: 'pk.real-token', markedInvalid: true })
    expect(result).toEqual({ available: false, reason: 'invalid-token', message: MAPBOX_INVALID_MESSAGE })
  })

  it('令牌可用且未失效 → available:true / reason:null / 空文案', () => {
    expect(resolveMapboxFallback({ token: 'pk.real-token', markedInvalid: false })).toEqual({
      available: true,
      reason: null,
      message: '',
    })
  })

  it('markedInvalid 省略时读取 sessionStorage 标记', () => {
    const token = 'pk.real-token'
    expect(resolveMapboxFallback({ token }).available).toBe(true)

    markMapboxInvalid()
    expect(resolveMapboxFallback({ token })).toEqual({
      available: false,
      reason: 'invalid-token',
      message: MAPBOX_INVALID_MESSAGE,
    })
  })

  it('优先级：无令牌时即使标记了失效也只报 no-token', () => {
    markMapboxInvalid()
    expect(resolveMapboxFallback({ token: '' }).reason).toBe('no-token')
    expect(resolveMapboxFallback({ token: '', markedInvalid: true }).reason).toBe('no-token')
  })

  it('三条提示文案都是非空中文字符串且互不重复', () => {
    const messages = [MAPBOX_UNAVAILABLE_MESSAGE, MAPBOX_INVALID_MESSAGE, MAPBOX_LOAD_FAILED_MESSAGE]
    messages.forEach((m) => {
      expect(typeof m).toBe('string')
      expect(m.length).toBeGreaterThan(0)
    })
    expect(new Set(messages).size).toBe(3)
    expect(MAPBOX_INVALID_KEY).toBe('cw_mapbox_invalid')
  })
})
