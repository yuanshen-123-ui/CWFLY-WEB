import { getClientIp } from './client.js'

/**
 * ============================================================================
 *  turnstile.js —— Cloudflare Turnstile 服务端强校验（fail-closed）
 * ----------------------------------------------------------------------------
 *  修复（H-2）：此前仅生产环境才做 siteverify，且仅校验 token 非空，
 *  非 production 部署下伪造 token 可直接通过 → 人机验证形同虚设。
 *
 *  现在的行为（与环境无关，统一走 siteverify）：
 *    1. token 缺失                    → 400 拒绝
 *    2. 配置了 TURNSTILE_SECRET_KEY   → 用真实 secret 校验（生产/开发一致）
 *    3. 未配置 secret 且非 production → 回退 Cloudflare 官方测试 secret
 *       （1x0000000000000000000000000000000AA，与前端测试 site key 配对，
 *        保证「测试 key + 测试 secret」的开发链路可用，但校验路径与生产一致）
 *    4. 未配置 secret 且 production   → 503 fail-closed
 *
 *  返回：{ ok: true } 或 { ok: false, status, message }
 * ============================================================================
 */

// Cloudflare 官方测试 secret key：与测试 site key 配对时 siteverify 恒通过
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA'

export async function verifyTurnstile(req, token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, status: 400, message: '请完成人机验证' }
  }

  let secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      // 生产环境缺配置：宁可拒绝服务也不放行人机验证
      return { ok: false, status: 503, message: '人机验证服务未配置，请联系管理员' }
    }
    secret = TURNSTILE_TEST_SECRET
  }

  try {
    const tRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: getClientIp(req)
      })
    })
    const tData = await tRes.json()
    if (!tData.success) {
      return { ok: false, status: 403, message: '人机验证失败，请重试' }
    }
    return { ok: true }
  } catch (e) {
    console.error('[turnstile] siteverify 请求失败:', e?.message)
    // 网络异常同样 fail-closed：无法证明「是人」就拒绝
    return { ok: false, status: 502, message: '人机验证服务暂不可用，请稍后重试' }
  }
}
