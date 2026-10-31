/**
 * 应用导航交互 composables（拆分自 components/layout/AppLayout.vue 的脚本段）
 *
 * 单一职责划分：
 * - useNavLayoutSwitch  侧边栏 ⇄ 顶部栏 三段式布局切换（190ms 换挂载 / 520ms 收尾）
 * - useSidebarDrawer    移动端抽屉开合（窄屏自动关闭）
 * - useSidebarResize    侧边栏宽度拖拽（180~400px）+ --sidebar-w 变量值
 * - useNavCurrent       最长前缀匹配的「当前导航项」（/tickets/new 不会同时命中 /tickets）
 * - useNavAccordion     手风琴分组（同一时间只展开一组）
 * - useNavHighlight     rAF 逐帧跟随的滑动高亮块测量
 * - useNavTooltip       收拢态 tooltip（独立元素 + 视口坐标）
 * - useTopbarPanel      顶栏锚定下拉面板（位置/宽度跟触发项）
 *
 * 约定：
 * - 本文件不直接读写 localStorage；布局/收拢偏好统一由 utils/navLayout.js 负责持久化。
 * - 除 FALLBACK_AVATAR（布局内共享的常量）外，所有状态由调用方 setup() 创建，
 *   不跨组件共享单例，避免隐式耦合。
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import {
  navLayout,
  narrowScreen,
  isTopLayout,
  isCollapsed,
  toggleNavCollapsed,
} from '@/utils/navLayout'
import { navGroups, singleNavItems, accountNavItems } from '@/utils/nav'

/** 头像加载失败兜底图（原 AppLayout 内部常量，顶栏与侧栏共用） */
export const FALLBACK_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#fff">' +
      '<circle cx="12" cy="8" r="4"/><path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z"/></svg>',
  )

// ---------------------------------------------------------------------------
// 导航项可见性 / 当前项
// ---------------------------------------------------------------------------

/**
 * 按用户权限过滤分组内子项（纯函数，便于测试）
 * - 管理后台分组：按细分权限 + 超管等级过滤；其他分组：按 minLevel 过滤
 * @param {{ adminOnly?: boolean, items: Array<Record<string, any>> }} group
 * @param {ReturnType<typeof useUserStore>} user
 * @returns {Array<Record<string, any>>}
 */
export function filterVisibleItems(group, user) {
  if (group.adminOnly) {
    return group.items.filter(
      (i) =>
        (!i.requiredPermission || user.hasPermission(i.requiredPermission)) &&
        (!i.requiredRating || user.rating >= i.requiredRating),
    )
  }
  return group.items.filter((i) => !i.minLevel || user.hasRating(i.minLevel))
}

/** 返回绑定当前用户的 visibleItems(group) 函数 */
export function useNavVisibleItems() {
  const user = useUserStore()
  return (group) => filterVisibleItems(group, user)
}

/**
 * 当前导航项（最长前缀匹配 + 落组回退）
 * @returns {{
 *   current: import('vue').ComputedRef<{ to: string, group?: string } | null>,
 *   isLinkCurrent: (to: string) => boolean,
 *   isSubCurrent: (group: any, item: any, expanded: string) => boolean,
 *   isGroupCurrent: (group: any, expanded: string) => boolean,
 *   isGroupActive: (group: any) => boolean
 * }}
 */
export function useNavCurrent() {
  const route = useRoute()
  const user = useUserStore()

  /** 全部可见导航项（用于「当前项」最长前缀匹配） */
  const navCandidates = computed(() => {
    const list = []
    for (const item of singleNavItems) list.push({ to: item.path })
    for (const group of navGroups) {
      for (const item of filterVisibleItems(group, user)) list.push({ to: item.path, group: group.title })
    }
    for (const item of accountNavItems) list.push({ to: item.path })
    return list
  })

  /** 唯一当前项：前缀匹配里路径最长的那个（/tickets/new 不会同时命中 /tickets） */
  const current = computed(() => {
    const path = route.path
    let best = null
    for (const c of navCandidates.value) {
      if (path !== c.to && !path.startsWith(`${c.to}/`)) continue
      if (!best || c.to.length > best.to.length) best = c
    }
    return best
  })

  /** 一级链接（单项目 / 账号项）是否为当前项 */
  function isLinkCurrent(to) {
    return !current.value?.group && current.value?.to === to
  }

  /** 二级项是否为当前项（仅在所属分组展开时高亮二级） */
  function isSubCurrent(group, item, expanded) {
    return expanded === group.title && current.value?.to === item.path
  }

  /** 当前项落在被折叠的二级里时，高亮它所属的一级按钮 */
  function isGroupCurrent(group, expanded) {
    return current.value?.group === group.title && expanded !== group.title
  }

  /** 当前项是否属于该分组（一级按钮的展开/active 态） */
  function isGroupActive(group) {
    return current.value?.group === group.title
  }

  return { current, isLinkCurrent, isSubCurrent, isGroupCurrent, isGroupActive }
}

// ---------------------------------------------------------------------------
// 布局切换（侧边栏 ⇄ 顶部栏）
// ---------------------------------------------------------------------------

/**
 * 三段式布局切换：旧布局先播退出动画，190ms 后才真正换挂载，520ms 收尾。
 * @returns {{
 *   switching: import('vue').Ref<boolean>,
 *   swapped: import('vue').Ref<boolean>,
 *   leavingLayout: import('vue').Ref<string>,
 *   shellNavTop: import('vue').ComputedRef<boolean>
 * }}
 */
export function useNavLayoutSwitch() {
  const switching = ref(false) // 布局切换过渡进行中
  const swapped = ref(false) // 是否已到「换挂载」时刻（内容不可见的那一帧）
  const leavingLayout = ref('') // 正在退出的布局：'sidebar' | 'topbar'
  let swapTimers = []

  function clearSwapTimers() {
    swapTimers.forEach(clearTimeout)
    swapTimers = []
  }

  /** 过渡期间实际挂载的布局：旧布局先播退出动画，190ms 后才真正换挂载 */
  const shellNavTop = computed(() => {
    if (!switching.value) return isTopLayout.value
    const enteringTop = navLayout.value === 'topbar'
    return swapped.value ? enteringTop : !enteringTop
  })

  watch(navLayout, () => {
    // 窄屏下翻转偏好，生效布局不变，没有过渡可播
    if (narrowScreen.value) return
    // 减少动效偏好：直接切换
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    switching.value = true
    swapped.value = false
    leavingLayout.value = navLayout.value === 'topbar' ? 'sidebar' : 'topbar'
    clearSwapTimers()
    swapTimers = [
      setTimeout(() => {
        swapped.value = true
      }, 190),
      setTimeout(() => {
        switching.value = false
        swapped.value = false
        leavingLayout.value = ''
      }, 520),
    ]
  })

  watch(narrowScreen, (narrow) => {
    if (!narrow) return
    switching.value = false
    swapped.value = false
    leavingLayout.value = ''
    clearSwapTimers()
  })

  onUnmounted(clearSwapTimers)

  return { switching, swapped, leavingLayout, shellNavTop }
}

// ---------------------------------------------------------------------------
// 移动端抽屉
// ---------------------------------------------------------------------------

/**
 * 移动端侧边栏抽屉（窄屏自动收起）
 * @returns {{
 *   sidebarOpen: import('vue').Ref<boolean>,
 *   openSidebar: () => void,
 *   closeSidebar: () => void,
 *   toggleSidebar: () => void
 * }}
 */
export function useSidebarDrawer() {
  const sidebarOpen = ref(false)
  const openSidebar = () => {
    sidebarOpen.value = true
  }
  const closeSidebar = () => {
    sidebarOpen.value = false
  }
  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value
  }

  watch(narrowScreen, (narrow) => {
    if (!narrow) return
    sidebarOpen.value = false
  })

  return { sidebarOpen, openSidebar, closeSidebar, toggleSidebar }
}

// ---------------------------------------------------------------------------
// 侧边栏宽度拖拽
// ---------------------------------------------------------------------------

/**
 * 侧边栏宽度拖拽（180~400px）+ 地图页 --sidebar-w 变量值
 * @returns {{
 *   sidebarWidth: import('vue').Ref<string>,
 *   isMobile: import('vue').Ref<boolean>,
 *   sidebarWVar: import('vue').ComputedRef<string>,
 *   startResize: (e: MouseEvent) => void
 * }}
 */
export function useSidebarResize() {
  const sidebarWidth = ref('240px')
  const isMobile = ref(typeof window !== 'undefined' && window.innerWidth <= 860)
  let resizeStartX = 0
  let resizeStartW = 0

  function updateViewport() {
    isMobile.value = window.innerWidth <= 860
  }

  // 地图等 fixed 定位页面通过 CSS 变量 --sidebar-w 跟随侧边栏宽度
  // 移动端侧边栏为抽屉(不占位) → 置 0 让地图全屏
  const sidebarWVar = computed(() =>
    isMobile.value || isTopLayout.value ? '0px' : isCollapsed.value ? '68px' : sidebarWidth.value,
  )

  function startResize(e) {
    resizeStartX = e.clientX
    resizeStartW = parseInt(sidebarWidth.value)
    document.addEventListener('mousemove', onResize)
    document.addEventListener('mouseup', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function onResize(e) {
    const w = Math.max(180, Math.min(400, resizeStartW + (e.clientX - resizeStartX)))
    sidebarWidth.value = w + 'px'
  }

  function stopResize() {
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  onMounted(() => window.addEventListener('resize', updateViewport))
  onUnmounted(() => {
    window.removeEventListener('resize', updateViewport)
    stopResize()
  })

  return { sidebarWidth, isMobile, sidebarWVar, startResize }
}

// ---------------------------------------------------------------------------
// 手风琴
// ---------------------------------------------------------------------------

/**
 * 手风琴分组（同一时间只展开一组；再点已展开那组则收起）
 * @returns {{
 *   expandedGroup: import('vue').Ref<string>,
 *   syncOpenGroups: () => void,
 *   toggleGroup: (title: string) => void,
 *   onGroupToggle: (group: any) => void
 * }}
 */
export function useNavAccordion() {
  const route = useRoute()
  const user = useUserStore()
  const expandedGroup = ref('')

  /** 路由变化时把当前项所在的组展开（找不到则保留手动展开/展开第一组） */
  function syncOpenGroups() {
    const path = route.path
    let active = null
    for (const group of navGroups) {
      if (group.items.some((c) => path === c.path || path.startsWith(`${c.path}/`))) {
        active = group
        break
      }
    }
    if (active) {
      expandedGroup.value = active.title
      return
    }
    // 当前路由不在任何分组（如仪表盘）：保留手动展开的那一组；都没有则展开第一组
    if (!expandedGroup.value) {
      const first = navGroups.find((g) => !g.adminOnly && filterVisibleItems(g, user).length > 0)
      if (first) expandedGroup.value = first.title
    }
  }

  function toggleGroup(title) {
    expandedGroup.value = expandedGroup.value === title ? '' : title
  }

  /** 收拢态点分组：先展开侧边栏，再打开该组 */
  function onGroupToggle(group) {
    if (isCollapsed.value) {
      toggleNavCollapsed()
      expandedGroup.value = group.title
      return
    }
    toggleGroup(group.title)
  }

  return { expandedGroup, syncOpenGroups, toggleGroup, onGroupToggle }
}

// ---------------------------------------------------------------------------
// 滑动高亮块
// ---------------------------------------------------------------------------

/**
 * 滑动高亮块：单元素 + rAF 逐帧跟随（展开/收拢/抽屉开合时目标项持续位移）
 * @param {import('vue').Ref<HTMLElement | null>} navRef 侧边栏 <nav> 元素
 * @returns {{
 *   hl: { x: number, y: number, w: number, h: number, show: boolean, ready: boolean },
 *   hlStyle: import('vue').ComputedRef<Record<string, string>>,
 *   measure: () => void,
 *   startFollow: (ms?: number) => void,
 *   markReady: () => void
 * }}
 */
export function useNavHighlight(navRef) {
  const hl = reactive({ x: 0, y: 0, w: 0, h: 0, show: false, ready: false })
  const hlStyle = computed(() => ({
    transform: `translate3d(${hl.x}px, ${hl.y}px, 0)`,
    width: `${hl.w}px`,
    height: `${hl.h}px`,
    opacity: hl.show ? 1 : 0,
  }))
  let rafId = 0

  function measure() {
    const nav = navRef.value
    if (!nav) {
      hl.show = false
      return
    }
    const target = nav.querySelector('.nav-current')
    if (!target) {
      hl.show = false
      return
    }
    // 用 getBoundingClientRect：二级项在 position:relative 的子容器里，offsetTop 会算错
    const tr = target.getBoundingClientRect()
    const nr = nav.getBoundingClientRect()
    hl.x = Math.round(tr.left - nr.left + nav.scrollLeft)
    hl.y = Math.round(tr.top - nr.top + nav.scrollTop)
    hl.w = Math.round(tr.width)
    hl.h = Math.round(tr.height)
    hl.show = true
  }

  /** 一段时间内逐帧跟随：展开/收拢/抽屉开合时目标项在持续位移，单次 measure 跟不上 */
  function startFollow(ms = 480) {
    cancelAnimationFrame(rafId)
    const end = performance.now() + ms
    const tick = () => {
      measure()
      if (performance.now() < end) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  /** 首帧先把高亮摆好位置，再开启过渡，避免从 0,0 滑进来 */
  function markReady() {
    requestAnimationFrame(() => {
      hl.ready = true
    })
  }

  onUnmounted(() => cancelAnimationFrame(rafId))

  return { hl, hlStyle, measure, startFollow, markReady }
}

// ---------------------------------------------------------------------------
// 收拢态 tooltip
// ---------------------------------------------------------------------------

/**
 * 收拢态 tooltip（独立元素 + 视口坐标：backdrop-filter 会改变 fixed 包含块）
 * @returns {{
 *   tip: { show: boolean, text: string, x: number, y: number },
 *   showTip: (e: Event, text?: string) => void,
 *   hideTip: () => void
 * }}
 */
export function useNavTooltip() {
  const tip = reactive({ show: false, text: '', x: 0, y: 0 })

  function showTip(e, text) {
    if (!isCollapsed.value || !text) return
    const r = e.currentTarget.getBoundingClientRect()
    tip.text = text
    tip.x = Math.round(r.right + 10)
    tip.y = Math.round(r.top + r.height / 2)
    tip.show = true
  }

  function hideTip() {
    tip.show = false
  }

  return { tip, showTip, hideTip }
}

// ---------------------------------------------------------------------------
// 顶栏下拉面板
// ---------------------------------------------------------------------------

/**
 * 顶栏锚定下拉面板：left/width 与触发项关联；面板常驻，只对内容做交叉淡入
 * @returns {{
 *   topbarActive: import('vue').Ref<string>,
 *   topbarGroups: import('vue').ComputedRef<Array<Record<string, any>>>,
 *   topbarGroup: import('vue').ComputedRef<Record<string, any> | null>,
 *   topbarColumns: import('vue').ComputedRef<Array<Array<Record<string, any>>>>,
 *   topbarPanelStyle: import('vue').ComputedRef<{ left: string, width: string }>,
 *   anchorTopbar: (el: HTMLElement | null) => void,
 *   openTopbarGroup: (title: string, event?: Event) => void,
 *   closeTopbarPanel: () => void,
 *   scheduleTopbarClose: () => void,
 *   cancelTopbarClose: () => void
 * }}
 */
export function useTopbarPanel() {
  const user = useUserStore()
  const topbarActive = ref('')
  const topbarRect = ref({ left: 0, width: 480 })
  let topbarCloseTimer = null

  const topbarGroup = computed(() => navGroups.find((g) => g.title === topbarActive.value) || null)
  const topbarGroups = computed(() =>
    navGroups.filter((g) => !g.adminOnly || (user.rating >= 8 && filterVisibleItems(g, user).length > 0)),
  )
  const topbarColumns = computed(() => {
    const group = topbarGroup.value
    if (!group) return []
    const items = filterVisibleItems(group, user)
    if (items.length <= 4) return [items]
    const colCount = Math.ceil(items.length / 4)
    const per = Math.ceil(items.length / colCount)
    const cols = []
    for (let i = 0; i < items.length; i += per) cols.push(items.slice(i, i + per))
    return cols
  })
  const topbarPanelStyle = computed(() => ({
    left: `${Math.round(topbarRect.value.left)}px`,
    width: `${Math.round(topbarRect.value.width)}px`,
  }))

  function anchorTopbar(el) {
    if (!el?.getBoundingClientRect) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(Math.round(rect.width) + 140, 480)
    const maxLeft = window.innerWidth - width - 12
    topbarRect.value = {
      left: Math.max(12, Math.min(Math.round(rect.left), Math.max(12, maxLeft))),
      width,
    }
  }

  function openTopbarGroup(title, event) {
    if (narrowScreen.value) return
    cancelTopbarClose()
    anchorTopbar(event?.currentTarget || event?.target)
    topbarActive.value = title
  }

  function closeTopbarPanel() {
    topbarActive.value = ''
  }

  function scheduleTopbarClose() {
    if (topbarCloseTimer) clearTimeout(topbarCloseTimer)
    topbarCloseTimer = setTimeout(closeTopbarPanel, 140)
  }

  function cancelTopbarClose() {
    if (topbarCloseTimer) {
      clearTimeout(topbarCloseTimer)
      topbarCloseTimer = null
    }
  }

  onUnmounted(() => {
    if (topbarCloseTimer) clearTimeout(topbarCloseTimer)
  })

  return {
    topbarActive,
    topbarGroups,
    topbarGroup,
    topbarColumns,
    topbarPanelStyle,
    anchorTopbar,
    openTopbarGroup,
    closeTopbarPanel,
    scheduleTopbarClose,
    cancelTopbarClose,
  }
}
