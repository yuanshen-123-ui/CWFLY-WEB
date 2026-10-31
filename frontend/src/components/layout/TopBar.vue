<template>
  <header class="app-header" :class="{ 'is-map': isMapPage }">
    <div class="app-header__inner">
      <!-- 移动端：抽屉开关 -->
      <button class="app-header__menu-btn" @click="$emit('toggle-sidebar')" aria-label="菜单">
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
        <router-link to="/search" class="header-icon-btn" :class="{ 'map-shift': isMapPage }" title="搜索"><span class="header-icon-btn__icon" v-html="icons.search"></span></router-link>
        <div class="theme-toggle" :class="{ 'map-shift': isMapPage, 'theme-collapsed': !themeExpanded }" role="group" aria-label="主题切换" @mouseenter="expandTheme" @mouseleave="scheduleThemeCollapse">
          <button v-for="t in themeOptions" :key="t.id" type="button" class="theme-btn" :class="{ active: themeMode === t.id }" @click="themeExpanded ? setTheme(t.id, $event) : expandTheme()" :title="t.label">{{ t.label }}</button>
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
        <router-link to="/notifications" class="header-icon-btn" title="通知中心"><span class="header-icon-btn__icon" v-html="icons.bell"></span></router-link>
        <router-link to="/profile" class="header-avatar" title="个人中心">
          <img :src="avatarUrl" @error="onAvatarError" />
        </router-link>
      </div>
    </div>
  </header>
</template>

<script setup>
/**
 * TopBar — 顶栏（品牌 / 页面标题 / 顶栏导航 + 锚定下拉面板 / UTC 时钟 / 搜索 / 主题 / 地图设置 / 通知 / 用户菜单）
 *
 * 拆分自 components/layout/AppLayout.vue。数据侧不读 localStorage：
 * 主题模式走 utils/theme.js，地图设置走 store/mapSettings.js，导航数据走 utils/nav.js。
 *
 * @typedef {Object} TopBarProps
 * @property {boolean} shellNavTop           当前实际挂载的是顶部栏布局（布局切换过渡期会短暂为旧值）
 * @property {boolean} switching             布局切换过渡进行中
 * @property {string}  leavingLayout         正在退出的布局：'sidebar' | 'topbar' | ''
 * @property {string}  pageTitle             当前路由标题（meta.title，侧边栏布局时显示在顶栏中部）
 * @property {boolean} isMapPage             是否在线地图页（UTC/搜索/主题左移、齿轮按钮渐显）
 * @property {string}  avatarUrl             头像地址
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useMapSettingsStore } from '@/store/mapSettings'
import { icons, singleNavItems } from '@/utils/nav'
import { prefetchRoute } from '@/utils/prefetch'
import { narrowScreen } from '@/utils/navLayout'
import {
  themeMode,
  setThemeMode,
  applyTheme as applyGlobalTheme,
  applyThemeWithTransition,
  scheduleApplyTheme,
  isDarkTheme,
} from '@/utils/theme'
import { FALLBACK_AVATAR, useNavCurrent, useTopbarPanel } from '@/composables/useAppNav'

defineProps({
  /** 当前实际挂载的是顶部栏布局 */
  shellNavTop: { type: Boolean, default: false },
  /** 布局切换过渡进行中 */
  switching: { type: Boolean, default: false },
  /** 正在退出的布局：'sidebar' | 'topbar' | '' */
  leavingLayout: { type: String, default: '' },
  /** 当前路由标题 */
  pageTitle: { type: String, default: '' },
  /** 是否在线地图页 */
  isMapPage: { type: Boolean, default: false },
  /** 头像地址 */
  avatarUrl: { type: String, default: '' },
})

defineEmits([
  /** 移动端点击汉堡按钮：请求父组件开合侧边栏抽屉 */
  'toggle-sidebar',
])

const route = useRoute()
const user = useUserStore()
const mapSettings = useMapSettingsStore()

// ---------------------------------------------------------------------------
// 导航（顶栏单项目 / 分组下拉面板 / 当前项）
// ---------------------------------------------------------------------------
const { isLinkCurrent } = useNavCurrent()
const {
  topbarActive,
  topbarGroups,
  topbarGroup,
  topbarColumns,
  topbarPanelStyle,
  openTopbarGroup,
  closeTopbarPanel,
  scheduleTopbarClose,
  cancelTopbarClose,
} = useTopbarPanel()

// 路由变化时收起顶栏面板（原 AppLayout watch(() => route.path) 的一部分）
watch(
  () => route.path,
  () => closeTopbarPanel(),
)

// ---------------------------------------------------------------------------
// 品牌 Logo: 深色模式用深色版, 浅色模式用浅色版(与主题联动)
// ---------------------------------------------------------------------------
const isDarkNow = ref(isDarkTheme())
const brandLogo = computed(() => (isDarkNow.value ? '/logo/logo_dark.png' : '/logo/logo_light.jpg'))

function syncBrandTheme() {
  isDarkNow.value = isDarkTheme()
}

// ---------------------------------------------------------------------------
// UTC 时钟（Apple 风格）
// ---------------------------------------------------------------------------
const utcTime = ref('')
const utcDate = ref('')
let clockTimer = null

function updateUtcClock() {
  const now = new Date()
  utcTime.value = now.toUTCString().slice(-12, -4) // HH:MM:SS
  utcDate.value = now.toUTCString().slice(5, 16) // DD Mon YYYY
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

/**
 * 切换主题配色。
 * 先 setThemeMode（持久化 + 触发 App.vue 背景逻辑），再从点击点做 View Transitions 圆形扩散；
 * 不支持 View Transitions / prefers-reduced-motion 时 theme.js 内部自动降级为直接切换。
 * @param {string} mode auto|light|dark
 * @param {MouseEvent} [ev] 点击事件（用于扩散圆心）
 */
function setTheme(mode, ev) {
  setThemeMode(mode)
  applyThemeWithTransition(ev?.clientX, ev?.clientY)
}

// ===== 主题配色折叠：默认只显示当前配色, hover 展开全部, 离开 1s 缩回 =====
const themeExpanded = ref(false)
let themeCollapseTimer = null

/** 展开配色选择（取消缩回定时） */
function expandTheme() {
  if (themeCollapseTimer) {
    clearTimeout(themeCollapseTimer)
    themeCollapseTimer = null
  }
  themeExpanded.value = true
}

/** 鼠标离开 1s 后缩回, 只显示当前配色 */
function scheduleThemeCollapse() {
  if (themeCollapseTimer) clearTimeout(themeCollapseTimer)
  themeCollapseTimer = setTimeout(() => {
    themeExpanded.value = false
  }, 1000)
}

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

// ---------------------------------------------------------------------------
// 地图设置按钮（打开设置面板；hover 齿轮弹出下方设置窗口）
// ---------------------------------------------------------------------------
const mapSettingsOpen = ref(false)
let mapSettingsTimer = null

function openMapSettings() {
  mapSettingsOpen.value = true
}

function openMapSettingsPanel() {
  if (mapSettingsTimer) {
    clearTimeout(mapSettingsTimer)
    mapSettingsTimer = null
  }
  mapSettingsOpen.value = true
}

function closeMapSettingsPanel() {
  if (mapSettingsTimer) clearTimeout(mapSettingsTimer)
  mapSettingsTimer = setTimeout(() => {
    mapSettingsOpen.value = false
  }, 300)
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

// ---------------------------------------------------------------------------
// 头像兜底
// ---------------------------------------------------------------------------
function onAvatarError(e) {
  e.target.src = FALLBACK_AVATAR
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
let themeObserver = null

onMounted(() => {
  updateUtcClock()
  clockTimer = setInterval(updateUtcClock, 1000)
  // 主题初始化 + auto 定时检查（7:00 / 19:00 边界自动切换配色）
  applyGlobalTheme()
  syncBrandTheme()
  lastAutoDark = isDarkTheme() // 同步当前 auto 深浅状态, 避免初始化后误触发
  themeTimer = setInterval(tickTheme, 30000)
  // 监听主题按钮/手动切换, 更新品牌 Logo
  themeObserver = new MutationObserver(() => syncBrandTheme())
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (themeTimer) clearInterval(themeTimer)
  if (themeCollapseTimer) clearTimeout(themeCollapseTimer)
  if (mapSettingsTimer) clearTimeout(mapSettingsTimer)
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
})

// 父组件（AppLayout）统一处理全局快捷键 / 窗口 resize，通过 expose 关闭面板
defineExpose({
  /** 收起顶栏下拉面板（Escape / 窗口 resize 时由父组件调用） */
  closePanel: closeTopbarPanel,
})
</script>

<style scoped>
/* ============================================================
   TopBar — 顶栏（拆分自 AppLayout 的 header 段样式）
   ============================================================ */

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
/* 图标容器：占位尺寸与图标一致，保持原有 flex 居中几何（v-html 不能直接写在组件上） */
.header-icon-btn__icon {
  display: flex;
  align-items: center;
  justify-content: center;
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

/* ================= 布局切换（顶部栏侧）================= */
.app-layout.is-nav-switching .topbar-zone:not(.nav-exit-top) { animation: nav-enter-top .3s cubic-bezier(.34, 1.3, .64, 1) both; }
@keyframes nav-enter-top { from { opacity: 0; transform: translateY(-14px); } }
.app-layout.is-nav-switching .nav-exit-top { animation: nav-exit-top .19s ease-in both; }
@keyframes nav-exit-top { to { opacity: 0; transform: translateY(-16px); } }

@media (prefers-reduced-motion: reduce) {
  .app-layout.is-nav-switching .nav-exit-top { animation: none; }
}

@media (max-width: 860px) {
  .app-header__menu-btn { display: flex; }
  .topbar-zone { display: none; }
}
</style>
