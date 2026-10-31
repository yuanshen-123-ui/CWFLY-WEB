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
    <!-- 顶栏：品牌 / 页面标题 / 顶栏导航面板 / 时钟 / 主题 / 通知 / 用户 -->
    <TopBar
      ref="topBarRef"
      :shell-nav-top="shellNavTop"
      :switching="switching"
      :leaving-layout="leavingLayout"
      :page-title="pageTitle"
      :is-map-page="isMapPage"
      :avatar-url="avatarUrl"
      @toggle-sidebar="toggleSidebar"
    />

    <div class="app-body">
      <div class="sidebar-overlay" :class="{ visible: sidebarOpen }" @click="closeSidebar"></div>

      <!-- 侧栏：导航 / 账号区 / 底部用户卡（顶部栏布局下不渲染，除非窄屏抽屉） -->
      <SidebarNav
        v-if="!shellNavTop || narrowScreen"
        ref="sideNavRef"
        :open="sidebarOpen"
        :width="sidebarWidth"
        :shell-nav-top="shellNavTop"
        :switching="switching"
        :leaving-layout="leavingLayout"
        :avatar-url="avatarUrl"
        @close="closeSidebar"
        @toggle-collapse="onToggleCollapse"
        @resize-start="startResize"
        @logout="logout"
      />

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
/**
 * AppLayout — 主应用布局骨架（原 1863 行，拆分后只保留骨架 + 路由视图 + 全局协调）
 *
 * 职责边界：
 * - 布局骨架（app-layout / app-body / app-content）与路由视图 / 顶部加载条
 * - 布局级状态：侧边栏⇄顶部栏三段式切换、移动端抽屉、侧边栏宽度拖拽（--sidebar-w）
 * - 全局协调：窗口 resize 与 Escape 快捷键（通过子组件 expose 的方法下发）、退出登录二次确认、
 *   头像资料同步、路由级加载指示
 *
 * 已移交：
 * - 顶栏（品牌/标题/顶栏面板/时钟/主题/地图设置/通知/用户菜单）→ components/layout/TopBar.vue
 * - 侧栏（导航/账号区/底部用户卡/手风琴/高亮/tooltip）→ components/layout/SidebarNav.vue
 * - 导航交互状态与测量逻辑 → composables/useAppNav.js
 *
 * 本组件不直接读写 localStorage：布局/收拢偏好由 utils/navLayout.js 持久化。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { profileApi } from '@/api'
import { confirmDialog } from '@/utils/confirm'
import { initNavLayout, narrowScreen, isCollapsed, toggleNavCollapsed } from '@/utils/navLayout'
import { navGroups, singleNavItems } from '@/utils/nav'
import { prefetchRoutesOnIdle } from '@/utils/prefetch'
import { useNavLayoutSwitch, useSidebarDrawer, useSidebarResize } from '@/composables/useAppNav'
import TopBar from './TopBar.vue'
import SidebarNav from './SidebarNav.vue'

const router = useRouter()
const route = useRoute()
const user = useUserStore()

// ---------------------------------------------------------------------------
// 布局级状态（三段式切换 / 移动端抽屉 / 宽度拖拽）
// ---------------------------------------------------------------------------
const { switching, shellNavTop, leavingLayout } = useNavLayoutSwitch()
const { sidebarOpen, closeSidebar, toggleSidebar } = useSidebarDrawer()
const { sidebarWidth, sidebarWVar, startResize } = useSidebarResize()

// 子组件实例：全局快捷键 / 窗口 resize 时通过 expose 下发
const topBarRef = ref(null)
const sideNavRef = ref(null)

function onToggleCollapse() {
  toggleNavCollapsed()
}

// ---------------------------------------------------------------------------
// 页面标题 / 地图页判定（顶栏展示用）
// ---------------------------------------------------------------------------
/** 当前路由标题（router meta.title） */
const pageTitle = computed(() => route.meta?.title || '')
/** 是否在线地图页（进入时 UTC/搜索/主题左移、设置按钮渐显；离开时反向） */
const isMapPage = computed(() => route.path === '/map')

// ---------------------------------------------------------------------------
// 头像（顶栏与侧栏共用同一份地址；加载失败由各子组件用 FALLBACK_AVATAR 兜底）
// ---------------------------------------------------------------------------
const avatarUrl = ref(
  user.profile?.avatar?.startsWith('http') ? user.profile.avatar : user.profile?.avatar || '',
)

// 挂载时从服务器同步用户资料（包括 rating、role 等权限数据）
// 这样管理员修改权限后，用户刷新页面即可看到变化，无需重新登录
profileApi
  .get()
  .then((r) => {
    if (r.data) {
      user.setProfile(r.data)
      if (r.data.avatar) avatarUrl.value = r.data.avatar
    }
  })
  .catch(() => {})

// ---------------------------------------------------------------------------
// 路由加载动画（顶部细进度条）
// ---------------------------------------------------------------------------
const routeLoading = ref(false)
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

router.beforeEach(() => {
  beginRouteLoading()
})
router.afterEach(() => {
  endRouteLoading()
})
router.onError(() => {
  endRouteLoading()
})

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

// ---------------------------------------------------------------------------
// 全局快捷键 + 窗口 resize（下发到子组件）
// ---------------------------------------------------------------------------
/** Escape：关闭顶栏下拉面板 / 收起收拢态 tooltip */
const onEscapeKey = (e) => {
  if (e.key !== 'Escape') return
  topBarRef.value?.closePanel()
  sideNavRef.value?.hideTip()
}

/** 窗口 resize：收起顶栏面板 + 重新测量侧栏高亮块 */
const onWindowResize = () => {
  topBarRef.value?.closePanel()
  sideNavRef.value?.refreshHighlight()
}

onMounted(() => {
  initNavLayout()
  prefetchRoutesOnIdle([
    ...singleNavItems.map((i) => i.path),
    ...(navGroups[0]?.items || []).slice(0, 3).map((i) => i.path),
  ])
  document.addEventListener('keydown', onEscapeKey)
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('keydown', onEscapeKey)
  if (routeLoadingTimer) clearTimeout(routeLoadingTimer)
})
</script>

<style scoped>
/* ============================================================
   AppLayout — 主应用布局骨架
   ============================================================ */

/* ---------- 容器 ---------- */
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ---------- 主体 ---------- */
.app-body {
  display: flex;
  padding-top: var(--header-h);
  flex: 1;
  width: 100%;
}

/* ---------- 侧边栏遮罩（窄屏抽屉，样式主体在 styles/mobile.css） ---------- */
.sidebar-overlay { display: none; }

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

/* ================= 布局切换（三段式，对齐 CTYFLY-WEB）：内容区 ================= */
.app-layout.is-nav-switching .app-content { animation: nav-view-swap .5s ease both; }
@keyframes nav-view-swap {
  0% { opacity: 1; transform: none; }
  34% { opacity: 0; }
  56% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .app-layout.is-nav-switching .app-content { animation: none; }
}

/* ---------- 响应式 ---------- */
</style>
