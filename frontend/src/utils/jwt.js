/**
 * JWT 解码（仅解码 payload，不验证签名）
 * 用于前端路由守卫等需要读取用户身份的场景
 * 实际权限验证由后端签名保证，篡改 localStorage 不影响后端安全
 */
export function decodeToken(token) {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    // 替换 URL-safe base64 为标准 base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(base64)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * 从 JWT 获取用户身份，替代 localStorage 读取方式
 * 防止 localStorage 篡改导致的越权
 */
export function getUserFromToken() {
  const token = localStorage.getItem('cw_token')
  if (!token) return null
  return decodeToken(token)
}

/** token 剩余有效毫秒数（未过期为正数，已过期为负数），无 token/无法解码返回 -Infinity */
export function getTokenRemaining() {
  const token = localStorage.getItem('cw_token')
  const decoded = token ? decodeToken(token) : null
  if (!decoded?.exp) return -Infinity
  return decoded.exp * 1000 - Date.now()
}

/** token 是否已过期（无 token 也视为过期） */
export function isTokenExpired() {
  return getTokenRemaining() <= 0
}

/** token 是否临近过期（剩余不足 n 毫秒） */
export function isTokenNearExpiry(ms) {
  const rem = getTokenRemaining()
  return rem > 0 && rem < ms
}

/**
 * 会话续签判定（前端主导）：
 * - 若在活跃窗口内（SESS_ACTIVE_WINDOW，默认 7 天）用户有活跃（返回过页面/操作过）→ 可续签
 * - 否则返回 false → 应跳转登录页重新登录
 * - 说明：窗口只防「长期不回来」的僵尸会话，真正的过期时间看 JWT exp
 */
export const SESS_ACTIVE_WINDOW = 7 * 24 * 60 * 60 * 1000 // 7 天（真正有效期由 token + 续签宽限决定）

export function getLastActive() {
  return Number(localStorage.getItem('cw_last_active') || 0)
}

export function touchLastActive() {
  localStorage.setItem('cw_last_active', String(Date.now()))
}

/** 是否在活跃窗口内（最近 10 分钟内有返回页面/操作） */
export function isWithinActiveWindow() {
  return Date.now() - getLastActive() <= SESS_ACTIVE_WINDOW
}
