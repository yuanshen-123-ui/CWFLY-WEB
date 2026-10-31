/**
 * 路由预取（与 CTYFLY-WEB 的 prefetch.js 对齐）
 * 悬停/聚焦菜单项时提前加载对应页面 chunk，点击即可秒开。
 */
import router from '@/router'

const prefetched = new Set()

/** 预取单个路由（已取过则跳过；失败静默） */
export function prefetchRoute(to) {
  if (!to || typeof to !== 'string' || !to.startsWith('/')) return
  if (prefetched.has(to)) return
  prefetched.add(to)
  try {
    const resolved = router.resolve(to)
    const record = resolved.matched[resolved.matched.length - 1]
    const loader = record?.components?.default
    if (typeof loader === 'function') {
      const result = loader()
      if (result && typeof result.catch === 'function') result.catch(() => {})
    }
  } catch {
    /* 预取失败不影响导航 */
  }
}

/** 空闲时批量预取，避免与首屏抢带宽 */
export function prefetchRoutesOnIdle(list = []) {
  const run = () => list.forEach(prefetchRoute)
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1200)
}
