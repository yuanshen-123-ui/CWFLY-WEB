/**
 * 安全错误处理 - 不泄露 SQL/Prisma 细节到前端
 */
export function handleError(res, e, context = '') {
  const msg = e?.message || '操作失败'
  console.error(`[${context}] Error:`, msg)
  // 生产环境不返回具体错误信息
  res.status(500).json({ success: false, message: '操作失败，请稍后重试' })
}
