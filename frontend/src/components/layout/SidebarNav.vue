<template>
  <aside
    class="app-sidebar"
    :class="{
      open: open,
      'is-collapsed': isCollapsed,
      'nav-exit-side': switching && leavingLayout === 'sidebar'
    }"
    :style="{
      width: narrowScreen ? '240px' : (isCollapsed ? '68px' : width),
      left: open ? '0' : undefined
    }"
  >
    <div v-if="!isCollapsed" class="sidebar-resize-handle" @mousedown="$emit('resize-start', $event)"></div>
    <button class="side-close" type="button" title="收起菜单" aria-label="收起菜单" @click="$emit('close')" v-html="icons.close"></button>

    <!-- 收拢/展开按钮（桌面端图标栏模式；移动端抽屉里隐藏） -->
    <div class="sidebar-top">
      <button
        class="nav-collapse-btn"
        type="button"
        :title="isCollapsed ? '展开侧边栏' : '收拢侧边栏'"
        :aria-label="isCollapsed ? '展开侧边栏' : '收拢侧边栏'"
        :aria-expanded="!isCollapsed"
        @click="$emit('toggle-collapse')"
      >
        <span class="nav-collapse-ico" v-html="icons.collapse"></span>
      </button>
    </div>

    <nav class="sidebar-nav" ref="sidebarNavRef" @scroll="hideTip">
      <!-- 全局唯一的选中高亮块：只过渡 transform/width/height/opacity -->
      <span
        class="nav-highlight"
        :class="{ ready: hl.ready }"
        :style="hlStyle"
        aria-hidden="true"
      ></span>

      <router-link
        v-for="item in singleNavItems"
        :key="item.label"
        :to="item.path"
        class="nav-item nav-item--single"
        :class="{ 'nav-current': isLinkCurrent(item.path) }"
        :aria-label="isCollapsed ? item.label : null"
        @mouseenter="prefetchRoute(item.path); showTip($event, item.label)"
        @mouseleave="hideTip"
        @focus="prefetchRoute(item.path); showTip($event, item.label)"
        @blur="hideTip"
      >
        <span class="nav-icon" v-html="item.icon"></span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>

      <template v-for="group in navGroups" :key="group.title">
        <div class="nav-group" v-if="!group.adminOnly || (user.rating >= 8 && visibleItems(group).length > 0)">
          <button
            type="button"
            class="nav-item nav-group-title"
            :class="{
              'nav-current': isGroupCurrent(group, expandedGroup),
              'group-active': isGroupActive(group),
              'nav-group-title--open': expandedGroup === group.title
            }"
            :aria-expanded="expandedGroup === group.title"
            aria-haspopup="true"
            :aria-label="isCollapsed ? group.title : null"
            :data-group="group.title"
            @click="onGroupToggle(group)"
            @mouseenter="showTip($event, group.title)"
            @mouseleave="hideTip"
            @focus="showTip($event, group.title)"
            @blur="hideTip"
          >
            <span class="nav-group-icon" v-html="group.icon"></span>
            <span class="nav-group-label">{{ group.title }}</span>
            <span
              class="nav-group-arrow"
              :class="{ expanded: expandedGroup === group.title }"
              v-html="icons.chevronRight"
            ></span>
          </button>
          <div class="nav-group-items" :class="{ open: expandedGroup === group.title }">
            <div class="nav-group-items-inner">
              <router-link
                v-for="(item, idx) in visibleItems(group)"
                :key="item.label"
                :to="item.path"
                class="nav-item nav-item--sub"
                :class="{ 'nav-current': isSubCurrent(group, item, expandedGroup) }"
                :style="{ '--i': idx }"
                @mouseenter="prefetchRoute(item.path)"
                @focus="prefetchRoute(item.path)"
              >
                <span class="nav-item-icon" v-html="item.icon"></span>
                <span class="nav-item-label">{{ item.label }}</span>
              </router-link>
            </div>
          </div>
        </div>
      </template>

      <!-- 账号分组：个人中心独立于主导航 -->
      <div class="sidebar-section-label">账号</div>
      <router-link
        v-for="item in accountNavItems"
        :key="item.label"
        :to="item.path"
        class="nav-item nav-item--single"
        :class="{ 'nav-current': isLinkCurrent(item.path) }"
        :aria-label="isCollapsed ? item.label : null"
        @mouseenter="prefetchRoute(item.path); showTip($event, item.label)"
        @mouseleave="hideTip"
        @focus="prefetchRoute(item.path); showTip($event, item.label)"
        @blur="hideTip"
      >
        <span class="nav-icon" v-html="item.icon"></span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- 底部账号区（原 UserFooter：与侧栏的收拢态/tooltip 强耦合，故并入本组件） -->
    <div class="sidebar-footer">
      <router-link
        to="/profile"
        class="sidebar-user"
        :aria-label="isCollapsed ? '个人中心' : null"
        @mouseenter="showTip($event, '个人中心')"
        @mouseleave="hideTip"
        @focus="showTip($event, '个人中心')"
        @blur="hideTip"
      >
        <div class="sidebar-user-avatar"><img :src="avatarUrl" @error="onAvatarError" /></div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">{{ user.username }}</div>
          <div class="sidebar-user-cid">CID {{ user.cid }}</div>
        </div>
      </router-link>
      <button class="sidebar-logout" type="button" title="退出登录" aria-label="退出登录" @click="$emit('logout')" v-html="icons.logout"></button>
    </div>
  </aside>

  <!-- 收拢态 tooltip：必须与 <aside> 同级（backdrop-filter 会改变 fixed 包含块），用视口坐标 -->
  <div
    v-if="isCollapsed && !narrowScreen"
    class="side-tip"
    :class="{ show: tip.show }"
    :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
    role="tooltip"
    aria-hidden="true"
  >{{ tip.text }}</div>
</template>

<script setup>
/**
 * SidebarNav — 侧边栏（导航 + 账号区 + 底部用户卡，含收拢图标栏 / 手风琴 / rAF 滑动高亮 / 收拢态 tooltip）
 *
 * 拆分自 components/layout/AppLayout.vue。底部用户卡（原计划独立 UserFooter.vue）并入本组件：
 * 收拢态隐藏、tooltip 坐标、退出按钮都与侧栏布局强耦合，独立后需要跨组件回传 tooltip 状态，反而更脆。
 *
 * @typedef {Object} SidebarNavProps
 * @property {boolean} open           移动端抽屉是否打开
 * @property {string}  width          桌面端侧边栏宽度（拖拽值，如 '240px'）
 * @property {boolean} shellNavTop    当前实际挂载的是顶部栏布局（布局切换过渡期会短暂为旧值）
 * @property {boolean} switching      布局切换过渡进行中
 * @property {string}  leavingLayout  正在退出的布局：'sidebar' | 'topbar' | ''
 * @property {string}  avatarUrl      头像地址
 */
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { navGroups, singleNavItems, accountNavItems, icons } from '@/utils/nav'
import { prefetchRoute } from '@/utils/prefetch'
import { isCollapsed, narrowScreen } from '@/utils/navLayout'
import {
  FALLBACK_AVATAR,
  useNavAccordion,
  useNavCurrent,
  useNavHighlight,
  useNavTooltip,
  useNavVisibleItems,
} from '@/composables/useAppNav'

const props = defineProps({
  /** 移动端抽屉是否打开 */
  open: { type: Boolean, default: false },
  /** 桌面端侧边栏宽度（拖拽值） */
  width: { type: String, default: '240px' },
  /** 当前实际挂载的是顶部栏布局 */
  shellNavTop: { type: Boolean, default: false },
  /** 布局切换过渡进行中 */
  switching: { type: Boolean, default: false },
  /** 正在退出的布局：'sidebar' | 'topbar' | '' */
  leavingLayout: { type: String, default: '' },
  /** 头像地址 */
  avatarUrl: { type: String, default: '' },
})

defineEmits([
  /** 收起移动端抽屉（关闭按钮） */
  'close',
  /** 请求切换收拢/展开（持久化由父组件调用 navLayout 统一处理） */
  'toggle-collapse',
  /** 请求开始侧边栏宽度拖拽，payload: MouseEvent */
  'resize-start',
  /** 请求退出登录（二次确认由父组件负责） */
  'logout',
])

const route = useRoute()
const user = useUserStore()
const visibleItems = useNavVisibleItems()
const { isLinkCurrent, isSubCurrent, isGroupCurrent, isGroupActive } = useNavCurrent()
const { expandedGroup, syncOpenGroups, onGroupToggle } = useNavAccordion()
const { tip, showTip, hideTip } = useNavTooltip()

const sidebarNavRef = ref(null)
const { hl, hlStyle, measure, startFollow, markReady } = useNavHighlight(sidebarNavRef)

function onAvatarError(e) {
  e.target.src = FALLBACK_AVATAR
}

// ---------------------------------------------------------------------------
// 高亮跟随：展开/收拢/抽屉/路由/布局切换时目标项在持续位移
// ---------------------------------------------------------------------------
watch(
  () => route.path,
  () => {
    syncOpenGroups()
    startFollow()
  },
  { flush: 'post' },
)
watch(expandedGroup, () => startFollow(480), { flush: 'post' })
watch(
  isCollapsed,
  () => {
    hideTip()
    startFollow(360)
  },
  { flush: 'post' },
)
watch(
  () => props.open,
  () => {
    hideTip()
    startFollow(320)
  },
)
watch(
  () => props.shellNavTop,
  () =>
    nextTick(() => {
      syncOpenGroups()
      startFollow(360)
    }),
)

onMounted(() => {
  syncOpenGroups()
  nextTick(() => {
    measure()
    markReady()
  })
})

// 父组件（AppLayout）统一处理全局快捷键 / 窗口 resize，通过 expose 驱动
defineExpose({
  /** 收起收拢态 tooltip（Escape 时由父组件调用） */
  hideTip,
  /** 重新测量高亮块位置（窗口 resize 时由父组件调用） */
  refreshHighlight: measure,
})
</script>

<style scoped>
/* ============================================================
   SidebarNav — 侧边栏（拆分自 AppLayout 的 aside 段样式）
   ============================================================ */

/* ---------- 侧边栏 ---------- */
.app-sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-h));
  position: sticky;
  top: var(--header-h);
  z-index: 100;
  isolation: isolate;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border-right: 1px solid var(--glass-border-strong);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, .08);
}
.app-sidebar::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .12);
  pointer-events: none;
  z-index: -1;
  border-radius: inherit;
}

/* 拖拽手柄 */
.sidebar-resize-handle {
  position: absolute;
  right: -3px;
  top: 0; bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background .15s;
}
.sidebar-resize-handle:hover,
.sidebar-resize-handle:active { background: var(--c-primary); }

@media (max-width: 860px) {
  .sidebar-resize-handle { display: none; }
  .app-sidebar { width: 240px !important; position: fixed; top: var(--header-h); z-index: 901; height: calc(100vh - var(--header-h)); left: -260px; transition: left .3s ease; }
  .app-sidebar.open { left: 0; }
}

/* ---------- 导航（对齐 CTYFLY-WEB 交互；保留 40px 行高 / 12px 圆角 / 4px 间距） ---------- */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px 10px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-group { display: flex; flex-direction: column; }

/* 一级链接 / 分组标题（<button>）共用一套排版 */
.nav-item,
.nav-group-title {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
  color: var(--c-text-secondary);
  text-decoration: none;
  cursor: pointer;
  transition: background-color .16s ease, color .16s ease;
}
.nav-item:hover,
.nav-group-title:hover {
  background: rgba(0, 0, 0, .045);
  color: var(--c-text);
  text-decoration: none;
}

/* 图标：18px 居中，与文字间距由 gap:12px 提供 */
.nav-group-icon,
.nav-item-icon,
.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--c-text-secondary);
}
.nav-group-label { flex: 1; min-width: 0; }
.nav-label,
.nav-item-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 右侧折叠箭头：靠最右，90° 顺时针（右箭头 → 下箭头） */
.nav-group-arrow {
  display: flex;
  align-items: center;
  margin-left: auto;
  opacity: .65;
  color: var(--c-text-muted, var(--c-text-secondary));
  transition: transform .32s cubic-bezier(.34, 1.45, .64, 1), color .18s ease, opacity .18s ease;
}
.nav-group-arrow.expanded { transform: rotate(90deg); }
.nav-group-title--open { color: var(--c-primary); }
.nav-group-title--open .nav-group-icon { color: var(--c-primary); }
.nav-group-title--open .nav-group-arrow { opacity: 1; color: var(--c-primary); }
.nav-group-title.group-active:not(.nav-group-title--open) { color: var(--c-text); }

/* 二级：grid-rows 平滑展开 + 引导竖线 + 子项依次错峰弹入 */
.nav-group-items {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .32s cubic-bezier(.4, 0, .2, 1);
}
.nav-group-items.open { grid-template-rows: 1fr; }
.nav-group-items-inner {
  overflow: hidden;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
}
.nav-group-items-inner::before {
  content: '';
  position: absolute;
  left: 27px;
  top: 8px;
  bottom: 8px;
  width: 1px;
  background: var(--c-border-light);
  transform: scaleY(0);
  transform-origin: top;
  transition: transform .3s cubic-bezier(.4, 0, .2, 1) .05s;
}
.nav-group-items.open .nav-group-items-inner::before { transform: scaleY(1); }

.nav-item--sub {
  padding-left: 42px;
  font-size: 13px;
}
.nav-item--sub .nav-item-icon { width: 16px; height: 16px; opacity: .9; }

@keyframes navChildIn {
  from { opacity: 0; transform: translateY(-6px) scale(.96); }
  to { opacity: 1; transform: none; }
}
.nav-group-items.open .nav-item--sub {
  animation: navChildIn .34s cubic-bezier(.34, 1.56, .64, 1) both;
  animation-delay: calc(var(--i, 0) * 45ms);
}

/* 滑动高亮块：唯一选中底；ready 前只过渡透明度，避免首帧从 (0,0) 滑入 */
.nav-highlight {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  border-radius: 12px;
  background: var(--c-primary, #0071e3);
  box-shadow: 0 6px 16px rgba(0, 113, 227, .28);
  pointer-events: none;
  opacity: 0;
  z-index: 0;
  transition: opacity .18s ease;
  will-change: transform, width, height;
}
.nav-highlight.ready {
  transition:
    transform .42s cubic-bezier(.34, 1.56, .64, 1),
    width .42s cubic-bezier(.34, 1.56, .64, 1),
    height .42s cubic-bezier(.34, 1.56, .64, 1),
    opacity .18s ease;
}

/* 当前项：文字/图标反白，底色由高亮块承担 */
.sidebar-nav .nav-current,
.sidebar-nav .nav-current:hover { background: transparent; color: #fff; }
.sidebar-nav .nav-current .nav-icon,
.sidebar-nav .nav-current .nav-group-icon,
.sidebar-nav .nav-current .nav-item-icon { color: #fff; }
.sidebar-nav .nav-current .nav-group-arrow { color: #fff; opacity: 1; }

/* 深色模式 */
html[data-theme='dark'] .nav-item:hover,
html[data-theme='dark'] .nav-group-title:hover {
  background: rgba(255, 255, 255, .06);
  color: var(--c-text);
}
html[data-theme='dark'] .nav-highlight { background: #0a84ff; box-shadow: 0 6px 18px rgba(10, 132, 255, .35); }
html[data-theme='dark'] .nav-group-title--open { color: #8ab4ff; }
html[data-theme='dark'] .nav-group-title--open .nav-group-icon,
html[data-theme='dark'] .nav-group-title--open .nav-group-arrow { color: #8ab4ff; }
html[data-theme='dark'] .nav-group-items-inner::before { background: rgba(255, 255, 255, .12); }
html[data-theme='dark'] .nav-group-title.group-active:not(.nav-group-title--open) { color: var(--c-text); }

@media (prefers-reduced-motion: reduce) {
  .nav-highlight.ready { transition: opacity .18s ease; }
  .nav-group-items.open .nav-item--sub { animation: none; }
  .nav-group-items-inner::before { transition: none; }
  .nav-group-items { transition: none; }
}

/* ---------- 底部账号区（账号分组标题 + 用户卡 + 退出按钮） ---------- */
.sidebar-section-label {
  padding: 12px 12px 5px;
  margin-top: 6px;
  border-top: 1px solid var(--c-border-light);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  line-height: 1.4;
  color: var(--c-text-muted, var(--c-text-secondary));
  opacity: .85;
  user-select: none;
}

.sidebar-footer {
  border-top: 1px solid var(--glass-border);
  padding: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-user {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 6px 10px;
  border-radius: 12px;
  text-decoration: none;
  color: var(--c-text);
  transition: background-color .16s ease;
}
.sidebar-user:hover { background: rgba(0, 0, 0, .045); text-decoration: none; }

.sidebar-user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--c-primary);
  flex-shrink: 0;
}
.sidebar-user-avatar img { width: 100%; height: 100%; object-fit: cover; }

.sidebar-user-info { flex: 1; min-width: 0; }
.sidebar-user-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-user-cid { font-size: 11.5px; font-weight: 500; color: var(--c-text-secondary); }

.sidebar-logout {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--c-text-secondary);
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}
.sidebar-logout:hover { background: rgba(255, 59, 48, .1); color: var(--c-danger, #ff3b30); }

html[data-theme='dark'] .sidebar-user:hover { background: rgba(255, 255, 255, .06); }

/* ================= 布局切换（侧边栏侧） ================= */
.app-sidebar { transition: width .25s ease, padding .25s ease, background-color .3s ease; }
.app-layout.is-nav-switching .app-sidebar { transition: none; }
.app-layout.is-nav-switching .nav-exit-side { animation: nav-exit-side .19s ease-in both; }
@keyframes nav-exit-side { to { opacity: 0; transform: translateX(-26px); } }
.app-layout.is-nav-switching .app-sidebar:not(.nav-exit-side) { animation: nav-enter-side .3s cubic-bezier(.34, 1.3, .64, 1) both; }
@keyframes nav-enter-side { from { opacity: 0; transform: translateX(-18px); } }

@media (prefers-reduced-motion: reduce) {
  .app-layout.is-nav-switching .nav-exit-side { animation: none; }
}

/* ================= 侧边栏收拢图标栏 ================= */
.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 10px 2px;
  flex-shrink: 0;
}
.nav-collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--c-text-secondary);
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}
.nav-collapse-btn:hover { background: rgba(0, 0, 0, .05); color: var(--c-text); }
.nav-collapse-ico { display: flex; transform: rotate(90deg); transition: transform .25s ease; }
.app-sidebar.is-collapsed .nav-collapse-ico { transform: rotate(-90deg); }

.app-sidebar.is-collapsed { width: 68px !important; padding-left: 8px; padding-right: 8px; }
.app-sidebar.is-collapsed .sidebar-top { justify-content: center; padding: 6px 0 2px; }
.app-sidebar.is-collapsed .nav-label,
.app-sidebar.is-collapsed .nav-group-label,
.app-sidebar.is-collapsed .nav-item-label,
.app-sidebar.is-collapsed .nav-group-arrow,
.app-sidebar.is-collapsed .sidebar-user-info,
.app-sidebar.is-collapsed .sidebar-section-label,
.app-sidebar.is-collapsed .nav-group-items,
.app-sidebar.is-collapsed .sidebar-resize-handle { display: none; }
.app-sidebar.is-collapsed .nav-item,
.app-sidebar.is-collapsed .nav-group-title { justify-content: center; gap: 0; padding-left: 0; padding-right: 0; }
.app-sidebar.is-collapsed .sidebar-user { justify-content: center; padding: 6px 0; }
.app-sidebar.is-collapsed .sidebar-footer { justify-content: center; }
.app-sidebar.is-collapsed .sidebar-nav { padding-left: 6px; padding-right: 6px; }

html[data-theme='dark'] .nav-collapse-btn:hover { background: rgba(255, 255, 255, .08); }

/* 收拢态 tooltip：独立元素 + 视口坐标（backdrop-filter 会改变 fixed 包含块） */
.side-tip {
  position: fixed;
  z-index: 320;
  padding: 7px 11px;
  border-radius: 9px;
  background: rgba(28, 28, 30, .94);
  color: #fff;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-50%) translateX(-4px);
  transition: opacity .14s ease, transform .14s ease;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .18);
}
.side-tip.show { opacity: 1; transform: translateY(-50%) translateX(0); }
.side-tip::before {
  content: '';
  position: absolute;
  left: -3px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: inherit;
  transform: translateY(-50%) rotate(45deg);
}

/* 移动端抽屉关闭按钮（桌面常驻侧栏不显示） */
.side-close {
  display: none;
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--c-text-secondary);
  cursor: pointer;
  z-index: 3;
}
.side-close:hover { background: var(--c-primary, #0071e3); color: #fff; }

@media (max-width: 860px) {
  .side-close { display: inline-flex; }
  .sidebar-top { display: none; }
}
</style>
