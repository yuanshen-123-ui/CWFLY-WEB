/**
 * JWT 签发 / 验证 / 续签（会话策略：10min + 前端判定续签）
 *
 * 会话设计（2026-08-09 调整）：
 * - token 有效期 10 分钟（JWT_EXPIRES），过期即无效（服务器端不承认）
 * - 续签判定完全由前端负责：
 *   1. 前端记录「最后活跃时间」lastActive（每次返回页面/操作时更新）
 *   2. 路由守卫遇到过期 token 时，若 10 分钟内用户活跃过 → 调 /auth/refresh 续签
 *   3. 若超过 10 分钟未活跃 → token 已过期 → 直接跳转登录页重新登录
 * - 服务器端 /auth/refresh 仅接受「未过期」或「过期不超过 10 分钟宽限」的 token，
 *   防止过期 token 无限续签（10 分钟后服务器拒绝 → 前端跳登录）
 * - 密钥仍走 24h 时段轮换（getSigningKey/getVerifyingKeys），续签不影响轮换。
 */

import jwt from 'jsonwebtoken'
import { JWT_EXPIRES, JWT_REFRESH_GRACE_SECONDS, getSigningKey, getVerifyingKeys } from '../config/index.js'
import prisma from '../utils/prisma.js'

/** 签发 token（声明与登录时一致） */
export function signToken(user) {
  return jwt.sign({
    cid: user.cid,
    username: user.username,
    rating: user.rating ?? 0,
    permissions: user.permissions || '',
    fsdLevel: user.fsdLevel ?? 0,
    iat: Math.floor(Date.now() / 1000)
  }, getSigningKey(), { expiresIn: JWT_EXPIRES })
}

/** 用密钥环验证 token（兼容轮换密钥），失败抛出含原因的 Error */
export function verifyToken(token) {
  const keys = getVerifyingKeys()
  let lastError = null
  for (const key of keys) {
    try {
      return jwt.verify(token, key, { algorithms: ['HS256'] })
    } catch (err) {
      lastError = err
    }
  }
  const err = new Error('Token 无效')
  err.name = lastError?.name || 'JsonWebTokenError'
  err.expired = lastError?.name === 'TokenExpiredError'
  throw err
}

/**
 * 续签：验证签名（忽略过期），但仅允许「未过期」或「过期不超过宽限期」的 token。
 * 过期超过宽限期（默认 10 分钟）→ 拒绝续签，前端应跳转登录页。
 * @param {string} token 旧 token
 * @returns {object} 解码后的 payload
 * @throws 签名无效 / 过期超宽限 → Error（含 .expired）
 */
export function verifyTokenForRefresh(token) {
  const keys = getVerifyingKeys()
  let decoded = null
  let lastError = null
  for (const key of keys) {
    try {
      decoded = jwt.verify(token, key, { ignoreExpiration: true, algorithms: ['HS256'] })
      break
    } catch (err) {
      lastError = err
    }
  }
  if (!decoded) {
    const err = new Error('Token 无效')
    err.name = lastError?.name || 'JsonWebTokenError'
    err.expired = lastError?.name === 'TokenExpiredError'
    throw err
  }
  // 过期宽限检查：exp 超过宽限期 → 拒绝续签
  const nowSec = Math.floor(Date.now() / 1000)
  if (decoded.exp && decoded.exp < nowSec && (nowSec - decoded.exp) > JWT_REFRESH_GRACE_SECONDS) {
    const err = new Error('Token 已过期')
    err.name = 'TokenExpiredError'
    err.expired = true
    throw err
  }
  return decoded
}

/**
 * 滑动续签（保留兼容）：若 token 剩余有效期低于阈值，重新签发并写入 `X-Renewed-Token` 响应头。
 * 已不再作为主要续签手段（改由前端主动调 /auth/refresh），保留以防遗漏。
 */
export async function applyTokenRenewal(res, decoded) {
  try {
    if (!decoded || !decoded.exp) return false
    const remainingSec = decoded.exp - Math.floor(Date.now() / 1000)
    if (remainingSec < JWT_REFRESH_BEFORE_SECONDS) {
      // 安全(2026-10-25 审计 P1-2): 续签必须查库取最新 claims。
      // 此前用旧 token claims 重签, 降权/封禁/删号对持续在线用户不生效。
      const fresh = await prisma.user.findUnique({
        where: { cid: decoded.cid },
        select: { cid: true, username: true, rating: true, permissions: true, fsdLevel: true }
      }).catch(() => null)
      if (!fresh) return false   // 用户已不存在: 不再续签, 由读超时/refresh 拒绝
      const newToken = signToken(fresh)
      res.setHeader('X-Renewed-Token', newToken)
      return true
    }
  } catch { /* 续签失败不阻塞请求 */ }
  return false
}
