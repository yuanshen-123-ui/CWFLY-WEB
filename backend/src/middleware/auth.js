import { verifyToken, applyTokenRenewal } from '../utils/token.js'
import { trackRequestIp } from '../services/ipHopping.js'
import { hasPermission, hasAnyPermission, ALL_PERMISSIONS } from '../config/permissions.js'

export async function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '请先登录' })
  }

  const token = header.replace('Bearer ', '')
  try {
    const decoded = verifyToken(token)
    req.user = decoded
    // 滑动续签：剩余有效期 < JWT_REFRESH_BEFORE_SECONDS（默认120s）时，
    // 签发新 token 并写入响应头 X-Renewed-Token，前端读取后更新本地会话
    await applyTokenRenewal(res, decoded)
    // IP 跳变检测：以「已认证请求」为粒度上报活跃（含设备指纹，区分换 IP vs 多设备）
    trackRequestIp(req, decoded.cid)
    return next()
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err?.expired ? '登录已过期，请重新登录' : '登录无效，请重新登录'
    })
  }
}

/**
 * 基于 rating（平台权限等级）的节点权限中间件
 * 每个路由节点可设置所需的最低 rating 值
 *
 * 平台权限等级:
 *   0  = 普通用户
 *   8  = 协管员 I1
 *   9  = 高级协管员 I2
 *   11 = 管理员 SUP
 *   12 = 超级管理员 ADM
 *
 * 用法: router.get('/path', requireRating(8), handler)
 */
export function requireRating(minLevel = 8) {
  return (req, res, next) => {
    const userLevel = req.user?.rating ?? 0
    if (userLevel < minLevel) {
      return res.status(403).json({
        success: false,
        message: `权限不足，需要等级 >= ${minLevel}，当前等级 = ${userLevel}`
      })
    }
    next()
  }
}

/**
 * 基于细分权限的中间件
 * 用法: router.get('/path', requirePermission('user'), handler)
 */
export function requirePermission(perm) {
  return (req, res, next) => {
    if (hasPermission(req.user, perm)) {
      return next()
    }
    return res.status(403).json({
      success: false,
      message: `权限不足，需要「${perm}」权限`
    })
  }
}

/**
 * 管理后台入口中间件
 * 必须有细分权限才能访问管理后台；且整体要求 rating >= 8（协管员及以上），
 * 普通用户（rating < 8）即使被误授细分权限也无入口（安全收紧 2026-08-08）。
 * 各功能模块的细粒度权限由后续的 requirePermission() 控制
 * 用法: router.use(requireAdminAccess)
 */
export function requireAdminAccess(req, res, next) {
  if ((req.user?.rating ?? 0) >= 8 && hasAnyPermission(req.user)) {
    return next()
  }
  return res.status(403).json({
    success: false,
    message: '权限不足，无法访问管理后台'
  })
}
