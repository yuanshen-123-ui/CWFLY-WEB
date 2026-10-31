/**
 * mapboxHealth.js —— Mapbox 3D 可用性判定 + 降级决策（纯函数，可单测）
 *
 * 背景：线上 `VITE_MAPBOX_TOKEN` 可能为空或为无效令牌，Mapbox GL 初始化后会报
 *      `invalid access token` / style 401，导致 3D 引擎白屏。本模块只做纯判断，
 *      不触碰地图实例、不发网络请求、不注册监听，便于单元测试与复用。
 *
 * 职责：
 *  - hasMapboxToken(token)              判断令牌是否「看起来可用」（非空、非占位符）
 *  - isMapboxMarkedInvalid(storage?)    本次会话是否已判定 Mapbox 失效（sessionStorage）
 *  - markMapboxInvalid(storage?)        标记本次会话失效（只回退一次，刷新不再重试 3D）
 *  - clearMapboxInvalid(storage?)       清除失效标记（令牌修复后可在控制台手动恢复）
 *  - isMapboxTokenError(error)          判断 Mapbox 错误是否为令牌/鉴权类（401/403/invalid token）
 *  - isMapboxDependentLayer(id)         判断地图源是否依赖 Mapbox 令牌（3D 两个 + 2D Mapbox 卫星）
 *  - resolveMapboxFallback(input?)      Mapbox 不可用的原因与用户提示文案
 *
 * 入参：token 为字符串；storage 可注入（测试用），默认读 globalThis.sessionStorage。
 * 返回：布尔 / 结构化对象，全部为纯返回值。
 * 副作用：仅 markMapboxInvalid / clearMapboxInvalid 会写 sessionStorage，且全部 try/catch
 *        兜住隐私模式/禁用存储的异常；不注册任何监听，无需清理。
 */

/** sessionStorage 键：本次会话内 Mapbox 已判定不可用 */
export const MAPBOX_INVALID_KEY = 'cw_mapbox_invalid'

/** Mapbox 不可用时的降级目标图层（高德 2D，不依赖 Mapbox 令牌） */
export const MAPBOX_FALLBACK_LAYER = 'gaode'

/** 依赖 Mapbox 令牌的地图源 id（3D 两个 + 2D Mapbox 卫星瓦片） */
export const MAPBOX_DEPENDENT_LAYERS = ['mapbox3d', 'mapbox3d_sat', 'mapbox']

/** 未配置令牌时的提示文案 */
export const MAPBOX_UNAVAILABLE_MESSAGE = '3D 地图服务未配置，已切换为 2D 高德地图'

/** 运行期判定令牌无效/失效时的提示文案 */
export const MAPBOX_INVALID_MESSAGE = '3D 地图服务暂不可用（令牌无效），已自动切换为 2D 高德地图'

/** Mapbox GL 脚本/资源加载失败时的提示文案 */
export const MAPBOX_LOAD_FAILED_MESSAGE = '3D 地图加载失败，已切换为 2D 高德地图'

/**
 * 占位符/明显无效令牌（大小写不敏感）：仅用于避免把 `undefined`、`your-token` 之类
 * 配置残留当成可用令牌，不做真实有效性校验（真实有效性只能由运行期 401 判定）。
 */
const PLACEHOLDER_PATTERN = /^(?:undefined|null|none|nil|nan|your[-_]?|xxx+|placeholder|example|change[-_]?me|todo)/i

/**
 * 取出可用的 sessionStorage：显式注入优先（测试），否则读 globalThis.sessionStorage。
 * @param {Storage|null|undefined} storage
 * @returns {Storage|null}
 */
function resolveStorage(storage) {
  if (storage !== undefined) return storage
  try {
    return globalThis.sessionStorage || null
  } catch {
    // 隐私模式/禁用存储时访问 sessionStorage 会抛异常
    return null
  }
}

/**
 * 判断 Mapbox 令牌是否「已配置且非占位符」。空字符串/undefined/占位符均视为不可用。
 * 注意：返回 true 只代表「有令牌可尝试」，不代表令牌真实有效（有效性由运行期错误兜底）。
 * @param {unknown} token
 * @returns {boolean}
 */
export function hasMapboxToken(token) {
  if (typeof token !== 'string') return false
  const trimmed = token.trim()
  if (!trimmed) return false
  return !PLACEHOLDER_PATTERN.test(trimmed)
}

/**
 * 本次会话是否已把 Mapbox 标记为失效（刷新页面后不再重复尝试 3D）。
 * @param {Storage|null} [storage] 可注入的存储（默认 sessionStorage）
 * @returns {boolean}
 */
export function isMapboxMarkedInvalid(storage) {
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    return store.getItem(MAPBOX_INVALID_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 标记本次会话 Mapbox 失效（幂等；写失败不抛异常，仅返回 false）。
 * @param {Storage|null} [storage]
 * @returns {boolean} 是否写入成功
 */
export function markMapboxInvalid(storage) {
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    store.setItem(MAPBOX_INVALID_KEY, '1')
    return true
  } catch {
    return false
  }
}

/**
 * 清除失效标记（令牌修复后可手动恢复 3D；本函数幂等）。
 * @param {Storage|null} [storage]
 * @returns {boolean} 是否清除成功
 */
export function clearMapboxInvalid(storage) {
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    store.removeItem(MAPBOX_INVALID_KEY)
    return true
  } catch {
    return false
  }
}

/**
 * 判断 Mapbox 抛出的事件/错误是否属于「令牌/鉴权」类（应触发 2D 回退），
 * 兼容 `map.on('error', e => e.error)` 的包装与直接错误对象。
 * 覆盖：HTTP 401/403、invalid access token、style 401、not authorized/forbidden 等。
 * @param {unknown} error
 * @returns {boolean}
 */
export function isMapboxTokenError(error) {
  if (!error || (typeof error !== 'object' && typeof error !== 'string')) return false

  const err = typeof error === 'string' ? { message: error } : error
  // Mapbox 事件常把真实错误放在 e.error 里
  const inner = err.error && typeof err.error === 'object' ? err.error : err

  const statusCandidates = [inner.status, inner.statusCode, err.status, err.statusCode, err.response?.status]
  for (const raw of statusCandidates) {
    const status = Number(raw)
    if (status === 401 || status === 403) return true
  }

  const message = String(inner.message ?? err.message ?? '').toLowerCase()
  if (!message) return false

  if (message.includes('invalid access token')) return true
  if (message.includes('access token is required')) return true
  if (message.includes('unauthorized') || message.includes('not authorized')) return true
  if (message.includes('forbidden')) return true
  // style 资源 401/403 常以状态码出现在消息里（如 "Failed to load style ... 401"）
  if (/\b(401|403)\b/.test(message)) return true
  // "access token ... invalid/expired" 的其它措辞
  return message.includes('access token') && (message.includes('invalid') || message.includes('expired'))
}

/**
 * 地图源是否依赖 Mapbox 令牌（3D globe 两个 + 2D Mapbox 卫星）。
 * @param {string} id
 * @returns {boolean}
 */
export function isMapboxDependentLayer(id) {
  return MAPBOX_DEPENDENT_LAYERS.includes(id)
}

/**
 * 解析 Mapbox 3D 当前是否可用（纯决策函数，供初始化前检查/单测）：
 *  - 未配置令牌（空/占位符）→ available:false, reason:'no-token'
 *  - 本次会话已判定失效     → available:false, reason:'invalid-token'
 *  - 其余                   → available:true
 *
 * @param {{ token?: unknown, markedInvalid?: boolean }} [input]
 *   token 可显式传入（默认由调用方传 MAPBOX_TOKEN）；markedInvalid 可覆盖 sessionStorage 读取（测试用）。
 * @returns {{ available: boolean, reason: 'no-token'|'invalid-token'|null, message: string }}
 */
export function resolveMapboxFallback(input = {}) {
  const { token, markedInvalid } = input
  if (!hasMapboxToken(token)) {
    return { available: false, reason: 'no-token', message: MAPBOX_UNAVAILABLE_MESSAGE }
  }
  const invalid = markedInvalid === undefined ? isMapboxMarkedInvalid() : !!markedInvalid
  if (invalid) {
    return { available: false, reason: 'invalid-token', message: MAPBOX_INVALID_MESSAGE }
  }
  return { available: true, reason: null, message: '' }
}
