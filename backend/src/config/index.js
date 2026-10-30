export const PORT = process.env.PORT || 3000
// L-2 修复：生产环境未显式配置 CORS_ORIGIN 时，不再回退到开发地址 localhost:5173，
// 而是回退到正式前端源（站点为同源部署，实际跨域需求应在 .env 显式声明）。
const IS_PROD = process.env.NODE_ENV === 'production'
export const CORS_ORIGIN = process.env.CORS_ORIGIN
  || (IS_PROD ? 'https://www.cwflysim.cn' : 'http://localhost:5173')

// ===== JWT 会话策略（2026-08-09 调整：10min 过期 + 前端判定续签）=====
// 有效期 10 分钟：token 过期后服务器不承认（访问受保护接口返回 401）。
// 续签由前端主动调 /auth/refresh：前端记录最后活跃时间，10 分钟内活跃则续签，
// 否则跳转登录页重新登录。服务器仅允许「未过期或过期不超过宽限期」的 token 续签。
export const JWT_EXPIRES = process.env.JWT_EXPIRES || '10m'
// 过期宽限秒数：token 已过期但不超过该秒数仍可续签（默认 10 分钟）
export const JWT_REFRESH_GRACE_SECONDS = Number(process.env.JWT_REFRESH_GRACE_SECONDS || 600)
// 滑动续签阈值（保留兼容，不再作为主要续签手段）
export const JWT_REFRESH_BEFORE_SECONDS = Number(process.env.JWT_REFRESH_BEFORE_SECONDS || 120)

// 基础密钥（来自环境变量，作为密钥种子）
const BASE_SECRET = process.env.JWT_SECRET
if (!BASE_SECRET || BASE_SECRET === 'cwfly-secret-key-2024' || BASE_SECRET.length < 32) {
  console.error('\n  ╔═══════════════════════════════════════════════╗')
  console.error('  ║  安全错误: JWT_SECRET 环境变量未设置或过短    ║')
  console.error('  ║  请在 .env 中设置至少 32 字符的随机密钥      ║')
  console.error('  ╚═══════════════════════════════════════════════╝\n')
  process.exit(1)
}

// 使用带时段轮换的密钥派生（PM2 集群兼容）
// 所有进程从同一 BASE_SECRET 派生出相同时段的密钥
import { getSigningKey as getRotatedKey, getVerifyingKeys as getRotatedKeys } from '../services/keyRotation.js'

/** 获取当前签名密钥（每 24 小时自动轮换） */
export function getSigningKey() {
  return getRotatedKey()
}

/** 获取所有有效验证密钥（含过去 7 个周期的旧密钥） */
export function getVerifyingKeys() {
  return getRotatedKeys()
}

console.log(`[JWT] 密钥轮换已启用（每 ${24} 小时自动轮换，保留 7 天验证窗口）`)
