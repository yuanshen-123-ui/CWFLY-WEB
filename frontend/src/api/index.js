import axios from 'axios'
import { getDeviceFp } from '@/utils/deviceFp'
import { applyPowHeader } from '@/utils/pow'
import { isWithinActiveWindow } from '@/utils/jwt'
import { showBanner, navigateToLoginAfterBanner } from '@/utils/banner'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截器 —— 注入 token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('cw_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // 添加反爬虫标志
  config.headers['X-Requested-With'] = 'XMLHttpRequest'
  // 注入真实设备指纹（注册防重 / 证据链）
  try {
    config.headers['X-Device-Fp'] = getDeviceFp()
  } catch {
    /* 指纹不可用时忽略，不影响请求 */
  }
  // PoW 短期令牌（隐身旁路验证通过后才有；没有则不带该头）
  try {
    applyPowHeader(config.headers)
  } catch {
    /* 忽略 */
  }
  return config
})

// 会话续签状态：避免并发多个 401 时重复刷新
let refreshingPromise = null

/**
 * 自动续签：仅当用户在 10 分钟活跃窗口内才尝试调 /auth/refresh。
 * 返回是否续签成功（成功则已更新 localStorage 中的 token）。
 */
function tryAutoRenew() {
  // 前端判定：10 分钟内活跃过才续签，否则不续（交给跳登录）
  if (!isWithinActiveWindow()) return Promise.resolve(false)
  if (!refreshingPromise) {
    refreshingPromise = api.post('/auth/refresh')
      .then(res => {
        const newToken = res.data?.token
        if (newToken) {
          localStorage.setItem('cw_token', newToken)
          const user = res.data?.user
          if (user) localStorage.setItem('cw_user', JSON.stringify(user))
          return true
        }
        return false
      })
      .catch(() => false)
      .finally(() => { refreshingPromise = null })
  }
  return refreshingPromise
}

// 响应拦截器 —— 统一错误处理 + 401 自动续签重放
api.interceptors.response.use(
  res => res.data,
  async err => {
    const msg = err.response?.data?.message || '网络错误'
    // 401 未授权：登录/注册/refresh 接口自身的 401 不应续签（让页面自己处理错误显示）
    if (err.response?.status === 401) {
      const url = err.config?.url || ''
      const isAuthRequest = url.startsWith('/auth/login') || url.startsWith('/auth/register')
      // 安全(2026-10-25 审计 P2-3): 同一请求最多自动重放一次, 防续签-重放死循环
      if (err.config?._retried) return Promise.reject(err)
      if (!isAuthRequest) {
        // 尝试自动续签（仅 10 分钟内活跃时）；续签成功则用新 token 重放原请求
        const renewed = await tryAutoRenew()
        if (renewed && !url.startsWith('/auth/refresh')) {
          const newConfig = { ...err.config, _retried: true }
          newConfig.headers = { ...(newConfig.headers || {}) }
          newConfig.headers.Authorization = `Bearer ${localStorage.getItem('cw_token')}`
          return api.request(newConfig)
        }
        // 续签失败/超时：清除登录信息，红横幅提示登录过期，等动画结束后跳登录页
        const hadToken = !!localStorage.getItem('cw_token')
        localStorage.removeItem('cw_token')
        localStorage.removeItem('cw_user')
        localStorage.removeItem('cw_last_active')
        if (hadToken && !window.location.pathname.startsWith('/login')) {
          showBanner('登录已过期,请重新登录!')
          navigateToLoginAfterBanner()
        }
      }
    }
    // 通用错误红横幅（401 登录相关与 403 封禁跳转类不弹，避免与登录页/封禁页冲突）
    const isBannedRedirect = err.response?.status === 403 && ['IP_BANNED', 'DEVICE_BANNED', 'INTERNET_BANNED'].includes(err.response?.data?.code)
    if (err.response?.status !== 401 && !isBannedRedirect) {
      showBanner(msg)
    }
    // 403 封禁：跳转封禁页面
    if (err.response?.status === 403 && err.response?.data?.code === 'IP_BANNED') {
      if (window.location.pathname !== '/banned') {
        window.location.href = '/banned'
      }
    }
    // 403 设备指纹封禁：跳转封禁页面
    if (err.response?.status === 403 && err.response?.data?.code === 'DEVICE_BANNED') {
      if (window.location.pathname !== '/banned') {
        window.location.href = '/banned'
      }
    }
    // 403 地区受限（网络管理黑名单）：跳转 Internet_Banned 页面
    if (err.response?.status === 403 && err.response?.data?.code === 'INTERNET_BANNED') {
      if (window.location.pathname !== '/internet-banned') {
        window.location.href = '/internet-banned'
      }
    }
    return Promise.reject(new Error(msg))
  }
)

export default api

/* ========== 各模块 API ========== */

export const authApi = {
  login: (data) => api.post('/auth/login', data),
  loginVerify: (data) => api.post('/auth/login-verify', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh')
}

export const dashboardApi = {
  stats: () => api.get('/dashboard/stats')
}

export const eventsApi = {
  list: (params) => api.get('/events', { params }),
  detail: (id) => api.get(`/events/${id}`),
  join: (id, data) => api.post(`/events/${id}/join`, data || {}),
  cancelRegistration: (regId) => api.delete(`/events/registrations/${regId}`),
  create: (data) => api.post('/events', data),
  update: (id, data) => api.put(`/events/${id}`, data),
  remove: (id) => api.delete(`/events/${id}`)
}

export const checkinApi = {
  do: (eventId) => api.post('/checkin', { eventId }),
  history: () => api.get('/checkin/history')
}

export const profileApi = {
  get: () => api.get('/profile'),
  update: (data) => api.put('/profile', data),
  updateInfo: (data) => api.put('/profile/info', data)
}

export const weatherApi = {
  query: (icao) => api.get('/weather', { params: { icao, _t: Date.now() } })
}

export const feedbackApi = {
  list: () => api.get('/feedback'),
  create: (data) => api.post('/feedback', data)
}

export const applyApi = {
  controller: (data) => api.post('/apply/controller', data),
  staff: (data) => api.post('/apply/staff', data)
}

export const staffApi = {
  list: (params) => api.get('/staff', { params })
}

export const meetingsApi = {
  list: () => api.get('/meetings'),
  upload: (formData) => api.post('/meetings/upload', formData)
}

export const controllersApi = {
  list: () => api.get('/controllers')
}

export const adminApi = {
  // 用户管理
  users: () => api.get('/admin/users'),
  updateUser: (cid, data) => api.put(`/admin/users/${cid}`, data),
  deleteUser: (cid, data) => api.delete(`/admin/users/${cid}`, { data }),
  resetUserPassword: (cid, data) => api.post(`/admin/users/${cid}/reset-password`, data),
  // 设备指纹封禁（删除+加入黑名单时同步拉黑，防换小号绕过）
  deviceBans: () => api.get('/admin/device-bans'),
  addDeviceBan: (data) => api.post('/admin/device-bans', data),
  deleteDeviceBan: (id) => api.delete(`/admin/device-bans/${id}`),
  // 用户删除审批（非超管删除/删除+封禁 → 提交审批）
  userDeletionRequests: () => api.get('/admin/user-deletion-requests'),
  submitUserDeletionRequest: (data) => api.post('/admin/user-deletion-requests', data),
  approveUserDeletionRequest: (id) => api.post(`/admin/user-deletion-requests/${id}/approve`),
  rejectUserDeletionRequest: (id) => api.post(`/admin/user-deletion-requests/${id}/reject`),
  addIpBan: (data) => api.post('/admin/ip-bans', data),
  updateIpBan: (id, data) => api.put(`/admin/ip-bans/${id}`, data),
  ipBans: () => api.get('/admin/ip-bans'),
  deleteIpBan: (id) => api.delete(`/admin/ip-bans/${id}`),
  // 网络管理（IP 白/黑名单）
  ipList: () => api.get('/admin/ip-list'),
  addIpList: (data) => api.post('/admin/ip-list', data),
  updateIpList: (id, data) => api.put(`/admin/ip-list/${id}`, data),
  deleteIpList: (id) => api.delete(`/admin/ip-list/${id}`),
  importIpList: (data) => api.post('/admin/ip-list/import', data),
  // 网络管理（IP 集合）
  ipGroups: () => api.get('/admin/ip-groups'),
  ipGroupSummary: () => api.get('/admin/ip-groups/summary'),
  addIpGroup: (data) => api.post('/admin/ip-groups', data),
  updateIpGroup: (id, data) => api.put(`/admin/ip-groups/${id}`, data),
  deleteIpGroup: (id) => api.delete(`/admin/ip-groups/${id}`),
  addIpGroupMember: (gid, data) => api.post(`/admin/ip-groups/${gid}/members`, data),
  deleteIpGroupMember: (gid, mid) => api.delete(`/admin/ip-groups/${gid}/members/${mid}`),
  importIpGroup: (data) => api.post('/admin/ip-groups/import', data, { timeout: 120000 }),
  // 公告管理
  announcements: () => api.get('/admin/announcements'),
  createAnnouncement: (data) => api.post('/admin/announcements', data),
  updateAnnouncement: (id, data) => api.put(`/admin/announcements/${id}`, data),
  deleteAnnouncement: (id) => api.delete(`/admin/announcements/${id}`),
  // 权限管理
  permissions: () => api.get('/admin/permissions'),
  updatePermissions: (data) => api.put('/admin/permissions', data),
  // 日志
  loginLogs: (params) => api.get('/admin/logs/login', { params }),
  registerLogs: (params) => api.get('/admin/logs/register', { params }),
  networkLogs: (params) => api.get('/admin/logs/network', { params }),
  auditLogs: (params) => api.get('/admin/logs/audit', { params }),
  // 职员管理
  staff: () => api.get('/admin/staff'),
  createStaff: (data) => api.post('/admin/staff', data),
  updateStaff: (cid, data) => api.put(`/admin/staff/${cid}`, data),
  deleteStaff: (cid) => api.delete(`/admin/staff/${cid}`),
  // 活动管理
  events: () => api.get('/admin/events'),
  createEvent: (data) => api.post('/admin/events', data),
  updateEvent: (id, data) => api.put(`/admin/events/${id}`, data),
  deleteEvent: (id) => api.delete(`/admin/events/${id}`),
  eventRegs: (id) => api.get(`/admin/events/${id}/registrations`),
  cancelEventReg: (regId) => api.delete(`/admin/events/registrations/${regId}`),
  // 机场地面数据（超管 + WEB_SECRET 密码校验）
  submitAirport: (icao, data) => api.post(`/admin/airports/${icao}`, data),
  // 申请管理
  roleApplications: () => api.get('/admin/applications/role'),
  updateRoleApp: (id, data) => api.put(`/admin/applications/role/${id}`, data),
  staffApplications: () => api.get('/admin/applications/staff'),
  updateStaffApp: (id, data) => api.put(`/admin/applications/staff/${id}`, data),
  deleteStaffApp: (id) => api.delete(`/admin/applications/staff/${id}`),
  controllerApplications: () => api.get('/admin/applications/controller'),
  updateControllerApp: (id, data) => api.put(`/admin/applications/controller/${id}`, data),
  deleteControllerApp: (id) => api.delete(`/admin/applications/controller/${id}`),
  // 论坛管理
  forum: () => api.get('/admin/forum'),
  updateForumPost: (id, data) => api.put(`/admin/forum/${id}`, data),
  deleteForumPost: (id) => api.delete(`/admin/forum/${id}`),
  // VA 管理
  va: () => api.get('/admin/va'),
  updateVA: (data) => api.put('/admin/va', data),
  // 飞行计划管理
  flightplans: (params) => api.get('/admin/flightplans', { params }),
  deleteFlightplan: (id) => api.delete(`/admin/flightplans/${id}`),
  // 工单管理
  tickets: (params) => api.get('/admin/tickets', { params }),
  updateTicket: (id, data) => api.put(`/admin/tickets/${id}`, data),
  deleteTicket: (id) => api.delete(`/admin/tickets/${id}`),
  // 管制员管理
  controllers: () => api.get('/admin/controllers'),
  updateController: (cid, data) => api.put(`/admin/controllers/${cid}`, data),
  // 在线管理
  online: () => api.get('/admin/online'),
  updateStaffOnline: (cid, data) => api.put(`/admin/online/staff/${cid}`, data)
}

export const flightplanApi = {
  list: () => api.get('/flightplans'),
  get: (id) => api.get(`/flightplans/${id}`),
  getByShare: (shareId) => api.get(`/flightplans/share/${shareId}`),
  submit: (data) => api.post('/flightplans', data),
  delete: (id) => api.delete(`/flightplans/${id}`),
  syncToFsd: (id) => api.post(`/flightplans/${id}/fsd-sync`),
  simbriefImport: (simbriefId) => api.post('/flightplans/simbrief-import', { simbriefId }),
  fsdOnline: () => api.get('/flightplans/fsd/online'),
  fsdControllers: () => api.get('/flightplans/fsd/controllers'),
  fsdBoundaries: () => api.get('/flightplans/fsd/boundaries')
}

export const chartApi = {
  query: (icao, provider = 'jeppesen', rules = 'IFR') => api.get('/charts', { params: { icao, provider, rules } }),
  route: (dep, arr, xt) => api.get('/charts/route', { params: { dep, arr, xt } }),
}

export const ticketApi = {
  list: (params) => api.get('/tickets', { params }),
  create: (data) => api.post('/tickets', data),
  get: (id) => api.get(`/tickets/${id}`),
  update: (id, data) => api.put(`/tickets/${id}`, data),
  delete: (id) => api.delete(`/tickets/${id}`)
}
