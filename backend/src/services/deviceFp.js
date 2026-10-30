/**
 * 设备指纹核心（2026-08-06 升级：防伪造）
 *
 * 背景：旧"指纹"是前端 localStorage 里的随机串（fp-<ts>-<rand>），
 * 可任意伪造/清除/复制，限流形同虚设。
 *
 * 本模块实现两层（L1 签名设备 Token + L4 Proof-of-Work）：
 * 1. 服务端签发随机 fp + HMAC 签名（绑定 fp + UA + 签发时间），
 *    客户端提交 fp/sig/issued，服务端验签 → 乱改 fp、复制他人 fp 一律失效；
 *    绑定 UA 而非 IP，保证换网络不掉线（IP 一致性交给风险引擎处理）。
 * 2. PoW（hashcash）：注册前客户端算 SHA-256 前缀哈希，拉高批量脚本成本，
 *    挑战带 HMAC 签名 + 时间戳，无共享状态、多 PM2 实例可各自验证。
 */

import { createHmac, createHash, randomBytes } from 'node:crypto'
import { getDeviceSecret } from '../config/index.js'

/** 指纹签名有效期（默认 7 天，过期前端自动重新初始化） */
export const FP_SIG_TTL_MS = Number(process.env.FP_SIG_TTL_MS || 7 * 24 * 3600) * 1000

/** PoW 难度（前 N bit 为 0；默认 14 ≈ 1.6 万次哈希，真用户 <1s，脚本成本陡增） */
export const POW_DIFFICULTY = Number(process.env.POW_DIFFICULTY || 14)

/** PoW 挑战有效期（默认 5 分钟） */
export const POW_TTL_MS = Number(process.env.POW_TTL_MS || 5 * 60) * 1000

/** 生成服务端指纹（客户端不再自造） */
export function issueFp() {
  return 'fp-' + randomBytes(16).toString('hex')
}

/**
 * 设备指纹签名：HMAC(secret, `fp|ua|issuedAt`)
 * 绑定 UA（复制到别的浏览器失效）+ 签发时间（防重放），不绑定 IP（换网络不掉线）。
 */
export function signFp(fp, ua, issuedAt) {
  return createHmac('sha256', getDeviceSecret())
    .update(`${fp}|${ua}|${issuedAt}`)
    .digest('hex')
}

/** 从请求解析设备凭证（fp / sig / issued），软解析不抛错 */
export function parseDevice(req) {
  const fromHeader = (req.headers['x-device-fp'] || '').trim()
  const fp = fromHeader || (req.query && req.query._fp ? String(req.query._fp).trim() : '')
  const sig = (req.headers['x-device-sig'] || '').trim()
  const issued = Number(req.headers['x-device-issued'] || '0')
  return { fp, sig, issued }
}

/** 常量时间比较，防时序攻击 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * 校验设备签名。
 * @param {{fp:string,sig:string,issued:number}} device
 * @param {string} ua 当前请求 User-Agent
 * @param {number} now 当前时间戳
 * @returns {boolean} 签名是否有效（未篡改且未过期）
 */
export function isDeviceSigValid(device, ua, now = Date.now()) {
  const { fp, sig, issued } = device || {}
  if (!fp || !sig || !issued) return false
  // 过期或未来时间（容忍 5 分钟时钟偏差）
  if (now - issued > FP_SIG_TTL_MS || issued > now + 5 * 60 * 1000) return false
  const expected = signFp(fp, ua, issued)
  return safeEqual(expected, sig)
}

// ──────────────────────────────────────────────
// Proof-of-Work（hashcash，无状态可跨实例验证）
// ──────────────────────────────────────────────

/** 生成 PoW 挑战（challenge + difficulty + 签名 sig） */
export function createPowChallenge() {
  const nonce = randomBytes(16).toString('hex')
  const issued = Date.now()
  const challenge = `${nonce}.${issued}`
  const sig = createHmac('sha256', getDeviceSecret()).update(`pow:${challenge}`).digest('hex')
  return { challenge, difficulty: POW_DIFFICULTY, sig }
}

/** 校验 PoW 解：签名有效 + 未过期 + sha256(challenge|nonce) 前 difficulty bit 为 0 */
export function verifyPow(challenge, nonce, difficulty, sig, now = Date.now()) {
  if (!challenge || !nonce || !sig) return false
  if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 32) return false
  const expected = createHmac('sha256', getDeviceSecret()).update(`pow:${challenge}`).digest('hex')
  if (!safeEqual(expected, sig)) return false
  const issued = Number(String(challenge).split('.').pop() || 0)
  if (!issued || now - issued > POW_TTL_MS || issued > now + 60 * 1000) return false

  const hash = createHash('sha256').update(`${challenge}|${nonce}`).digest('hex')
  const fullChars = Math.floor(difficulty / 4)
  if (!hash.startsWith('0'.repeat(fullChars))) return false
  const remBits = difficulty % 4
  if (remBits > 0) {
    const nibble = parseInt(hash[fullChars], 16)
    if (nibble >> (4 - remBits) !== 0) return false
  }
  return true
}
