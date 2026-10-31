/**
 * PoW 令牌存取（全隐身旁路）
 *
 * 组件 `PoWCaptcha.vue` 验证成功后调用 `setPowToken(token)`；
 * 请求拦截器自动携带 `X-PoW-Token` 头，后端用 `require_pow_token` 依赖校验。
 * 令牌只放在内存（不写 localStorage），有效期由后端签发（默认 10 分钟）。
 */

let powToken = ''
const pendingWaiters = []

export function setPowToken(token) {
  powToken = typeof token === 'string' ? token : ''
  if (powToken) {
    pendingWaiters.splice(0).forEach((resolve) => resolve(powToken))
  }
}

/** 等待 PoW 令牌就绪（最多 timeoutMs，静默；超时返回空串交由后端判定）。 */
export function waitForPowToken(timeoutMs = 2500) {
  if (powToken) return Promise.resolve(powToken)
  return new Promise((resolve) => {
    let settled = false
    const finish = (t) => {
      if (settled) return
      settled = true
      resolve(t || '')
    }
    pendingWaiters.push(finish)
    setTimeout(() => finish(''), timeoutMs)
  })
}

export function getPowToken() {
  return powToken
}

export function clearPowToken() {
  powToken = ''
}

/** 供 axios 请求拦截器合并自定义头使用 */
export function applyPowHeader(headers) {
  if (!powToken) return headers
  try {
    headers['X-PoW-Token'] = powToken
  } catch {
    /* 忽略只读 headers 场景 */
  }
  return headers
}

export default { setPowToken, getPowToken, clearPowToken, applyPowHeader, waitForPowToken }
