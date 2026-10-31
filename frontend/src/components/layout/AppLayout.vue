<template>
  <!-- --sidebar-w 实时同步侧边栏宽度 -->
  <div
    class="app-layout"
    :class="{
      'is-nav-switching': switching,
      'nav-collapsed-layout': isCollapsed && !shellNavTop,
      'nav-layout-topbar': shellNavTop,
      'nav-layout-sidebar': !shellNavTop
    }"
    :style="{ '--sidebar-w': sidebarWVar }"
  >
    <header class="app-header" :class="{ 'is-map': isMapPage }">
      <div class="app-header__inner">
        <button class="app-header__menu-btn" @click="sidebarOpen = !sidebarOpen" aria-label="菜单">
          <span></span><span></span><span></span>
        </button>

        <router-link to="/dashboard" class="app-header__brand">
          <img :src="brandLogo" class="brand-logo" />
          <span class="brand-text">CWFLY</span>
        </router-link>

        <!-- ================= 顶部栏导航（layout = topbar） ================= -->
        <div
          v-if="shellNavTop && !narrowScreen"
          class="topbar-zone"
          :class="{ 'nav-exit-top': switching && leavingLayout === 'topbar' }"
          @mouseenter="cancelTopbarClose"
          @mouseleave="scheduleTopbarClose"
        >
          <nav class="topbar-nav">
            <router-link
              v-for="item in singleNavItems"
              :key="item.label"
              :to="item.path"
              class="topbar-item"
              :class="{ active: isLinkCurrent(item.path) }"
              @mouseenter="prefetchRoute(item.path); closeTopbarPanel()"
              @click="closeTopbarPanel"
            >
              <span class="topbar-item__icon" v-html="item.icon"></span>
              <span>{{ item.label }}</span>
            </router-link>
            <template v-for="group in topbarGroups" :key="group.title">
              <button
                type="button"
                class="topbar-item"
                :class="{ active: topbarActive === group.title }"
                :data-group="group.title"
                :aria-expanded="topbarActive === group.title"
                aria-haspopup="true"
                @mouseenter="openTopbarGroup(group.title, $event)"
                @click="topbarActive !== group.title && openTopbarGroup(group.title, $event)"
              >
                <span class="topbar-item__icon" v-html="group.icon"></span>
                <span>{{ group.title }}</span>
                <span
                  class="topbar-item__arrow"
                  :class="{ expanded: topbarActive === group.title }"
                  v-html="icons.chevronRight"
                ></span>
              </button>
            </template>
          </nav>

          <!-- 下拉面板：left/width 与触发项关联；面板常驻，只对内容做 :key 交叉淡入 -->
          <Transition name="topbar-panel">
            <div
              v-if="topbarActive && topbarGroup"
              class="topbar-panel"
              :style="topbarPanelStyle"
              @mouseenter="cancelTopbarClose"
              @mouseleave="scheduleTopbarClose"
            >
              <div class="topbar-panel__head">
                <span class="topbar-panel__icon" v-html="topbarGroup.icon"></span>
                <span class="topbar-panel__title">{{ topbarGroup.title }}</span>
                <span class="topbar-panel__desc">{{ topbarGroup.desc }}</span>
              </div>
              <Transition name="topbar-content" mode="out-in">
                <div class="topbar-panel__inner" :key="topbarActive">
                  <div v-for="(col, ci) in topbarColumns" :key="ci" class="topbar-panel__col">
                    <router-link
                      v-for="item in col"
                      :key="item.label"
                      :to="item.path"
                      class="topbar-card"
                      :class="{ 'is-current': isLinkCurrent(item.path) }"
                      @mouseenter="prefetchRoute(item.path)"
                      @click="closeTopbarPanel"
                    >
                      <span class="topbar-card__icon" v-html="item.icon"></span>
                      <span class="topbar-card__body">
                        <span class="topbar-card__title">{{ item.label }}</span>
                        <span class="topbar-card__desc">{{ item.desc }}</span>
                      </span>
                    </router-link>
                  </div>
                  <div v-if="!topbarColumns.length" class="topbar-panel__empty">暂无可用的菜单项</div>
                </div>
              </Transition>
            </div>
          </Transition>
        </div>

        <div class="app-header__center">
          <span v-if="!shellNavTop" class="page-title">{{ pageTitle }}</span>
        </div>

        <div class="app-header__actions">
          <time class="utc-clock" :class="{ 'map-shift': isMapPage }" :title="'UTC · ' + utcDate"><span class="utc-label">UTC</span> {{ utcTime }}</time>
          <router-link to="/search" class="header-icon-btn" :class="{ 'map-shift': isMapPage }" title="搜索" v-html="icons.search"></router-link>
          <div class="theme-toggle" :class="{ 'map-shift': isMapPage, 'theme-collapsed': !themeExpanded }" role="group" aria-label="主题切换" @mouseenter="expandTheme" @mouseleave="scheduleThemeCollapse">
            <button v-for="t in themeOptions" :key="t.id" type="button" class="theme-btn" :class="{ active: themeMode === t.id }" @click="themeExpanded ? setTheme(t.id) : expandTheme()" :title="t.label">{{ t.label }}</button>
          </div>
          <div class="map-settings" @mouseenter="openMapSettingsPanel" @mouseleave="closeMapSettingsPanel">
            <Transition name="map-settings">
              <button v-if="isMapPage" class="map-settings-btn" title="地图设置" v-html="icons.settings" @click="openMapSettings"></button>
            </Transition>
            <Transition name="map-settings-panel">
              <div v-if="isMapPage && mapSettingsOpen" class="map-settings-panel">
                <div class="ms-row">
                  <span class="ms-label">气象雷达</span>
                  <button class="ms-switch" :class="{ on: mapSettings.weatherRadar }" type="button" role="switch" :aria-checked="mapSettings.weatherRadar" @click="mapSettings.toggleRadar()">
                    <span class="ms-knob"></span>
                  </button>
                </div>
                <!-- 开发者工具(仅超级管理员可见) -->
                <template v-if="isSuperAdmin">
                  <div class="ms-divider"><span class="ms-divider-line"></span>开发者工具<span class="ms-divider-line"></span></div>
                  <div class="ms-dev-row">
                    <button class="ms-dev-btn" :class="{ active: devTool === 'cursor' }" @click="devCursorLocate">光标定位</button>
                    <button class="ms-dev-btn" :class="{ active: devTool === 'airport-edit' }" @click="devAirportEdit">机场编辑</button>
                  </div>
                </template>
              </div>
            </Transition>
          </div>
          <router-link to="/notifications" class="header-icon-btn" title="通知中心" v-html="icons.bell"></router-link>
          <router-link to="/profile" class="header-avatar" title="个人中心">
            <img :src="avatarUrl" @error="onAvatarError" />
          </router-link>
        </div>
      </div>
    </header>

    <div class="app-body">
      <div class="sidebar-overlay" :class="{ visible: sidebarOpen }" @click="sidebarOpen = false"></div>

      <aside
        v-if="!shellNavTop || narrowScreen"
        class="app-sidebar"
        :class="{
          open: sidebarOpen,
          'is-collapsed': isCollapsed,
          'nav-exit-side': switching && leavingLayout === 'sidebar'
        }"
        ref="sidebarRef"
        :style="{
          width: narrowScreen ? '240px' : (isCollapsed ? '68px' : sidebarWidth),
          left: sidebarOpen ? '0' : undefined
        }"
      >
        <div v-if="!isCollapsed" class="sidebar-resize-handle" @mousedown="startResize"></div>
        <button class="side-close" type="button" title="收起菜单" aria-label="收起菜单" @click="sidebarOpen = false" v-html="icons.close"></button>

        <!-- 收拢/展开按钮（桌面端图标栏模式；移动端抽屉里隐藏） -->
        <div class="sidebar-top">
          <button
            class="nav-collapse-btn"
            type="button"
            :title="isCollapsed ? '展开侧边栏' : '收拢侧边栏'"
            :aria-label="isCollapsed ? '展开侧边栏' : '收拢侧边栏'"
            :aria-expanded="!isCollapsed"
            @click="toggleNavCollapsed()"
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
                  'nav-current': isGroupCurrent(group),
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
                    :class="{ 'nav-current': isSubCurrent(group, item) }"
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
          <button class="sidebar-logout" type="button" title="退出登录" aria-label="退出登录" @click="logout" v-html="icons.logout"></button>
        </div>
      </aside>

      <!-- 收拢态 tooltip：放在侧边栏之外，用视口坐标（backdrop-filter 会改变 fixed 包含块） -->
      <div
        v-if="isCollapsed && !narrowScreen"
        class="side-tip"
        :class="{ show: tip.show }"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
        role="tooltip"
        aria-hidden="true"
      >{{ tip.text }}</div>

      <main class="app-content">
        <div class="app-content__inner">
          <Transition name="route-bar">
            <div v-if="routeLoading" class="route-loading-bar" aria-hidden="true">
              <span class="route-loading-bar__inner"></span>
            </div>
          </Transition>
          <router-view />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useMapSettingsStore } from '@/store/mapSettings'
import { profileApi } from '@/api'
import { themeMode, setThemeMode, applyTheme as applyGlobalTheme, scheduleApplyTheme, isDarkTheme } from '@/utils/theme'
import { icons, navGroups, singleNavItems, accountNavItems } from '@/utils/nav'
import { prefetchRoute, prefetchRoutesOnIdle } from '@/utils/prefetch'
import { confirmDialog } from '@/utils/confirm'
import { navLayout, narrowScreen, isTopLayout, isCollapsed, toggleNavCollapsed, initNavLayout } from '@/utils/navLayout'

// ---------------------------------------------------------------------------
// 依赖注入
// ---------------------------------------------------------------------------
const router = useRouter()
const route = useRoute()
const user = useUserStore()
const mapSettings = useMapSettingsStore()

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
const sidebarOpen = ref(false)
const routeLoading = ref(false)

// 侧边栏拖拽
const sidebarRef = ref(null)
const sidebarWidth = ref('240px')

// 地图等 fixed 定位页面通过 CSS 变量 --sidebar-w 跟随侧边栏宽度
// 移动端侧边栏为抽屉(不占位) → 置 0 让地图全屏
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth <= 860)
function updateViewport() { isMobile.value = window.innerWidth <= 860 }
const sidebarWVar = computed(() => (isMobile.value || isTopLayout.value) ? '0px' : (isCollapsed.value ? '68px' : sidebarWidth.value))

// 品牌 Logo: 深色模式用深色版, 浅色模式用浅色版(与主题联动)
const isDarkNow = ref(isDarkTheme())
const brandLogo = computed(() => isDarkNow.value ? '/logo/logo_dark.png' : '/logo/logo_light.jpg')
// 监听主题切换, 更新 logo
function syncBrandTheme() {
  isDarkNow.value = isDarkTheme()
}

// ---------------------------------------------------------------------------
// 导航布局（侧边栏 ⇄ 顶部栏）/ 收拢图标栏 / 手风琴 / 滑动高亮
// ---------------------------------------------------------------------------
const switching = ref(false)      // 布局切换过渡进行中
const swapped = ref(false)        // 是否已到「换挂载」时刻（内容不可见的那一帧）
const leavingLayout = ref('')     // 正在退出的布局：'sidebar' | 'topbar'
let swapTimers = []

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
  swapTimers.forEach(clearTimeout)
  swapTimers = [
    setTimeout(() => { swapped.value = true }, 190),
    setTimeout(() => {
      switching.value = false
      swapped.value = false
      leavingLayout.value = ''
    }, 520),
  ]
})

watch(narrowScreen, (narrow) => {
  if (!narrow) return
  sidebarOpen.value = false
  switching.value = false
  swapped.value = false
  leavingLayout.value = ''
  swapTimers.forEach(clearTimeout)
})

// --- 手风琴：同一时间只展开一组；再点已展开那组则收起 ---
const expandedGroup = ref('')

// --- 滑动高亮块：单元素 + rAF 逐帧跟随 ---
const sidebarNavRef = ref(null)
const hl = reactive({ x: 0, y: 0, w: 0, h: 0, show: false, ready: false })
const hlStyle = computed(() => ({
  transform: `translate3d(${hl.x}px, ${hl.y}px, 0)`,
  width: `${hl.w}px`,
  height: `${hl.h}px`,
  opacity: hl.show ? 1 : 0,
}))
let rafId = 0

/** 全部可见导航项（用于「当前项」最长前缀匹配） */
const navCandidates = computed(() => {
  const list = []
  for (const item of singleNavItems) list.push({ to: item.path })
  for (const group of navGroups) {
    for (const item of visibleItems(group)) list.push({ to: item.path, group: group.title })
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

const isLinkCurrent = (to) => !current.value?.group && current.value?.to === to
const isSubCurrent = (item, c) => expandedGroup.value === item.title && current.value?.to === c.path
/** 当前项落在被折叠的二级里时，高亮它所属的一级按钮 */
const isGroupCurrent = (item) => current.value?.group === item.title && expandedGroup.value !== item.title
const isGroupActive = (item) => current.value?.group === item.title

function measure() {
  const nav = sidebarNavRef.value
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
    const first = navGroups.find((g) => !g.adminOnly && visibleItems(g).length > 0)
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

// --- 收拢态 tooltip（独立元素 + 视口坐标） ---
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

// --- 顶部栏下拉面板 ---
const topbarActive = ref('')
const topbarRect = ref({ left: 0, width: 480 })
let topbarCloseTimer = null

const topbarGroup = computed(() => navGroups.find((g) => g.title === topbarActive.value) || null)
const topbarGroups = computed(() =>
  navGroups.filter((g) => !g.adminOnly || (user.rating >= 8 && visibleItems(g).length > 0)),
)
const topbarColumns = computed(() => {
  const group = topbarGroup.value
  if (!group) return []
  const items = visibleItems(group)
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

const onEscapeKey = (e) => {
  if (e.key !== 'Escape') return
  closeTopbarPanel()
  hideTip()
}

const onWindowResize = () => {
  closeTopbarPanel()
  measure()
}

watch(shellNavTop, () => {
  nextTick(() => {
    syncOpenGroups()
    startFollow(360)
  })
})
watch(expandedGroup, () => startFollow(480), { flush: 'post' })
watch(() => route.path, () => {
  closeTopbarPanel()
  syncOpenGroups()
  startFollow()
}, { flush: 'post' })
watch(isCollapsed, () => {
  hideTip()
  startFollow(360)
}, { flush: 'post' })
watch(() => sidebarOpen.value, () => {
  hideTip()
  startFollow(320)
})

// ---------------------------------------------------------------------------
// UTC 时钟（Apple 风格）
// ---------------------------------------------------------------------------
const utcTime = ref('')
const utcDate = ref('')
let clockTimer = null

function updateUtcClock() {
  const now = new Date()
  utcTime.value = now.toUTCString().slice(-12, -4)  // HH:MM:SS
  utcDate.value = now.toUTCString().slice(5, 16)     // DD Mon YYYY
}

// ---------------------------------------------------------------------------
// 主题切换: auto(按北京时间 19:00-07:00 深色) / light / dark, 默认 auto, 持久化
// 状态由 utils/theme.js 全局单例管理, 跨组件(AppLayout/OnlineMap/Dashboard)共享
// ---------------------------------------------------------------------------
const themeOptions = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
]
let themeTimer = null
let lastAutoDark = null // auto 边界切换记忆: 仅在深浅翻转时调度 UI 过渡

function setTheme(mode) {
  setThemeMode(mode)
}

// ===== 主题配色折叠：默认只显示当前配色, hover 展开全部, 离开 1s 缩回 =====
const themeExpanded = ref(false)
let themeCollapseTimer = null
/** 展开配色选择（取消缩回定时） */
function expandTheme() {
  if (themeCollapseTimer) { clearTimeout(themeCollapseTimer); themeCollapseTimer = null }
  themeExpanded.value = true
}
/** 鼠标离开 1s 后缩回, 只显示当前配色 */
function scheduleThemeCollapse() {
  if (themeCollapseTimer) clearTimeout(themeCollapseTimer)
  themeCollapseTimer = setTimeout(() => { themeExpanded.value = false }, 1000)
}
/** 当前配色文案（Auto/浅色/深色） */
const currentThemeLabel = computed(() => themeOptions.find(t => t.id === themeMode.value)?.label || 'Auto')

// auto 模式: 每 30 秒检查一次, 在 7:00 / 19:00 边界自动切换配色
// （先背景图时间表渐变, UI 配色延迟 2 秒跟随）
function tickTheme() {
  if (themeMode.value === 'auto') {
    const d = isDarkTheme()
    if (d !== lastAutoDark) {
      lastAutoDark = d
      scheduleApplyTheme()
      syncBrandTheme()
    }
  }
}

onMounted(() => {
  initNavLayout()
  syncOpenGroups()
  nextTick(() => {
    measure()
    // 首帧先把高亮摆好位置，再开启过渡，避免从 0,0 滑进来
    requestAnimationFrame(() => { hl.ready = true })
  })
  prefetchRoutesOnIdle([
    ...singleNavItems.map((i) => i.path),
    ...(navGroups[0]?.items || []).slice(0, 3).map((i) => i.path),
  ])
  document.addEventListener('keydown', onEscapeKey)
  updateUtcClock()
  clockTimer = setInterval(updateUtcClock, 1000)
  window.addEventListener('resize', updateViewport)
  window.addEventListener('resize', onWindowResize)
  // 主题初始化 + auto 定时检查（7:00 / 19:00 边界自动切换配色）
  applyGlobalTheme()
  syncBrandTheme()
  lastAutoDark = isDarkTheme() // 同步当前 auto 深浅状态, 避免初始化后误触发
  themeTimer = setInterval(tickTheme, 30000)
  // 监听主题按钮/手动切换, 更新品牌 Logo
  const themeObserver = new MutationObserver(() => syncBrandTheme())
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  ;(window.__cwThemeObserver = themeObserver)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('resize', onWindowResize)
  if (themeTimer) clearInterval(themeTimer)
  if (themeCollapseTimer) clearTimeout(themeCollapseTimer)
  if (mapSettingsTimer) clearTimeout(mapSettingsTimer)
  if (window.__cwThemeObserver) { window.__cwThemeObserver.disconnect(); window.__cwThemeObserver = null }
  document.removeEventListener('keydown', onEscapeKey)
  cancelAnimationFrame(rafId)
  swapTimers.forEach(clearTimeout)
  if (routeLoadingTimer) clearTimeout(routeLoadingTimer)
  if (topbarCloseTimer) clearTimeout(topbarCloseTimer)
})

// ---------------------------------------------------------------------------
// 路由加载动画
// ---------------------------------------------------------------------------
let routeLoadingTimer = null

/** 导航开始：延迟显示进度条，命中预取/缓存的瞬时导航完全不出现指示器 */
function beginRouteLoading() {
  if (routeLoadingTimer) return
  routeLoadingTimer = setTimeout(() => {
    routeLoadingTimer = null
    routeLoading.value = true
  }, 160)
}

function endRouteLoading() {
  if (routeLoadingTimer) {
    clearTimeout(routeLoadingTimer)
    routeLoadingTimer = null
  }
  routeLoading.value = false
}

router.beforeEach(() => { beginRouteLoading() })
router.afterEach(() => { endRouteLoading() })
router.onError(() => { endRouteLoading() })

// ---------------------------------------------------------------------------
// 头像
// ---------------------------------------------------------------------------
const FALLBACK_AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#fff">' +
  '<circle cx="12" cy="8" r="4"/><path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z"/></svg>'
)

const avatarUrl = ref(user.profile?.avatar?.startsWith('http') ? user.profile.avatar : (user.profile?.avatar || ''))

// 挂载时从服务器同步用户资料（包括 rating、role 等权限数据）
// 这样管理员修改权限后，用户刷新页面即可看到变化，无需重新登录
profileApi.get()
  .then(r => {
    if (r.data) {
      user.setProfile(r.data)
      if (r.data.avatar) avatarUrl.value = r.data.avatar
    }
  })
  .catch(() => {})

function onAvatarError(e) {
  e.target.src = FALLBACK_AVATAR
}

// ---------------------------------------------------------------------------
// 页面标题
// ---------------------------------------------------------------------------
const pageTitle = computed(() => route.meta?.title || '')
// 是否在线地图页（进入时 UTC/搜索/主题左移、设置按钮渐显；离开时反向）
const isMapPage = computed(() => route.path === '/map')

// 地图设置按钮（打开设置面板；hover 齿轮弹出下方设置窗口）
function openMapSettings() {
  mapSettingsOpen.value = true
}

// ===== 开发者工具（仅超级管理员, rating >= 12）=====
const isSuperAdmin = computed(() => user.rating >= 12)
// devTool 存到共享 store, 供 OnlineMap 地图读取
const devTool = computed(() => mapSettings.devTool)
function devCursorLocate() {
  mapSettings.setDevTool('cursor')
  console.log('[DevTools] 光标定位', mapSettings.devTool)
}
function devAirportEdit() {
  mapSettings.setDevTool('airport-edit')
  console.log('[DevTools] 机场编辑', mapSettings.devTool)
}

// ===== 地图设置下拉面板（hover 齿轮弹出, 离开 0.3s 关闭）=====
const mapSettingsOpen = ref(false)
let mapSettingsTimer = null
function openMapSettingsPanel() {
  if (mapSettingsTimer) { clearTimeout(mapSettingsTimer); mapSettingsTimer = null }
  mapSettingsOpen.value = true
}
function closeMapSettingsPanel() {
  if (mapSettingsTimer) clearTimeout(mapSettingsTimer)
  mapSettingsTimer = setTimeout(() => { mapSettingsOpen.value = false }, 300)
}

// ---------------------------------------------------------------------------
// 侧边栏拖拽
// ---------------------------------------------------------------------------
let resizeStartX = 0
let resizeStartW = 0

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

// ---------------------------------------------------------------------------
// 可见子项过滤
// ---------------------------------------------------------------------------
function visibleItems(group) {
  // 管理后台分组：按细分权限 + 超管等级过滤；其他分组：不过滤
  if (group.adminOnly) {
    return group.items.filter(i =>
      (!i.requiredPermission || user.hasPermission(i.requiredPermission)) &&
      (!i.requiredRating || user.rating >= i.requiredRating)
    )
  }
  return group.items.filter(i => !i.minLevel || user.hasRating(i.minLevel))
}

// ---------------------------------------------------------------------------
// 退出
// ---------------------------------------------------------------------------
async function logout() {
  const ok = await confirmDialog({
    title: '退出登录',
    message: '确定要退出当前账号吗？退出后需要重新登录才能继续使用。',
    confirmText: '退出登录',
  })
  if (!ok) return
  user.logout()
  router.push('/')
}

</script>

<style scoped>
/* ============================================================
   AppLayout — 主应用布局
   ============================================================ */

/* ---------- 容器 ---------- */
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ---------- 顶部栏 ---------- */
.app-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 900;
  height: var(--header-h);
  background-color: var(--glass-bg-strong);
  background-image: var(--glass-sheen);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--glass-border-strong);
  box-shadow: var(--glass-highlight), var(--glass-shadow);
}

.app-header__inner {
  height: 100%;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-header__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  flex-shrink: 0;
  /* 品牌链接颜色固定为文字色：避免 Chrome @property 主题过渡时,
     --c-text 短暂无效导致 brand-text 回退继承外层链接的 --c-primary(蓝) 而闪蓝 */
  color: var(--c-text);
}
.app-header__brand:hover { text-decoration: none; }

.brand-logo {
  width: 28px; height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.brand-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--c-text); /* 深色模式自动变白 */
}

.app-header__center { flex: 1; }
.page-title { font-size: 15px; font-weight: 600; color: var(--c-text); }

.app-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.utc-clock {
  font-family: ui-monospace, SF Mono, Menlo, Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--c-text-muted);
  font-variant-numeric: tabular-nums;
  padding: 0 6px;
  user-select: none;
  cursor: default;
  transition: color .15s;
}
.utc-clock:hover { color: var(--c-text); }
.utc-label {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.7;
  text-transform: uppercase;
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px; height: 34px;
  border-radius: 8px;
  color: var(--c-text-secondary);
  text-decoration: none;
  transition: background .15s;
}
.header-icon-btn:hover {
  background: var(--c-bg);
  color: var(--c-text);
  text-decoration: none;
}

/* 主题切换按钮组 */
.theme-toggle {
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 2px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}
.theme-btn {
  flex: 0 0 auto;
  max-width: 80px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: transparent;
  color: var(--c-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  /* 用 max-width 过渡(比 flex-basis 更平滑无瞬移), 标准缓动 */
  transition: max-width .5s cubic-bezier(.4, 0, .2, 1), padding .5s cubic-bezier(.4, 0, .2, 1), opacity .35s ease, background .15s, color .15s;
}
.theme-btn:hover {
  background: rgba(0, 0, 0, .05);
  color: var(--c-text);
}
.theme-btn.active {
  background: var(--c-primary);
  color: #fff;
}
/* 收起态: 去掉容器边框/背景/内边距/间隙, 只显示当前配色按钮本身 */
.theme-toggle.theme-collapsed {
  border: none;
  background: transparent;
  padding: 0;
  gap: 0;
}
/* 收起态: 非当前配色按钮原地淡出(文字不位移), max-width 平滑收缩 */
.theme-toggle.theme-collapsed .theme-btn:not(.active) {
  max-width: 0;
  padding-left: 0;
  padding-right: 0;
  opacity: 0;
  pointer-events: none;
  transition: max-width .5s cubic-bezier(.4, 0, .2, 1), padding .5s cubic-bezier(.4, 0, .2, 1), opacity .3s ease;
}
/* 深色模式: active/hover 柔和化, 避免高亮过于刺眼 */
html[data-theme='dark'] .theme-btn:hover {
  background: rgba(255, 255, 255, .08);
  color: var(--c-text);
}
html[data-theme='dark'] .theme-btn.active {
  background: rgba(10, 132, 255, .28);
  color: rgba(255, 255, 255, .95);
  box-shadow: inset 0 0 0 1px rgba(10, 132, 255, .35);
}

/* ===== 地图页：UTC/搜索/主题 + 设置按钮渐显 ===== */
.map-shift {
  transition: transform .35s ease;
}
/* 微右移 3px：让折叠后的当前配色按钮(Auto)与右侧设置按钮间距约 5px */
.is-map .map-shift {
  transform: translateX(3px);
}
/* 地图设置按钮 */
.map-settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px; height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--c-text-secondary);
  cursor: pointer;
  transition: background .15s, color .15s;
}
.map-settings-btn:hover {
  background: var(--c-bg);
  color: var(--c-text);
}
/* 地图设置齿轮：hover 旋转动画（icons.settings 为 v-html 注入, 需 :deep 命中 svg） */
.map-settings-btn :deep(svg) {
  transition: transform .35s ease;
}
.map-settings-btn:hover :deep(svg) {
  transform: rotate(90deg);
}
/* 地图设置下拉面板（hover 齿轮在下方弹出） */
.map-settings {
  position: relative;
}
.map-settings-panel {
  position: absolute;
  top: calc(100% + 13px);
  right: 0;
  min-width: 170px;
  padding: 10px;
  background: var(--glass-bg-strong, rgba(255,255,255,.92));
  backdrop-filter: blur(14px) saturate(1.4);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  border: 1px solid var(--glass-border, rgba(255,255,255,.2));
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(0,0,0,.18);
  z-index: 3000;
}
.map-settings-panel-enter-active, .map-settings-panel-leave-active {
  transition: opacity .25s ease, transform .25s ease;
}
.map-settings-panel-enter-from, .map-settings-panel-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(.96);
}
.ms-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.ms-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  white-space: nowrap;
}
.ms-switch {
  position: relative;
  width: 42px;
  height: 24px;
  border: none;
  border-radius: 12px;
  background: rgba(0,0,0,.18);
  cursor: pointer;
  transition: background .2s ease;
  padding: 0;
  flex-shrink: 0;
}
.ms-switch.on {
  background: var(--c-primary);
}
.ms-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.3);
  transition: transform .2s ease;
}
.ms-switch.on .ms-knob {
  transform: translateX(18px);
}
/* 开发者工具分隔标题(左右半透明实线 + 中间文字) */
.ms-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 6px;
  padding-top: 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-text-secondary);
  white-space: nowrap;
  letter-spacing: .5px;
}
.ms-divider-line {
  flex: 1;
  height: 1px;
  background: rgba(127, 127, 127, 0.35); /* 半透明实线 */
}
.ms-dev-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ms-dev-btn {
  flex: 1;
  padding: 5px 0;
  border: 1px solid var(--glass-border, rgba(0,0,0,.15));
  border-radius: 7px;
  background: var(--glass-bg, rgba(255,255,255,.6));
  color: var(--c-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
/* hover: 浅色主题淡蓝底+主色字; active: 主色实底白字 */
.ms-dev-btn:hover {
  background: rgba(23, 105, 210, .08);
  color: var(--c-primary);
  border-color: rgba(23, 105, 210, .35);
}
.ms-dev-btn.active {
  background: var(--c-primary);
  color: #fff;
  border-color: var(--c-primary);
}
/* 深色主题: hover 深蓝底亮蓝字; active 高亮蓝 */
html[data-theme='dark'] .ms-dev-btn:hover {
  background: rgba(138, 180, 255, .12);
  color: #8ab4ff;
  border-color: rgba(138, 180, 255, .35);
}
html[data-theme='dark'] .ms-dev-btn.active {
  background: rgba(138, 180, 255, .22);
  color: #8ab4ff;
  border-color: rgba(138, 180, 255, .55);
}
/* 深色模式: 面板深底 */
html[data-theme='dark'] .map-settings-panel {
  background: rgba(28,32,42,.94);
  border-color: rgba(255,255,255,.08);
}
/* 设置按钮进出动画 */
.map-settings-enter-active {
  transition: opacity .3s ease, transform .3s ease;
}
.map-settings-leave-active {
  transition: opacity .25s ease, transform .25s ease;
}
.map-settings-enter-from {
  opacity: 0;
  transform: translateX(8px);
}
.map-settings-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

.header-avatar {
  width: 30px; height: 30px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--c-border-light);
  flex-shrink: 0;
  transition: border-color .15s;
}
.header-avatar:hover { border-color: var(--c-primary); }
.header-avatar img { width: 100%; height: 100%; object-fit: cover; }

.app-header__menu-btn {
  display: none;
  background: none;
  border: none;
  width: 28px; height: 20px;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.app-header__menu-btn span {
  display: block;
  height: 2px;
  background: var(--c-text);
  border-radius: 2px;
}

/* ---------- 主体 ---------- */
.app-body {
  display: flex;
  padding-top: var(--header-h);
  flex: 1;
  width: 100%;
}

/* ---------- 侧边栏遮罩 ---------- */
.sidebar-overlay { display: none; }

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

/* ---------- 内容区 ---------- */
.app-content {
  transition: opacity .24s ease;
  flex: 1;
  padding: 0;
  min-height: calc(100vh - var(--header-h));
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  position: relative;
}
.app-content__inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  width: 100%;
}

/* ---------- 路由加载指示：顶部细进度条（不再用全屏白色遮罩，避免切换页面闪白） ---------- */
.route-loading-bar {
  position: fixed;
  top: var(--header-h);
  left: 0;
  right: 0;
  height: 2px;
  z-index: 1100;
  overflow: hidden;
  pointer-events: none;
}
.route-loading-bar__inner {
  display: block;
  height: 100%;
  width: 38%;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--c-primary), transparent);
  animation: route-bar-run 1.05s ease-in-out infinite;
}
@keyframes route-bar-run {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(320%); }
}
.route-bar-enter-active,
.route-bar-leave-active { transition: opacity .18s ease; }
.route-bar-enter-from,
.route-bar-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .route-loading-bar__inner { animation-duration: 1.6s; }
}

/* ================= 布局切换（三段式，对齐 CTYFLY-WEB） ================= */
.app-sidebar { transition: width .25s ease, padding .25s ease, background-color .3s ease; }
.app-layout.is-nav-switching .app-sidebar { transition: none; }

.app-layout.is-nav-switching .app-content { animation: nav-view-swap .5s ease both; }
@keyframes nav-view-swap {
  0% { opacity: 1; transform: none; }
  34% { opacity: 0; }
  56% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: none; }
}
.app-layout.is-nav-switching .nav-exit-side { animation: nav-exit-side .19s ease-in both; }
@keyframes nav-exit-side { to { opacity: 0; transform: translateX(-26px); } }
.app-layout.is-nav-switching .nav-exit-top { animation: nav-exit-top .19s ease-in both; }
@keyframes nav-exit-top { to { opacity: 0; transform: translateY(-16px); } }
.app-layout.is-nav-switching .app-sidebar:not(.nav-exit-side) { animation: nav-enter-side .3s cubic-bezier(.34, 1.3, .64, 1) both; }
@keyframes nav-enter-side { from { opacity: 0; transform: translateX(-18px); } }
.app-layout.is-nav-switching .topbar-zone:not(.nav-exit-top) { animation: nav-enter-top .3s cubic-bezier(.34, 1.3, .64, 1) both; }
@keyframes nav-enter-top { from { opacity: 0; transform: translateY(-14px); } }

@media (prefers-reduced-motion: reduce) {
  .app-layout.is-nav-switching .app-content,
  .app-layout.is-nav-switching .nav-exit-side,
  .app-layout.is-nav-switching .nav-exit-top { animation: none; }
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

/* ================= 顶部栏导航 ================= */
.topbar-zone {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
  flex-shrink: 0;
  margin-left: 4px;
}
.topbar-nav { display: flex; align-items: center; gap: 2px; height: 100%; }
.topbar-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 9px;
  background: none;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1;
  font-weight: 500;
  white-space: nowrap;
  color: var(--c-text-secondary);
  text-decoration: none;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}
.topbar-item:hover { background: rgba(0, 0, 0, .045); color: var(--c-text); text-decoration: none; }
.topbar-item.active { background: rgba(0, 113, 227, .1); color: var(--c-primary); }
.topbar-item__icon { display: flex; align-items: center; color: currentColor; }
.topbar-item__arrow {
  display: flex;
  align-items: center;
  opacity: .65;
  transition: transform .28s cubic-bezier(.34, 1.45, .64, 1), color .18s ease;
}
.topbar-item__arrow.expanded { transform: rotate(90deg); }

/* 下拉面板：位置/宽度锚定触发项；面板常驻，换项只做内容交叉淡入 */
.topbar-panel {
  position: fixed;
  top: var(--header-h);
  z-index: 1200;
  padding: 14px 16px 16px;
  background: var(--glass-bg-strong);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border-strong);
  border-top: none;
  border-radius: 0 0 16px 16px;
  box-shadow: var(--glass-highlight), var(--glass-shadow-lg);
  transform-origin: top left;
  transition: left .18s ease, width .18s ease;
}
.topbar-panel__head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.topbar-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(0, 113, 227, .1);
  color: var(--c-primary);
  flex: none;
}
.topbar-panel__title { font-size: 14px; font-weight: 600; color: var(--c-text); }
.topbar-panel__desc { font-size: 12.5px; color: var(--c-text-muted, var(--c-text-secondary)); }
.topbar-panel__inner { display: flex; gap: 10px; width: 100%; }
.topbar-panel__col { display: flex; flex-direction: column; gap: 4px; min-width: 200px; flex: 1; }
.topbar-panel__empty { padding: 8px; font-size: 13px; color: var(--c-text-muted, var(--c-text-secondary)); }

.topbar-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  color: var(--c-text-secondary);
  text-decoration: none;
  transition: background-color .15s ease, color .15s ease;
}
.topbar-card:hover { background: rgba(0, 0, 0, .045); color: var(--c-text); text-decoration: none; }
.topbar-card.is-current { background: var(--c-primary, #0071e3); color: #fff; }
.topbar-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(0, 113, 227, .08);
  color: var(--c-primary);
}
.topbar-card.is-current .topbar-card__icon { background: rgba(255, 255, 255, .2); color: #fff; }
.topbar-card__body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.topbar-card__title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topbar-card__desc {
  font-size: 11.5px;
  color: var(--c-text-muted, var(--c-text-secondary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topbar-card.is-current .topbar-card__desc { color: rgba(255, 255, 255, .85); }

html[data-theme='dark'] .topbar-item:hover { background: rgba(255, 255, 255, .06); color: var(--c-text); }
html[data-theme='dark'] .topbar-item.active { background: rgba(10, 132, 255, .22); color: #8ab4ff; }
html[data-theme='dark'] .topbar-card:hover { background: rgba(255, 255, 255, .06); color: var(--c-text); }
html[data-theme='dark'] .topbar-panel { border-color: rgba(255, 255, 255, .14); }
html[data-theme='dark'] .topbar-panel__icon { background: rgba(10, 132, 255, .18); color: #8ab4ff; }
html[data-theme='dark'] .topbar-card__icon { background: rgba(10, 132, 255, .18); color: #8ab4ff; }

/* 面板/内容过渡 */
.topbar-panel-enter-active,
.topbar-panel-leave-active { transition: opacity .16s ease, transform .16s ease; }
.topbar-panel-enter-from,
.topbar-panel-leave-to { opacity: 0; transform: translateY(-6px); }
.topbar-content-enter-active,
.topbar-content-leave-active { transition: opacity .14s ease, transform .14s ease; }
.topbar-content-enter-from { opacity: 0; transform: translateY(-4px); }
.topbar-content-leave-to { opacity: 0; transform: translateY(4px); }

@media (max-width: 860px) {
  .app-header__menu-btn { display: flex; }
  .topbar-zone { display: none; }
  .side-close { display: inline-flex; }
  .sidebar-top { display: none; }
}

/* ================= 窄屏（< 860px）强制侧边栏抽屉 ================= */
@media (max-width: 860px) {
  .app-header__menu-btn { display: flex; }
  .topbar-zone { display: none; }
}

/* ---------- 响应式 ---------- */
</style>
