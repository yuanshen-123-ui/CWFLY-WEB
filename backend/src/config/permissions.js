/**
 * 平台细分权限定义
 * 每个权限节点对应一个管理功能
 */
export const PERMISSIONS = {
  USER:       'user',       // 用户管理
  FLIGHTPLAN: 'flightplan', // 飞行计划管理
  EVENT:      'event',      // 活动管理
  CONTROLLER: 'controller', // 管制员申请管理
  STAFF:      'staff',      // 职员申请管理
  TICKET:     'ticket',     // 工单管理
  ONLINE:     'online',     // 在线管理
}

/** 所有权限列表 */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS)

/** 权限中文名映射 */
export const PERMISSION_NAMES = {
  [PERMISSIONS.USER]:       '用户管理',
  [PERMISSIONS.FLIGHTPLAN]: '飞行计划管理',
  [PERMISSIONS.EVENT]:      '活动管理',
  [PERMISSIONS.CONTROLLER]: '管制员申请管理',
  [PERMISSIONS.STAFF]:      '职员申请管理',
  [PERMISSIONS.TICKET]:     '工单管理',
  [PERMISSIONS.ONLINE]:     '在线管理',
}

/**
 * 将权限数组转为逗号分隔字符串（存储用）
 */
export function permsToString(perms) {
  return [...new Set(perms)].filter(p => ALL_PERMISSIONS.includes(p)).join(',')
}

/**
 * 将逗号分隔字符串转为权限数组
 */
export function stringToPerms(str) {
  if (!str) return []
  return str.split(',').filter(p => ALL_PERMISSIONS.includes(p))
}

/**
 * 检查用户是否有指定权限
 * rating >= 11（管理员）自动拥有所有权限
 */
export function hasPermission(user, perm) {
  if (!user) return false
  if ((user.rating ?? 0) >= 11) return true
  const perms = stringToPerms(user.permissions)
  return perms.includes(perm)
}

/**
 * 检查用户是否有任意细分权限
 * 管理后台访问完全基于细分权限，不再依赖 rating
 */
export function hasAnyPermission(user) {
  if (!user) return false
  const perms = stringToPerms(user.permissions)
  return perms.length > 0
}
