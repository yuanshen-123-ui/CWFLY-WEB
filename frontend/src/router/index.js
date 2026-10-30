import { createRouter, createWebHistory } from 'vue-router'
import { getUserFromToken, isTokenExpired, isTokenNearExpiry, isWithinActiveWindow, touchLastActive } from '@/utils/jwt'
import api from '@/api'
import { showBanner, navigateToLoginAfterBanner } from '@/utils/banner'

/** 清除登录信息并弹横幅，等横幅动画完整走完后跳登录页（与 api 拦截器 401 行为一致） */
function expireAndRedirect(next) {
  localStorage.removeItem('cw_token')
  localStorage.removeItem('cw_user')
  localStorage.removeItem('cw_last_active')
  showBanner('登录已过期,请重新登录!')
  navigateToLoginAfterBanner(next)
}

const routes = [
  /* ========== 首页 ========== */
  {
    path: '/',
    component: () => import('@/components/portal/PortalLayout.vue'),
    children: [
      { path: '', name: 'PortalHome', meta: { title: '首页' }, component: () => import('@/views/portal/PortalHome.vue') },
      { path: 'about', name: 'AboutUs', meta: { title: '关于我们' }, component: () => import('@/views/portal/AboutUs.vue') },
      { path: 'meetings', name: 'MeetingRecords', meta: { title: '会议记录' }, component: () => import('@/views/portal/MeetingRecords.vue') },
      { path: 'controller-public', name: 'ControllerPublic', meta: { title: '职员公示' }, component: () => import('@/views/portal/Staff.vue') },
      { path: 'cookie-policy', name: 'CookiePolicy', meta: { title: 'Cookie 政策' }, component: () => import('@/views/portal/CookiePolicy.vue') }
    ]
  },

  /* ========== 登录 / 注册 ========== */
  { path: '/login', name: 'Login', meta: { title: '登录' }, component: () => import('@/views/auth/Login.vue') },
  { path: '/register', name: 'Register', meta: { title: '注册' }, component: () => import('@/views/auth/Register.vue') },
  { path: '/forgot-password', name: 'ForgotPassword', meta: { title: '找回密码' }, component: () => import('@/views/auth/ForgotPassword.vue') },
  { path: '/oauth/authorize', name: 'OAuthAuthorize', meta: { title: '授权登录' }, component: () => import('@/views/auth/OAuthAuthorize.vue') },
  { path: '/banned', name: 'Banned', meta: { title: '账号已封禁' }, component: () => import('@/views/err/Banned.vue') },
  { path: '/internet-banned', name: 'InternetBanned', meta: { title: '访问受限' }, component: () => import('@/views/err/Internet_Banned.vue') },

  /* ========== 主应用（登录后） ========== */
  {
    path: '/',
    component: () => import('@/components/layout/AppLayout.vue'),
    children: [
      { path: '', redirect: '/portal' },
      { path: 'dashboard', name: 'Dashboard', meta: { title: '仪表盘' }, component: () => import('@/views/Dashboard.vue') },
      { path: 'events', name: 'Events', meta: { title: '飞行活动' }, component: () => import('@/views/Events.vue') },
      { path: 'checkin', name: 'CheckIn', meta: { title: '活动签到' }, component: () => import('@/views/CheckIn.vue') },
      { path: 'profile', name: 'Profile', meta: { title: '个人中心' }, component: () => import('@/views/Profile.vue') },
      { path: 'map', name: 'OnlineMap', meta: { title: '在线地图' }, component: () => import('@/views/OnlineMap.vue') },
      { path: 'network', name: 'NetworkFlight', meta: { title: '连飞活动' }, component: () => import('@/views/NetworkFlight.vue') },
      { path: 'feedback', name: 'Feedback', meta: { title: '投诉与反馈' }, component: () => import('@/views/Feedback.vue') },
      { path: 'tickets', name: 'Tickets', meta: { title: '工单中心' }, component: () => import('@/views/Tickets.vue') },
      { path: 'apply/controller', name: 'ApplyController', meta: { title: '管制员申请' }, component: () => import('@/views/ApplyController.vue') },
      { path: 'apply/staff', name: 'ApplyStaff', meta: { title: '职员申请' }, component: () => import('@/views/ApplyStaff.vue') },
      { path: 'staff-display', name: 'StaffDisplay', meta: { title: '职员公示' }, component: () => import('@/views/StaffDisplay.vue') },
      { path: 'flight-plan', name: 'FlightPlan', meta: { title: '飞行计划' }, component: () => import('@/views/FlightPlan.vue') },
      { path: 'flight-plan/share/:shareId', name: 'FlightPlanShare', meta: { title: '共享飞行计划' }, component: () => import('@/views/FlightPlan.vue') },
      { path: 'charts', name: 'Charts', meta: { title: '航情查询' }, component: () => import('@/views/Charts.vue') },
      { path: 'replay', name: 'Replay', meta: { title: '航迹回放' }, component: () => import('@/views/Replay.vue') },
      // 新功能页面
      { path: 'notifications', name: 'Notifications', meta: { title: '通知中心' }, component: () => import('@/views/notifications/Notifications.vue') },
      { path: 'flight-archive', name: 'FlightArchive', meta: { title: '飞行档案' }, component: () => import('@/views/flight/FlightArchive.vue') },
      { path: 'points', name: 'Points', meta: { title: '积分成就' }, component: () => import('@/views/points/Points.vue') },
      { path: 'leaderboard', name: 'Leaderboard', meta: { title: '排行榜' }, component: () => import('@/views/points/Leaderboard.vue') },
      { path: 'forum', name: 'ForumBoards', beforeEnter() { window.open('https://cwforum.org', '_blank'); return '/dashboard' } },
      { path: 'forum/board/:boardId', beforeEnter() { window.open('https://cwforum.org', '_blank'); return '/dashboard' } },
      { path: 'forum/post/:postId', beforeEnter() { window.open('https://cwforum.org', '_blank'); return '/dashboard' } },
      { path: 'forum/new', beforeEnter() { window.open('https://cwforum.org', '_blank'); return '/dashboard' } },
      { path: 'knowledge', name: 'KnowledgeBase', meta: { title: '知识库' }, component: () => import('@/views/knowledge/KnowledgeBase.vue') },
      { path: 'knowledge/:id', name: 'ArticleDetail', meta: { title: '文章详情' }, component: () => import('@/views/knowledge/ArticleDetail.vue') },
      { path: 'airport/:icao', name: 'AirportDetail', meta: { title: '机场详情' }, component: () => import('@/views/airport/AirportDetail.vue') },
      // 修复(2026-10-30): AirportDetail 的「查看气象」跳 /weather?icao=xxx，但此前该路由不存在 → 404；补上路由
      { path: 'weather', name: 'Weather', meta: { title: '气象报文' }, component: () => import('@/views/Weather.vue') },
      { path: 'search', name: 'SearchPage', meta: { title: '搜索' }, component: () => import('@/views/search/SearchPage.vue') },
      { path: 'training', name: 'TrainingCenter', meta: { title: '培训中心' }, component: () => import('@/views/training/TrainingCenter.vue') },
      { path: 'training/exam/:examId', name: 'TrainingExam', meta: { title: '在线考试' }, component: () => import('@/views/training/TrainingExam.vue') },
      { path: 'schedule', name: 'ControllerSchedule', meta: { title: '管制排班' }, component: () => import('@/views/schedule/ControllerSchedule.vue') },
      { path: 'my-applications', name: 'MyApplications', meta: { title: '我的申请' }, component: () => import('@/views/applications/MyApplications.vue') },
      { path: 'my-registrations', name: 'MyRegistrations', meta: { title: '我的报名' }, component: () => import('@/views/registrations/MyRegistrations.vue') }
    ]
  },

  /* ========== 管理后台（作为侧边栏子路由，不跳转独立UI） ========== */
  {
    path: '/admin',
      component: () => import('@/components/layout/AppLayout.vue'),
    children: [
      { path: '', redirect: '/admin/users' },
      { path: 'users', name: 'AdminUsers', meta: { title: '用户管理', requiredPermission: 'user' }, component: () => import('@/views/admin/Users.vue') },
      { path: 'announcements', name: 'AdminAnnouncements', meta: { title: '公告管理', requiredPermission: 'staff' }, component: () => import('@/views/admin/Announcements.vue') },
      { path: 'permissions', name: 'AdminPermissions', meta: { title: '权限等级', requiredPermission: 'user' }, component: () => import('@/views/admin/Permissions.vue') },
      { path: 'rating', name: 'AdminRating', meta: { title: '权限管理', requiredPermission: 'user' }, component: () => import('@/views/admin/RatingManage.vue') },
      { path: 'login-logs', name: 'AdminLoginLogs', meta: { title: '登录日志', requiredPermission: 'online', requiredRating: 12 }, component: () => import('@/views/admin/LoginLogs.vue') },
      { path: 'register-logs', name: 'AdminRegisterLogs', meta: { title: '注册日志', requiredPermission: 'online', requiredRating: 12 }, component: () => import('@/views/admin/RegisterLogs.vue') },
      { path: 'network-logs', name: 'AdminNetworkLogs', meta: { title: '网络日志', requiredPermission: 'online', requiredRating: 12 }, component: () => import('@/views/admin/NetworkLogs.vue') },
      { path: 'audit-logs', name: 'AdminAuditLogs', meta: { title: '审计日志', requiredPermission: 'online', requiredRating: 12 }, component: () => import('@/views/admin/AuditLogs.vue') },
      { path: 'events', name: 'AdminEvents', meta: { title: '活动管理', requiredPermission: 'event' }, component: () => import('@/views/admin/EventsManage.vue') },
      { path: 'role-applications', name: 'AdminRoleApplications', meta: { title: '角色变更审批', requiredPermission: 'staff', requiredRating: 12 }, component: () => import('@/views/admin/RoleApplications.vue') },
      { path: 'staff-applications', name: 'AdminStaffApplications', meta: { title: '职员申请管理', requiredPermission: 'staff' }, component: () => import('@/views/admin/StaffApplications.vue') },
      { path: 'controller-applications', name: 'AdminControllerApplications', meta: { title: '管制申请', requiredPermission: 'controller' }, component: () => import('@/views/admin/ControllerApplications.vue') },
      { path: 'flightplans', name: 'AdminFlightPlans', meta: { title: '飞行计划管理', requiredPermission: 'flightplan' }, component: () => import('@/views/admin/FlightPlans.vue') },
      { path: 'tickets', name: 'AdminTickets', meta: { title: '工单管理', requiredPermission: 'ticket' }, component: () => import('@/views/admin/Tickets.vue') },
      { path: 'controllers', name: 'AdminControllers', meta: { title: '管制员管理', requiredPermission: 'controller' }, component: () => import('@/views/admin/Controllers.vue') },
      { path: 'config', name: 'AdminSystemConfig', meta: { title: '系统配置', requiredPermission: 'user', requiredRating: 12 }, component: () => import('@/views/admin/AdminSystemConfig.vue') },
      { path: 'deletion-approvals', name: 'AdminDeletionApprovals', meta: { title: '删除账户审批', requiredPermission: 'user', requiredRating: 12 }, component: () => import('@/views/admin/UserApprovals.vue') }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

/**
 * 平台权限等级定义
 *   0  = 普通用户
 *   8  = 协管员
 *   9  = 高级协管员
 *   11 = 管理员
 *   12 = 超级管理员
 */
const RATING_THRESHOLDS = {
  admin: 11,      // /admin/* 路由需要 rating >= 11
  moderator: 8,   // rating >= 8
}

// 路由守卫：检查登录状态和 rating 节点权限；token 过期时前端判定续签
router.beforeEach(async (to, from, next) => {
  // 公开页
  const publicPages = ['/', '/about', '/meetings', '/controller-public', '/cookie-policy', '/login', '/register', '/oauth/authorize', '/banned', '/internet-banned']

  // 不存在的页面：已登录 → 返回仪表盘；未登录 → 跳转登录页
  if (!to.matched.length) {
    next(localStorage.getItem('cw_token') ? '/dashboard' : '/login')
    return
  }

  // 公开页面直接放行（但登录页也记录一下活跃时间，方便回登录后判定）
  if (publicPages.includes(to.path)) {
    if (localStorage.getItem('cw_token')) touchLastActive()
    next()
    return
  }

  const token = localStorage.getItem('cw_token')
  // 未登录访问受保护页面 → 跳转登录
  if (!token) {
    next('/login')
    return
  }

  // ===== token 过期/临近过期：前端判定续签 =====
  // 策略：10 分钟内用户活跃过（返回页面/操作过）→ 自动续签；
  //       超过 10 分钟未活跃 → token 已过期 → 跳转登录页重新登录。
  if (isTokenExpired() || isTokenNearExpiry(60 * 1000)) {
    if (isWithinActiveWindow()) {
      try {
        const res = await api.post('/auth/refresh')
        const newToken = res?.data?.token
        if (newToken) {
          localStorage.setItem('cw_token', newToken)
          const user = res.data?.user
          if (user) localStorage.setItem('cw_user', JSON.stringify(user))
          touchLastActive()
        } else {
          throw new Error('续签无 token')
        }
      } catch (e) {
        // 续签失败（过期超宽限 / 服务器拒绝）→ 清登录信息，弹横幅等动画后跳登录
        expireAndRedirect(next)
        return
      }
    } else {
      // 超过 10 分钟未活跃 → token 过期 → 弹横幅等动画后跳登录
      expireAndRedirect(next)
      return
    }
  }

  // 记录活跃时间（每次导航成功即视为返回页面）
  touchLastActive()

  // 从 JWT 解码用户身份
  const user = getUserFromToken()
  const userRating = user?.rating ?? 0
  // 基于 JWT 的权限检查
  // 管理后台路由：整体要求 rating >= 8（协管员及以上），再检查细分权限
  const isAdminRoute = to.path.startsWith('/admin')
  if (isAdminRoute) {
    // 管理后台整体门槛：普通用户（rating < 8）一律无入口
    if (userRating < 8) {
      next('/dashboard')
      return
    }
    const isAdminLevel = userRating >= 11
    const userPerms = (user?.permissions || '').split(',').filter(Boolean)
    const requiredPerm = to.meta?.requiredPermission
    if (requiredPerm && !isAdminLevel) {
      if (!userPerms.includes(requiredPerm)) {
        next('/dashboard')
        return
      }
    } else if (!requiredPerm && !isAdminLevel && userPerms.length === 0) {
      next('/dashboard')
      return
    }
  }
  if (to.meta.minLevel && userRating < to.meta.minLevel) {
    next('/dashboard')
    return
  }
  // 超管专属页面：rating
  if (to.meta.requiredRating && userRating < to.meta.requiredRating) {
    next('/dashboard')
    return
  }
  next()
})

// 标题兜底：index.html 静态标题为 Loading.（供首页加载动画使用）。
// 导航完成后：首页由 PortalHome 自己处理（Loading 动画 + 正式标题）；
// 登录/注册页保持与首页一致的正式站点名「CW - 青翼模拟飞行连飞平台」；
// 其他页面使用路由 meta.title 生成「xx - CWFLY」，无 meta.title 则回退为 CWFLY。
router.afterEach((to) => {
  if (to.name === 'PortalHome') return
  if (to.name === 'Login' || to.name === 'Register') {
    document.title = 'CW - 青翼模拟飞行连飞平台'
    return
  }
  document.title = to.meta?.title ? `${to.meta.title} - CWFLY` : 'CWFLY'
})

export default router
