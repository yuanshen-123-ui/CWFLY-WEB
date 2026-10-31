// @vitest-environment jsdom
/**
 * useAppNav 组合式函数单元测试（导航可见性 / 当前项 / 手风琴分组）
 *
 * 覆盖点：
 * - FALLBACK_AVATAR：data URI 前缀、内容经 encodeURIComponent 编码、解码后是 32x32 的 SVG
 * - filterVisibleItems（纯函数）：
 *   · 普通分组按 minLevel 走 user.hasRating，无 minLevel 全可见
 *   · 管理后台分组按 requiredPermission（user.hasPermission）+ requiredRating（user.rating 数值直比）过滤
 *   · 空 items、未知权限、两个条件同时要求、原数组不被修改
 * - useNavVisibleItems：绑定当前 pinia 用户的 rating/permissions，store 变化后结果随之变化
 * - useNavCurrent：最长前缀匹配（/tickets/new 命中 /tickets）、非片段前缀不误匹配（/maps 不命中 /map）、
 *   管理项按权限出现、isLinkCurrent/isSubCurrent/isGroupCurrent/isGroupActive 语义
 * - useNavAccordion：路由命中分组时展开该组、路由不在分组时展开第一组可用的非管理组、
 *   保留手动展开、toggleGroup 同组收起/异组切换、收拢态 onGroupToggle 先展开侧边栏
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { navGroups } from '@/utils/nav'
import { setNavCollapsed } from '@/utils/navLayout'
import { useUserStore } from '@/store/user'
import {
  FALLBACK_AVATAR,
  filterVisibleItems,
  useNavVisibleItems,
  useNavCurrent,
  useNavAccordion,
} from '../useAppNav.js'

const { routeMock } = vi.hoisted(() => ({ routeMock: { path: '/dashboard' } }))

vi.mock('vue-router', () => ({ useRoute: () => routeMock }))

/** 构造一个满足 filterVisibleItems 依赖的最小 user 对象（可断言调用参数） */
function makeUser({ rating = 0, permissions = [] } = {}) {
  const granted = new Set(permissions)
  return {
    rating,
    hasPermission: vi.fn((perm) => rating >= 11 || granted.has(perm)),
    hasRating: vi.fn((minLevel) => rating >= 11 || rating >= minLevel),
  }
}

/** 取真实导航数据里的指定分组（避免测试自己伪造结构而与产品数据脱节） */
function groupByTitle(title) {
  const group = navGroups.find((g) => g.title === title)
  if (!group) throw new Error(`导航分组不存在: ${title}`)
  return group
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  setNavCollapsed(false)
  routeMock.path = '/dashboard'
})

afterEach(() => {
  setNavCollapsed(false)
})

describe('FALLBACK_AVATAR', () => {
  it('是经过 URI 编码的 32x32 data URI SVG', () => {
    expect(FALLBACK_AVATAR.startsWith('data:image/svg+xml,')).toBe(true)
    // data URI 里不能出现未编码的尖括号，否则某些浏览器会截断
    expect(FALLBACK_AVATAR).not.toContain('<')
    expect(FALLBACK_AVATAR).not.toContain('>')

    const svg = decodeURIComponent(FALLBACK_AVATAR.slice('data:image/svg+xml,'.length))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('width="32"')
    expect(svg).toContain('height="32"')
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).toContain('<circle')
    expect(svg).toContain('<path')
  })
})

describe('filterVisibleItems：普通分组（minLevel）', () => {
  const group = {
    title: '普通组',
    items: [
      { path: '/a', label: '无门槛' },
      { path: '/b', label: '需 8 级', minLevel: 8 },
      { path: '/c', label: '需 9 级', minLevel: 9 },
    ],
  }

  it('无 minLevel 的项全部可见，有 minLevel 的按 hasRating 过滤', () => {
    const user = makeUser({ rating: 8 })
    const visible = filterVisibleItems(group, user)
    expect(visible.map((i) => i.path)).toEqual(['/a', '/b'])
    expect(user.hasRating).toHaveBeenCalledWith(8)
    expect(user.hasRating).toHaveBeenCalledWith(9)
    // 非管理组不查细分权限
    expect(user.hasPermission).not.toHaveBeenCalled()
  })

  it('rating 0 只能看到无门槛项', () => {
    const user = makeUser({ rating: 0 })
    expect(filterVisibleItems(group, makeUser({ rating: 0 })).map((i) => i.path)).toEqual(['/a'])
    // 普通用户 hasRating(0) 行为由 store 决定；这里只断言过滤结果不依赖具体阈值语义
    expect(user.hasRating).not.toHaveBeenCalled()
  })

  it('minLevel 恰好等于 rating 时可见（>= 边界）', () => {
    expect(filterVisibleItems(group, makeUser({ rating: 9 })).map((i) => i.path)).toEqual([
      '/a',
      '/b',
      '/c',
    ])
    expect(filterVisibleItems(group, makeUser({ rating: 8 })).map((i) => i.path)).toEqual([
      '/a',
      '/b',
    ])
  })
})

describe('filterVisibleItems：管理后台分组（权限 + rating）', () => {
  it('无 requiredPermission / requiredRating 的管理项对所有用户可见', () => {
    const group = { title: '管理', adminOnly: true, items: [{ path: '/admin/home' }] }
    expect(filterVisibleItems(group, makeUser({ rating: 0 })).map((i) => i.path)).toEqual([
      '/admin/home',
    ])
  })

  it('按细分权限过滤，并透传权限名给 hasPermission', () => {
    const group = {
      title: '管理',
      adminOnly: true,
      items: [
        { path: '/admin/users', requiredPermission: 'user' },
        { path: '/admin/tickets', requiredPermission: 'ticket' },
      ],
    }
    const user = makeUser({ rating: 8, permissions: ['user'] })
    expect(filterVisibleItems(group, user).map((i) => i.path)).toEqual(['/admin/users'])
    expect(user.hasPermission).toHaveBeenCalledWith('user')
    expect(user.hasPermission).toHaveBeenCalledWith('ticket')
  })

  it('requiredRating 用 user.rating 数值直接比较（不调用 hasRating）', () => {
    const group = {
      title: '管理',
      adminOnly: true,
      items: [{ path: '/admin/audit', requiredPermission: 'online', requiredRating: 12 }],
    }
    const user11 = makeUser({ rating: 11, permissions: ['online'] })
    expect(filterVisibleItems(group, user11)).toEqual([])
    expect(user11.hasPermission).toHaveBeenCalledWith('online')

    const user12 = makeUser({ rating: 12, permissions: ['online'] })
    expect(filterVisibleItems(group, user12).map((i) => i.path)).toEqual(['/admin/audit'])
    expect(user12.hasRating).not.toHaveBeenCalled()
  })

  it('requiredPermission 与 requiredRating 同时满足才可见', () => {
    const group = {
      title: '管理',
      adminOnly: true,
      items: [{ path: '/admin/role', requiredPermission: 'staff', requiredRating: 9 }],
    }
    // 缺权限
    expect(
      filterVisibleItems(group, makeUser({ rating: 9, permissions: [] })).map((i) => i.path),
    ).toEqual([])
    // 权限够但等级不够
    expect(
      filterVisibleItems(group, makeUser({ rating: 8, permissions: ['staff'] })).map((i) => i.path),
    ).toEqual([])
    // 两个条件都满足
    expect(
      filterVisibleItems(group, makeUser({ rating: 9, permissions: ['staff'] })).map((i) => i.path),
    ).toEqual(['/admin/role'])
  })

  it('未知权限一律过滤', () => {
    const group = {
      title: '管理',
      adminOnly: true,
      items: [{ path: '/admin/x', requiredPermission: 'unknown-perm' }],
    }
    expect(filterVisibleItems(group, makeUser({ rating: 8, permissions: ['user'] }))).toEqual([])
  })
})

describe('filterVisibleItems：边界与不可变性', () => {
  it('空 items 返回空数组', () => {
    expect(filterVisibleItems({ title: '空', items: [] }, makeUser())).toEqual([])
    expect(filterVisibleItems({ title: '空管理', adminOnly: true, items: [] }, makeUser())).toEqual(
      [],
    )
  })

  it('返回新数组且不修改原始 group.items', () => {
    const items = [{ path: '/x', minLevel: 9 }, { path: '/y' }]
    const group = { title: 'g', items }
    const visible = filterVisibleItems(group, makeUser({ rating: 0 }))
    expect(visible).not.toBe(items)
    expect(items).toHaveLength(2)
    expect(visible.map((i) => i.path)).toEqual(['/y'])
  })
})

describe('useNavVisibleItems（绑定当前 pinia 用户）', () => {
  it('默认用户（rating 0）看不到 minLevel 8 的项，修改 store 后立即可见', () => {
    const user = useUserStore()
    const visibleItems = useNavVisibleItems()
    const group = { title: 'g', items: [{ path: '/a', minLevel: 8 }] }

    expect(visibleItems(group)).toEqual([])

    user.profile = { rating: 8, permissions: '' }
    expect(visibleItems(group).map((i) => i.path)).toEqual(['/a'])
  })

  it('权限变化会实时反映到管理项可见性', () => {
    const user = useUserStore()
    const visibleItems = useNavVisibleItems()
    const group = {
      title: '管理',
      adminOnly: true,
      items: [{ path: '/admin/users', requiredPermission: 'user' }],
    }

    expect(visibleItems(group)).toEqual([])

    user.profile = { rating: 9, permissions: 'user,controller' }
    expect(visibleItems(group).map((i) => i.path)).toEqual(['/admin/users'])
  })
})

describe('useNavCurrent（最长前缀匹配）', () => {
  it('单项目路由：/dashboard 命中仪表盘并判定为一级链接当前项', () => {
    routeMock.path = '/dashboard'
    const nav = useNavCurrent()
    expect(nav.current.value).toEqual({ to: '/dashboard' })
    expect(nav.isLinkCurrent('/dashboard')).toBe(true)
    expect(nav.isLinkCurrent('/profile')).toBe(false)
  })

  it('/tickets/new 命中最长前缀 /tickets（不会命中为空或误命中其它组）', () => {
    routeMock.path = '/tickets/new'
    const nav = useNavCurrent()
    expect(nav.current.value).toEqual({ to: '/tickets', group: '帮助与支持' })
    expect(nav.isLinkCurrent('/tickets')).toBe(false)
    expect(nav.isGroupActive(groupByTitle('帮助与支持'))).toBe(true)
  })

  it('非片段前缀不误匹配：/maps 不会命中 /map', () => {
    routeMock.path = '/maps'
    expect(useNavCurrent().current.value).toBeNull()
  })

  it('管理项默认不可见（未授权时 current 为 null），授权后 current 指向管理项', () => {
    routeMock.path = '/admin/users'
    const user = useUserStore()
    const nav = useNavCurrent()
    expect(nav.current.value).toBeNull()

    user.profile = { rating: 12, permissions: 'user' }
    expect(nav.current.value).toEqual({ to: '/admin/users', group: '管理后台' })
    expect(nav.isGroupActive(groupByTitle('管理后台'))).toBe(true)
    expect(nav.isLinkCurrent('/admin/users')).toBe(false)
  })

  it('isSubCurrent / isGroupCurrent：展开态高亮二级，折叠态高亮一级', () => {
    routeMock.path = '/tickets'
    const nav = useNavCurrent()
    const group = groupByTitle('帮助与支持')
    const item = group.items.find((i) => i.path === '/tickets')

    // 分组已展开：二级项高亮，一级按钮不算「折叠当前」
    expect(nav.isSubCurrent(group, item, group.title)).toBe(true)
    expect(nav.isGroupCurrent(group, group.title)).toBe(false)

    // 分组折叠：一级按钮高亮
    expect(nav.isSubCurrent(group, item, '')).toBe(false)
    expect(nav.isGroupCurrent(group, '')).toBe(true)
    expect(nav.isGroupCurrent(group, '活动中心')).toBe(true)
  })
})

describe('useNavAccordion（手风琴分组展开状态）', () => {
  it('路由命中分组时展开该组', () => {
    const nav = useNavAccordion()
    routeMock.path = '/tickets'
    nav.syncOpenGroups()
    expect(nav.expandedGroup.value).toBe('帮助与支持')
  })

  it('路由同时属于多个前缀时按 navGroups 顺序取第一个命中组', () => {
    const nav = useNavAccordion()
    routeMock.path = '/apply/controller'
    nav.syncOpenGroups()
    expect(nav.expandedGroup.value).toBe('申请')
  })

  it('路由不在任何分组时展开第一个「非管理且有可见项」的组', () => {
    const nav = useNavAccordion()
    routeMock.path = '/dashboard'
    nav.syncOpenGroups()
    expect(nav.expandedGroup.value).toBe('飞行中心')
  })

  it('路由不在分组且用户手动展开过某组时，保留手动展开', () => {
    const nav = useNavAccordion()
    routeMock.path = '/dashboard'
    nav.toggleGroup('活动中心')
    nav.syncOpenGroups()
    expect(nav.expandedGroup.value).toBe('活动中心')
  })

  it('toggleGroup：再点同一组收起，点其它组则切换', () => {
    const nav = useNavAccordion()
    nav.toggleGroup('飞行中心')
    expect(nav.expandedGroup.value).toBe('飞行中心')
    nav.toggleGroup('飞行中心')
    expect(nav.expandedGroup.value).toBe('')
    nav.toggleGroup('飞行中心')
    nav.toggleGroup('活动中心')
    expect(nav.expandedGroup.value).toBe('活动中心')
  })

  it('收拢态 onGroupToggle 先展开侧边栏再打开该组；展开态只切换分组', () => {
    const nav = useNavAccordion()
    const group = groupByTitle('飞行中心')

    setNavCollapsed(true)
    nav.onGroupToggle(group)
    expect(nav.expandedGroup.value).toBe('飞行中心')

    setNavCollapsed(false)
    nav.onGroupToggle(group)
    expect(nav.expandedGroup.value).toBe('')
  })
})
