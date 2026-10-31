<script>
/**
 * 统一图标组件 Icon
 *
 * 设计原则：不重复维护 SVG 路径数据。
 *  - 顶栏/头像区图标：直接复用 src/utils/nav.js 的 `icons`
 *  - 二级菜单图标：复用 navGroups 内的同一条路径，按路由路径映射成语义名
 *  - 仅补充 nav.js 未覆盖的少量提示类图形（inbox/star/trophy/alert/info/plus/refresh）
 * 这样 nav.js 改一次，图标组件同步生效，避免两份定义漂移。
 */
import { icons as navIcons, navGroups } from '@/utils/nav'

/** 从 nav.js 的完整 `<svg …>…</svg>` 字符串中取出内部图形片段（同一份路径数据） */
function innerOf(svg) {
  const m = /^<svg[^>]*>([\s\S]*)<\/svg>$/i.exec(String(svg || '').trim())
  return m ? m[1].trim() : ''
}

/** 路由路径 → 菜单图标完整 svg 字符串（导航数据是唯一事实来源） */
const navItems = {}
for (const group of navGroups) {
  for (const item of group.items || []) navItems[item.path] = item.icon
}
const menu = (path) => innerOf(navItems[path])

/** 注册表：名称 → SVG 内部图形（统一 24×24 viewBox，线性描边） */
const ICON_PATHS = Object.freeze({
  // ===== 复用 utils/nav.js `icons`（顶栏 / 头像区）=====
  search: innerOf(navIcons.search),
  bell: innerOf(navIcons.bell),
  grid: innerOf(navIcons.grid),
  chevron: innerOf(navIcons.chevron),
  chevronRight: innerOf(navIcons.chevronRight),
  collapse: innerOf(navIcons.collapse),
  profile: innerOf(navIcons.profile),
  admin: innerOf(navIcons.admin),
  logout: innerOf(navIcons.logout),
  settings: innerOf(navIcons.settings),
  close: innerOf(navIcons.close),

  // ===== 复用 navGroups 菜单图标（按路由路径取，语义命名）=====
  users: menu('/admin/users'),
  ticket: menu('/tickets'),
  doc: menu('/my-applications'),
  flightPlan: menu('/flight-plan'),
  archive: menu('/flight-archive'),
  charts: menu('/charts'),
  replay: menu('/replay'),
  map: menu('/map'),
  globe: menu('/network'),
  check: menu('/my-registrations'),
  clock: menu('/apply/controller'),
  staff: menu('/apply/staff'),
  megaphone: menu('/admin/announcements'),
  shield: menu('/admin/events'),
  lock: menu('/admin/permissions'),
  edit: menu('/admin/rating'),
  trash: menu('/admin/deletion-approvals'),
  login: menu('/admin/login-logs'),
  userPlus: menu('/admin/register-logs'),

  // ===== nav.js 未覆盖的补充图形（空态 / 提示 / 通用动作）=====
  inbox:
    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/>' +
    '<path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  trophy:
    '<path d="M8 21h8"/><path d="M12 17v4"/>' +
    '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/>' +
    '<path d="M7 6H5a2 2 0 0 0 0 4h2"/><path d="M17 6h2a2 2 0 0 1 0 4h-2"/>',
  alert:
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>' +
    '<line x1="12" y1="16" x2="12.01" y2="16"/>',
  info:
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>' +
    '<line x1="12" y1="8" x2="12.01" y2="8"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  refresh:
    '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>' +
    '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>' +
    '<path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
})

/** 与 nav.js 原始描边粗细保持一致的少量覆盖（其余默认 2） */
const ICON_STROKE = Object.freeze({
  chevron: 2.5,
  chevronRight: 2.5,
  collapse: 2.2,
  close: 2.4,
})
</script>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** 注册表名称；未知名称不渲染任何内容 */
  name: { type: String, default: '' },
  /** 尺寸：数字按 px 处理，字符串原样输出（如 '1.25em'） */
  size: { type: [Number, String], default: 16 },
  /** 描边颜色，默认继承文字颜色 */
  color: { type: String, default: '' },
  /** 描边粗细；不传则使用注册表默认值 */
  strokeWidth: { type: [Number, String], default: 0 },
  /** 纯装饰图标（默认 true）：对屏幕阅读器隐藏 */
  ariaHidden: { type: Boolean, default: true },
  /** 语义图标：提供可读名称后不再 aria-hidden，改为 role="img" */
  label: { type: String, default: '' },
})

const inner = computed(() => ICON_PATHS[props.name] || '')
const pxSize = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
const stroke = computed(() => Number(props.strokeWidth) || ICON_STROKE[props.name] || 2)
const decorative = computed(() => props.ariaHidden && !props.label)
</script>

<template>
  <svg
    v-if="inner"
    class="cw-icon"
    xmlns="http://www.w3.org/2000/svg"
    :width="pxSize"
    :height="pxSize"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color || 'currentColor'"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="decorative ? 'true' : 'false'"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label || name"
    focusable="false"
    v-html="inner"
  />
</template>

<style scoped>
.cw-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: -0.15em;
}
</style>
