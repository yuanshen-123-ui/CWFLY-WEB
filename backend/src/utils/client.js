/**
 * 客户端请求元数据解析工具
 *
 * 统一从请求中提取证据链字段（真实 IP / 设备指纹 / User-Agent / Referer / 登录用户），
 * 供 登录、注册、追踪像素、请求级日志 复用，保证各数据源字段口径一致：
 * - LoginLog / SecurityEvent / User.registerIp 等落库字段
 * - nginx access_log（$http_x_device_fp / $http_cookie）与 morgan 请求日志
 */

/**
 * 获取客户端真实 IP（安全加固 2026-08-07）
 * 信任链: 请求经 nginx 反代(来源为本地回环)时, 信任 nginx 用 $remote_addr 覆盖注入的 X-Real-IP;
 * 请求直连后端(来源非回环)时, 使用 TCP 对端真实地址(客户端无法伪造)。
 * 修复: 不再信任客户端可自带的 X-Forwarded-For 首段(可伪造)。
 */
export function getClientIp(req) {
  const remote = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
  const xrip = (req.headers['x-real-ip'] || '').trim()
  const xff = (req.headers['x-forwarded-for'] || '').split(',').pop()?.trim()
  // 经 nginx 反代(来源为回环)时, 信任 nginx 覆盖注入的 X-Real-IP
  if (remote === '127.0.0.1' || remote === '::1') {
    return xrip || xff || remote
  }
  return remote
}

/**
 * 获取设备指纹
 * 优先级：X-Device-Fp 请求头（axios 拦截器注入） > pixel.gif 的 _fp 查询参数（<img> 无法带自定义头）
 */
export function getDeviceFp(req) {
  const fromHeader = (req.headers['x-device-fp'] || '').trim()
  if (fromHeader) return fromHeader
  const fromQuery = req.query && req.query._fp ? String(req.query._fp).trim() : ''
  return fromQuery
}

/** 获取 User-Agent（截断 190 字符，兼容 MySQL VARCHAR(191)，超长 UA 写库不再报错） */
export function getUserAgent(req) {
  return (req.headers['user-agent'] || '').slice(0, 190)
}

/** 获取 Referer（截断 500 字符） */
export function getReferrer(req) {
  return (req.headers['referer'] || req.headers['referrer'] || '').slice(0, 500)
}

/** 获取登录用户 CID（像素 _uid 查询参数 或 已认证 JWT） */
export function getUserId(req) {
  const fromQuery = req.query && req.query._uid ? String(req.query._uid).trim() : ''
  if (fromQuery) return fromQuery
  return (req.user && req.user.cid) || ''
}

/** 提取 Cookie（截断 500 字符，用于请求日志归因会话） */
export function getCookies(req) {
  return (req.headers.cookie || '').slice(0, 500)
}
