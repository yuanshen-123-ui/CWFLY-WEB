<template>
  <!-- --sidebar-w 实时同步侧边栏宽度 -->
  <div
    class="app-layout"
    :class="{
      'is-nav-switching': navSwitching,
      'nav-layout-topbar': displayedLayout === 'topbar' && !narrowScreen,
      'nav-layout-sidebar': displayedLayout === 'sidebar' || narrowScreen
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
          v-if="displayedLayout === 'topbar' && !narrowScreen"
          class="topbar-zone"
          @mouseenter="cancelTopbarClose"
          @mouseleave="scheduleTopbarClose"
        >
          <nav class="topbar-nav">
            <router-link
              to="/dashboard"
              class="topbar-item"
              :class="{ active: route.path === '/dashboard' }"
              @mouseenter="closeTopbarPanel"
            >
              <span class="topbar-item__icon" v-html="icons.grid"></span>
              <span>仪表盘</span>
            </router-link>
            <template v-for="group in topbarGroups" :key="group.title">
              <button
                type="button"
                class="topbar-item"
                :data-group="group.title"
                :class="{ active: topbarActive === group.title }"
                @mouseenter="openTopbarGroup(group.title, $event)"
                @click="openTopbarGroup(group.title, $event)"
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

          <!-- 通栏下拉面板：left/width 与触发项关联；内容用 :key 交叉淡入淡出 -->
          <Transition name="topbar-panel">
            <div
              v-if="topbarActive"
              class="topbar-panel"
              :style="topbarPanelStyle"
              @mouseenter="cancelTopbarClose"
              @mouseleave="scheduleTopbarClose"
            >
              <Transition name="topbar-content" mode="out-in">
                <div class="topbar-panel__inner" :key="topbarActive">
                  <div v-for="(col, ci) in topbarColumns" :key="ci" class="topbar-panel__col">
                    <component
                      :is="item.external ? 'a' : 'router-link'"
                      v-for="item in col"
                      :key="item.label"
                      v-bind="item.external ? { href: item.path, target: '_blank', rel: 'noopener' } : { to: item.path }"
                      class="topbar-link"
                      :class="{ 'topbar-link--active': !item.external && route.path === item.path }"
                      @click="closeTopbarPanel"
                    >
                      <span class="topbar-link__icon" v-html="item.icon"></span>
                      <span>{{ item.label }}</span>
                    </component>
                  </div>
                  <div v-if="!topbarColumns.length" class="topbar-panel__empty">暂无可用的菜单项</div>
                </div>
              </Transition>
            </div>
          </Transition>
        </div>

        <div class="app-header__center">
          <span v-if="displayedLayout !== 'topbar' || narrowScreen" class="page-title">{{ pageTitle }}</span>
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
        v-if="displayedLayout === 'sidebar' || narrowScreen"
        class="app-sidebar"
        :class="{ open: sidebarOpen }"
        ref="sidebarRef"
        :style="{ width: narrowScreen ? '240px' : sidebarWidth, left: sidebarOpen ? '0' : undefined }"
      >
        <div class="sidebar-resize-handle" @mousedown="startResize"></div>

        <nav class="sidebar-nav" ref="sidebarNavRef">
          <!-- 全局唯一的选中高亮块：只用 transform/width/height 平滑移动，禁止 transition: all -->
          <span class="nav-highlight" :style="navHighlightStyle" aria-hidden="true"></span>

          <router-link
            to="/dashboard"
            class="nav-item nav-item--single"
            :class="{ 'nav-item--current': route.path === '/dashboard' }"
            :ref="(el) => setNavItemRef(el, '/dashboard')"
            @click="onNavClick"
          >
            <span class="nav-icon" v-html="icons.grid"></span>
            <span class="nav-label">仪表盘</span>
          </router-link>

          <template v-for="group in navGroups" :key="group.title">
            <div class="nav-group" v-if="!group.adminOnly || (user.rating >= 8 && visibleItems(group).length > 0)">
              <div
                class="nav-group-title"
                :data-group="group.title"
                :class="{ 'nav-group-title--open': expandedGroup === group.title }"
                @click="toggleGroup(group.title)"
              >
                <span class="nav-group-icon" v-html="group.icon"></span>
                <span class="nav-group-label">{{ group.title }}</span>
                <span
                  class="nav-group-arrow"
                  :class="{ expanded: expandedGroup === group.title }"
                  v-html="icons.chevronRight"
                ></span>
              </div>
              <div
                class="nav-group-items"
                :class="{ 'nav-group-items--collapsed': expandedGroup !== group.title }"
              >
                <div class="nav-group-items-inner">
                  <component
                    :is="item.external ? 'a' : 'router-link'"
                    v-for="(item, idx) in visibleItems(group)"
                    :key="item.label"
                    v-bind="item.external ? { href: item.path, target: '_blank', rel: 'noopener' } : { to: item.path }"
                    class="nav-item"
                    :class="{ 'nav-item--current': !item.external && route.path === item.path }"
                    :style="{ '--i': idx }"
                    :ref="(el) => setNavItemRef(el, item.path)"
                    @click="onNavClick"
                  >
                    <span class="nav-item-icon" v-html="item.icon"></span>
                    <span class="nav-item-label">{{ item.label }}</span>
                  </component>
                </div>
              </div>
            </div>
          </template>
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-user" @click="showUserMenu = !showUserMenu">
            <div class="sidebar-user-avatar"><img :src="avatarUrl" @error="onAvatarError" /></div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">{{ user.username }}</div>
              <div class="sidebar-user-cid">CID {{ user.cid }}</div>
            </div>
            <span class="sidebar-user-arrow" :class="{ expanded: showUserMenu }" v-html="icons.chevron"></span>
          </div>
          <div class="sidebar-user-menu" v-show="showUserMenu">
            <router-link to="/profile" class="user-menu-item" @click="sidebarOpen = false; showUserMenu = false" v-html="icons.profile + ' 个人中心'"></router-link>
            <router-link v-if="user.rating >= 8 && user.permissions && user.permissions.length > 0" to="/admin" class="user-menu-item" @click="sidebarOpen = false; showUserMenu = false" v-html="icons.admin + ' 管理员中心'"></router-link>
            <div class="user-menu-divider"></div>
            <button class="user-menu-item user-menu-item--danger" @click="logout" v-html="icons.logout + ' 退出登录'"></button>
          </div>
        </div>
      </aside>

      <main class="app-content">
        <div class="app-content__inner">
          <div v-if="routeLoading" class="route-loading">
            <div class="spinner"></div>
            <span>加载中...</span>
          </div>
          <router-view />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useMapSettingsStore } from '@/store/mapSettings'
import { profileApi } from '@/api'
import { themeMode, setThemeMode, applyTheme as applyGlobalTheme, scheduleApplyTheme, isDarkTheme } from '@/utils/theme'
import { navLayout, narrowScreen, effectiveNavLayout, setNavLayout, initNavLayout } from '@/utils/navLayout'

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
const showUserMenu = ref(false)
const routeLoading = ref(false)

// 侧边栏拖拽
const sidebarRef = ref(null)
const sidebarWidth = ref('240px')

// 地图等 fixed 定位页面通过 CSS 变量 --sidebar-w 跟随侧边栏宽度
// 移动端侧边栏为抽屉(不占位) → 置 0 让地图全屏
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth <= 860)
function updateViewport() { isMobile.value = window.innerWidth <= 860 }
const sidebarWVar = computed(() => (isMobile.value || displayedLayout.value === 'topbar') ? '0px' : sidebarWidth.value)

// 品牌 Logo: 深色模式用深色版, 浅色模式用浅色版(与主题联动)
const isDarkNow = ref(isDarkTheme())
const brandLogo = computed(() => isDarkNow.value ? '/logo/logo_dark.png' : '/logo/logo_light.jpg')
// 监听主题切换, 更新 logo
function syncBrandTheme() {
  isDarkNow.value = isDarkTheme()
}

// ---------------------------------------------------------------------------
// 导航布局（侧边栏 ⇄ 顶部栏）/ 手风琴 / 滑动高亮
// ---------------------------------------------------------------------------
const displayedLayout = ref('sidebar')   // 实际挂载的布局（切换过渡的中段才替换）
const navSwitching = ref(false)          // 三段式过渡进行中
let layoutSwitchSeq = 0                  // 快速连点收敛用序号
const expandedGroup = ref('')            // 手风琴：同一时间只展开一个分组

// --- 侧边栏滑动高亮 ---
const sidebarNavRef = ref(null)
const navHighlightStyle = ref({ opacity: 0 })
const navItemEls = new Map()

function setNavItemRef(el, key) {
  const dom = el && el.$el ? el.$el : el
  if (dom) navItemEls.set(key, dom)
  else navItemEls.delete(key)
}

const activeNavKey = computed(() => {
  const path = route.path
  if (path === '/dashboard') return '/dashboard'
  for (const group of navGroups) {
    for (const item of visibleItems(group)) {
      if (!item.external && (path === item.path || path.startsWith(item.path + '/'))) return item.path
    }
  }
  return ''
})

function updateNavHighlight() {
  const nav = sidebarNavRef.value
  if (!nav || displayedLayout.value !== 'sidebar') {
    navHighlightStyle.value = { opacity: 0 }
    return
  }
  const key = activeNavKey.value
  const el = key ? navItemEls.get(key) : null
  if (!el) {
    navHighlightStyle.value = { opacity: 0 }
    return
  }
  // 目标项在收起的分组里时先隐藏，等手风琴展开动画结束再量
  const group = navGroups.find((g) => g.items.some((i) => i.path === key))
  if (group && expandedGroup.value !== group.title) {
    navHighlightStyle.value = { opacity: 0 }
    return
  }
  // 单元素高亮：直接改 transform/width/height，浏览器会从当前位置继续过渡（不重置起点）
  navHighlightStyle.value = {
    opacity: 1,
    width: el.offsetWidth + 'px',
    height: el.offsetHeight + 'px',
    transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`,
  }
}

function syncActiveGroup() {
  const key = activeNavKey.value
  const group = navGroups.find((g) => g.items.some((i) => i.path === key))
  if (group) {
    expandedGroup.value = group.title
    return
  }
  // 当前路由不在任何分组（如仪表盘）：默认只展开第一个可分组
  if (!expandedGroup.value) {
    const first = navGroups.find((g) => !g.adminOnly && visibleItems(g).length > 0)
    if (first) expandedGroup.value = first.title
  }
}

let highlightSyncTimer = null
function scheduleHighlightSync(delay = 520) {
  if (highlightSyncTimer) clearTimeout(highlightSyncTimer)
  highlightSyncTimer = setTimeout(() => {
    highlightSyncTimer = null
    updateNavHighlight()
  }, delay)
}

// --- 手风琴：展开当前组，收起其余组（保持单组展开） ---
function toggleGroup(title) {
  expandedGroup.value = expandedGroup.value === title ? '' : title
  nextTick(() => {
    updateNavHighlight()
    scheduleHighlightSync(460)
  })
}

function onNavClick() {
  if (narrowScreen.value) sidebarOpen.value = false
}

// --- 顶部栏下拉面板 ---
const topbarActive = ref('')
const topbarRect = ref({ left: 0, width: 360 })
let topbarCloseTimer = null

const topbarGroups = computed(() =>
  navGroups.filter((g) => !g.adminOnly || (user.rating >= 8 && visibleItems(g).length > 0)),
)

const topbarColumns = computed(() => {
  const group = navGroups.find((g) => g.title === topbarActive.value)
  if (!group) return []
  const items = visibleItems(group)
  if (items.length <= 3) return [items]
  // 均衡分列：4 个以内一列，更多则按 ≤4/列 均分（如 5 → 3+2，7 → 4+3）
  const colCount = Math.ceil(items.length / 4)
  const per = Math.ceil(items.length / colCount)
  const cols = []
  for (let i = 0; i < items.length; i += per) cols.push(items.slice(i, i + per))
  return cols
})

const topbarPanelStyle = computed(() => ({
  left: Math.round(topbarRect.value.left) + 'px',
  width: Math.round(topbarRect.value.width) + 'px',
}))

function openTopbarGroup(title, event) {
  if (narrowScreen.value) return
  cancelTopbarClose()
  const el = event?.currentTarget || event?.target
  if (topbarActive.value === title) return
  topbarActive.value = title
  if (el && el.getBoundingClientRect) {
    const rect = el.getBoundingClientRect()
    const width = Math.max(Math.round(rect.width) + 80, 360)
    const maxLeft = window.innerWidth - width - 12
    topbarRect.value = {
      left: Math.max(12, Math.min(Math.round(rect.left), Math.max(12, maxLeft))),
      width,
    }
  }
}

function closeTopbarPanel() {
  topbarActive.value = ''
}

function scheduleTopbarClose() {
  if (topbarCloseTimer) clearTimeout(topbarCloseTimer)
  topbarCloseTimer = setTimeout(closeTopbarPanel, 160)
}

function cancelTopbarClose() {
  if (topbarCloseTimer) {
    clearTimeout(topbarCloseTimer)
    topbarCloseTimer = null
  }
}

// --- 布局切换：淡出 → 替换 DOM 布局 → 淡入（避免 margin/宽度突变导致闪烁） ---
function runLayoutSwap(target) {
  if (target === displayedLayout.value) return
  const seq = ++layoutSwitchSeq
  navSwitching.value = true
  closeTopbarPanel()
  setTimeout(() => {
    if (seq !== layoutSwitchSeq) return
    displayedLayout.value = target
    nextTick(() => {
      syncActiveGroup()
      updateNavHighlight()
      requestAnimationFrame(() => {
        if (seq !== layoutSwitchSeq) return
        navSwitching.value = false
      })
    })
  }, 190)
}

watch(effectiveNavLayout, (to) => {
  if (to === displayedLayout.value) {
    // 过渡中又切回原布局：取消挂起动画，保证状态收敛
    layoutSwitchSeq++
    navSwitching.value = false
    return
  }
  runLayoutSwap(to)
})

watch(narrowScreen, (narrow) => {
  if (narrow) {
    displayedLayout.value = 'sidebar'
    navSwitching.value = false
    layoutSwitchSeq++
  }
})

watch(
  () => route.path,
  () => {
    syncActiveGroup()
    nextTick(() => {
      updateNavHighlight()
      scheduleHighlightSync()
    })
  },
)

watch(expandedGroup, () => {
  nextTick(() => {
    updateNavHighlight()
    scheduleHighlightSync()
  })
})

const onEscapeKey = (e) => {
  if (e.key === 'Escape') closeTopbarPanel()
}

const onWindowResize = () => {
  closeTopbarPanel()
  updateNavHighlight()
}

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
  displayedLayout.value = effectiveNavLayout.value
  syncActiveGroup()
  nextTick(updateNavHighlight)
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
  if (highlightSyncTimer) clearTimeout(highlightSyncTimer)
  if (topbarCloseTimer) clearTimeout(topbarCloseTimer)
})

// ---------------------------------------------------------------------------
// 路由加载动画
// ---------------------------------------------------------------------------
router.beforeEach(() => { routeLoading.value = true })
router.afterEach(() => { routeLoading.value = false })
router.onError(() => { routeLoading.value = false })

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
function logout() {
  user.logout()
  router.push('/')
}

// ---------------------------------------------------------------------------
// SVG 图标（集中管理，避免模板中大量重复）
// ---------------------------------------------------------------------------
const icons = {
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>',
  chevronRight: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18"/></svg>',
  profile: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  admin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
}

// ---------------------------------------------------------------------------
// 导航数据
// ---------------------------------------------------------------------------
const S = (d, w = 16, h = 16) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${d}</svg>`

const navGroups = [
  {
    title: '飞行中心',
    icon: S('<path d="M12 19V5M5 12l7-7 7 7"/>', 18, 18),
    items: [
      { path: '/map', label: '在线地图', icon: S('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>') },
      { path: '/flight-plan', label: '飞行计划', icon: S('<path d="M12 19V5M5 12l7-7 7 7"/>') },
      { path: '/flight-archive', label: '飞行档案', icon: S('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>') },
      { path: '/charts', label: '航情查询', icon: S('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>') },
      { path: '/replay', label: '航迹回放', icon: S('<path d="M3 12h4l3-8 4 16 3-8h4"/>') },
    ],
  },
  {
    title: '活动中心',
    icon: S('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 18, 18),
    items: [
      { path: '/network', label: '连飞活动', icon: S('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>') },
      { path: '/my-registrations', label: '我的报名', icon: S('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>') },
    ],
  },
  {
    title: '申请',
    icon: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', 18, 18),
    items: [
      { path: '/apply/controller', label: '管制员申请', icon: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>') },
      { path: '/apply/staff', label: '职员申请', icon: S('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>') },
      { path: '/my-applications', label: '我的申请', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>') },
    ],
  },
  {
    title: '帮助与支持',
    icon: S('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 18, 18),
    items: [
      { path: '/tickets', label: '工单中心', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>') },
      { path: '/profile', label: '个人中心', icon: S('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') },
    ],
  },
  {
    title: '管理后台',
    adminOnly: true,
    icon: S('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 18, 18),
    items: [
      { path: '/admin/users', label: '用户管理', icon: S('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'), requiredPermission: 'user' },
      { path: '/admin/controllers', label: '管制管理', icon: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'), requiredPermission: 'controller' },
      { path: '/admin/announcements', label: '公告管理', icon: S('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>'), requiredPermission: 'staff' },
      { path: '/admin/events', label: '活动管理', icon: S('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'), requiredPermission: 'event' },
      { path: '/admin/tickets', label: '工单管理', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'), requiredPermission: 'ticket' },
      { path: '/admin/permissions', label: '权限等级', icon: S('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'), requiredPermission: 'user' },
      { path: '/admin/rating', label: '权限管理', icon: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'), requiredPermission: 'user' },
      { path: '/admin/flightplans', label: '飞行计划管理', icon: S('<path d="M12 19V5M5 12l7-7 7 7"/>'), requiredPermission: 'flightplan' },
      { path: '/admin/staff-applications', label: '职员申请管理', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'), requiredPermission: 'staff' },
      { path: '/admin/controller-applications', label: '管制申请管理', icon: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'), requiredPermission: 'controller' },
      { path: '/admin/role-applications', label: '角色变更审批', icon: S('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>'), requiredPermission: 'staff', requiredRating: 12 },
      { path: '/admin/deletion-approvals', label: '删除账户审批', icon: S('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'), requiredPermission: 'user', requiredRating: 12 },
      { path: '/admin/login-logs', label: '登录日志', icon: S('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>'), requiredPermission: 'online', requiredRating: 12 },
      { path: '/admin/register-logs', label: '注册日志', icon: S('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>'), requiredPermission: 'online', requiredRating: 12 },
      { path: '/admin/network-logs', label: '网络日志', icon: S('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'), requiredPermission: 'online', requiredRating: 12 },
      { path: '/admin/audit-logs', label: '审计日志', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'), requiredPermission: 'online', requiredRating: 12 },
      { path: '/admin/config', label: '系统配置', icon: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'), requiredPermission: 'user', requiredRating: 12 },
    ],
  },
]
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

/* ---------- 导航 ---------- */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  position: relative;
}

.nav-group { margin-bottom: 2px; }

.nav-group-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text);
  cursor: pointer;
  user-select: none;
  transition: background .15s;
}
.nav-group-title:hover { background: #f5f7fa; }
.nav-group-title--open { color: #1769d2; }
.nav-group-title--open .nav-group-icon { color: #1769d2; }

.nav-group-icon,
.nav-item-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--c-text-secondary);
}

.nav-group-label { flex: 1; color: var(--c-text); }

.nav-group-arrow {
  display: flex;
  align-items: center;
  color: var(--c-text-secondary);
  transition: transform .2s;
}
.nav-group-arrow.expanded { transform: rotate(90deg); }

/* 一级下拉折叠/展开动画(500ms): grid-template-rows 平滑收起 */
.nav-group-items {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows .42s cubic-bezier(.4, 0, .2, 1), opacity .3s ease;
}
.nav-group-items--collapsed { grid-template-rows: 0fr; opacity: 0; }
.nav-group-items-inner { overflow: hidden; min-height: 0; }

/* 子项错峰出现：--i 由模板写入，每个 50ms */
.nav-group-items:not(.nav-group-items--collapsed) .nav-item {
  animation: navChildIn .34s cubic-bezier(.22, .61, .36, 1) both;
  animation-delay: calc(var(--i, 0) * 50ms);
}
@keyframes navChildIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 导航项 — 单行（仪表盘） */
.nav-item--single {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text-secondary);
  text-decoration: none;
  transition: all .15s;
  margin-bottom: 2px;
  position: relative;
}
.nav-item--single:hover {
  background: #f5f7fa;
  color: #1f2a3a;
  text-decoration: none;
}

/* 导航项 — 子项 */
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 8px 38px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--c-text-secondary);
  text-decoration: none;
  transition: all .15s;
  margin-bottom: 2px;
  position: relative;
}
.nav-item:hover {
  background: #f5f7fa;
  color: #1f2a3a;
  text-decoration: none;
}

/* 滑动高亮块：全局唯一，只对 transform/width/height/opacity 做过渡 */
.nav-highlight {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 0;
  border-radius: 8px;
  background: #eaf2ff;
  box-shadow: inset 0 0 0 1px rgba(23, 105, 210, .14);
  pointer-events: none;
  will-change: transform, width, height;
  transition:
    transform .34s cubic-bezier(.22, .61, .36, 1),
    width .34s cubic-bezier(.22, .61, .36, 1),
    height .34s cubic-bezier(.22, .61, .36, 1),
    opacity .18s ease;
}

/* 导航项统一置于高亮块之上 */
.nav-item,
.nav-item--single { z-index: 1; }

/* 选中态只改文字/图标色，不再画每项背景 */
.nav-item--current {
  color: #1769d2;
  font-weight: 600;
}
.nav-item--current .nav-item-icon,
.nav-item--current .nav-icon { color: #1769d2; }

/* 深色模式: 侧边栏导航 hover 柔和化 + 高亮块 */
html[data-theme='dark'] .nav-group-title:hover {
  background: rgba(255, 255, 255, .08);
  color: var(--c-text);
}
html[data-theme='dark'] .nav-item--single:hover,
html[data-theme='dark'] .nav-item:hover {
  background: rgba(255, 255, 255, .08);
  color: var(--c-text);
}
html[data-theme='dark'] .nav-highlight {
  background: rgba(10, 132, 255, .22);
  box-shadow: inset 0 0 0 1px rgba(138, 180, 255, .28);
}
html[data-theme='dark'] .nav-item--current { color: #8ab4ff; }
html[data-theme='dark'] .nav-item--current .nav-item-icon,
html[data-theme='dark'] .nav-item--current .nav-icon { color: #8ab4ff; }
html[data-theme='dark'] .nav-group-title--open { color: #8ab4ff; }
html[data-theme='dark'] .nav-group-title--open .nav-group-icon { color: #8ab4ff; }

/* ---------- 底部用户 ---------- */
.sidebar-footer {
  border-top: 1px solid var(--glass-border);
  padding: 8px;
  flex-shrink: 0;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s;
}
.sidebar-user:hover { background: #f5f7fa; }

html[data-theme='dark'] .sidebar-user:hover {
  background: rgba(255, 255, 255, .08);
}

.sidebar-user-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--c-primary);
  flex-shrink: 0;
}
.sidebar-user-avatar img { width: 100%; height: 100%; object-fit: cover; }

.sidebar-user-info {
  flex: 1;
  min-width: 0;
}
.sidebar-user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
}
.sidebar-user-cid {
  font-size: 11px;
  font-weight: 500;
  color: var(--c-text-secondary);
}

.sidebar-user-arrow {
  display: flex;
  align-items: center;
  color: var(--c-text-muted);
  transition: transform .2s;
}
.sidebar-user-arrow.expanded { transform: rotate(180deg); }

.sidebar-user-menu { padding: 4px 0 0; }

.user-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--c-text);
  text-decoration: none;
  cursor: pointer;
  transition: background .15s;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
}
.user-menu-item:hover {
  background: #f5f7fa;
  text-decoration: none;
}
.user-menu-item--danger { color: var(--c-danger); }

.user-menu-divider {
  height: 1px;
  background: var(--c-border-light);
  margin: 4px 8px;
}

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

/* ---------- 路由加载动画 ---------- */
.route-loading {
  position: absolute;
  inset: 0;
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(255, 255, 255, .6);
  backdrop-filter: blur(8px);
  color: var(--c-text-secondary);
  font-size: 14px;
  font-weight: 500;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--glass-border);
  border-top-color: var(--c-primary);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ================= 导航布局切换（三段式，防跳动） ================= */
.app-layout.is-nav-switching .app-sidebar,
.app-layout.is-nav-switching .topbar-zone,
.app-layout.is-nav-switching .app-content {
  opacity: 0;
  transition: opacity .19s ease;
  pointer-events: none;
}
.app-sidebar,
.topbar-zone {
  transition: opacity .24s ease;
}

/* ================= 顶部栏导航 ================= */
.topbar-zone {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
  flex-shrink: 0;
  margin-left: 4px;
}
.topbar-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 100%;
}
.topbar-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--c-text-secondary);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .18s ease, color .18s ease;
}
.topbar-item:hover,
.topbar-item.active {
  background: rgba(0, 113, 227, .1);
  color: var(--c-primary);
  text-decoration: none;
}
.topbar-item__icon {
  display: flex;
  align-items: center;
  color: currentColor;
}
.topbar-item__arrow {
  display: flex;
  align-items: center;
  transition: transform .2s ease;
}
.topbar-item__arrow.expanded { transform: rotate(90deg); }

/* 下拉面板：位置/宽度与触发项关联（left/width 由 JS 计算） */
.topbar-panel {
  position: fixed;
  top: var(--header-h);
  z-index: 1200;
  padding: 14px;
  display: flex;
  gap: 18px;
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
.topbar-panel__inner {
  display: flex;
  gap: 18px;
  width: 100%;
}
.topbar-panel__col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 168px;
  flex: 1;
}
.topbar-panel__empty {
  padding: 8px;
  font-size: 13px;
  color: var(--c-text-muted);
}
.topbar-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--c-text-secondary);
  text-decoration: none;
  white-space: nowrap;
  transition: background-color .15s ease, color .15s ease;
}
.topbar-link:hover,
.topbar-link--active {
  background: rgba(0, 113, 227, .1);
  color: var(--c-primary);
  text-decoration: none;
}
.topbar-link__icon { display: flex; align-items: center; color: currentColor; }
html[data-theme='dark'] .topbar-item:hover,
html[data-theme='dark'] .topbar-item.active { background: rgba(10, 132, 255, .22); color: #8ab4ff; }
html[data-theme='dark'] .topbar-link:hover,
html[data-theme='dark'] .topbar-link--active { background: rgba(10, 132, 255, .22); color: #8ab4ff; }
html[data-theme='dark'] .topbar-panel { border-color: rgba(255, 255, 255, .14); }

/* 面板/内容过渡（切换菜单项时面板不关闭，只交叉淡入内容） */
.topbar-panel-enter-active,
.topbar-panel-leave-active {
  transition: opacity .16s ease, transform .16s ease;
}
.topbar-panel-enter-from,
.topbar-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.topbar-content-enter-active,
.topbar-content-leave-active {
  transition: opacity .14s ease, transform .14s ease;
}
.topbar-content-enter-from { opacity: 0; transform: translateY(-4px); }
.topbar-content-leave-to { opacity: 0; transform: translateY(4px); }

/* ================= 窄屏（< 860px）强制侧边栏抽屉 ================= */
@media (max-width: 860px) {
  .app-header__menu-btn { display: flex; }
  .topbar-zone { display: none; }
}

/* ---------- 响应式 ---------- */
</style>
