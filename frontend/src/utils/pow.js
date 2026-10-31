/**
 * PoW 令牌存取（全隐身旁路）
 *
 * 组件 `PoWCaptcha.vue` 验证成功后调用 `setPowToken(token)`；
 * 请求拦截器自动携带 `X-PoW-Token` 头，后端用 `require_pow_token` 依赖校验。
 * 令牌只放在内存（不写 localStorage），有效期由后端签发（默认 10 分钟）。
 */

let powToken = ''

export function setPowToken(token) {
  powToken = typeof token === 'string' ? token : ''
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

export default { setPowToken, getPowToken, clearPowToken, applyPowHeader }
