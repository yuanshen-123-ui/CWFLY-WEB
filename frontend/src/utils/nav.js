/**
 * 主导航数据（侧边栏与顶部栏共用，唯一事实来源）
 *
 * 与 CTYFLY-WEB 的 nav.js 对齐：把图标与菜单定义从 AppLayout 抽出来，
 * 两个导航形态读同一份数据，避免两份定义漂移。
 *
 * 字段约定：
 *   path/label/icon/desc  路由、名称、图标、顶部栏面板说明
 *   items                 二级项
 *   adminOnly             仅管理员分组（rating >= 8 且按 requiredPermission/requiredRating 过滤）
 *   external              外链
 *   desc                  顶部栏面板里的一级说明 / 二级卡片说明
 */
const S = (d, w = 16, h = 16) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${d}</svg>`

export const icons = {
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>',
  chevronRight: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18"/></svg>',
  collapse: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg>',
  profile: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  admin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
  close: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
}

export const navGroups = [
  {
    title: '飞行中心',
    icon: S('<path d="M12 19V5M5 12l7-7 7 7"/>', 18, 18),
    desc: '在线地图、飞行计划、档案与航情',
    items: [
      { path: '/map', label: '在线地图', desc: '实时连飞地图与空域态势', icon: S('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>') },
      { path: '/flight-plan', label: '飞行计划', desc: '提交与查看连飞计划', icon: S('<path d="M12 19V5M5 12l7-7 7 7"/>') },
      { path: '/flight-archive', label: '飞行档案', desc: '历史航班与飞行记录', icon: S('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>') },
      { path: '/charts', label: '航情查询', desc: '机场、航路与航图数据', icon: S('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>') },
    ],
  },
  {
    title: '活动中心',
    icon: S('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 18, 18),
    desc: '连飞活动与我的报名',
    items: [
      { path: '/network', label: '连飞活动', desc: '近期活动、席位与报名', icon: S('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>') },
      { path: '/my-registrations', label: '我的报名', desc: '我参加过的活动记录', icon: S('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>') },
    ],
  },
  {
    title: '申请',
    icon: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', 18, 18),
    desc: '管制员 / 职员申请与进度',
    items: [
      { path: '/apply/controller', label: '管制员申请', desc: '申请成为管制员', icon: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>') },
      { path: '/apply/staff', label: '职员申请', desc: '加入站点运营团队', icon: S('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>') },
      { path: '/my-applications', label: '我的申请', desc: '查看审批进度', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>') },
    ],
  },
  {
    title: '帮助与支持',
    icon: S('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 18, 18),
    desc: '工单与常见问题',
    items: [
      { path: '/tickets', label: '工单中心', desc: '提交问题与处理进度', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>') },
    ],
  },
  {
    title: '管理后台',
    adminOnly: true,
    icon: S('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 18, 18),
    desc: '站点运营、审核与日志',
    items: [
      { path: '/admin/users', label: '用户管理', desc: '账号与管制等级', icon: S('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'), requiredPermission: 'user' },
      { path: '/admin/controllers', label: '管制管理', desc: '管制席位与在线状态', icon: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'), requiredPermission: 'controller' },
      { path: '/admin/announcements', label: '公告管理', desc: '发布站内公告', icon: S('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>'), requiredPermission: 'staff' },
      { path: '/admin/events', label: '活动管理', desc: '活动与管制席位', icon: S('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'), requiredPermission: 'event' },
      { path: '/admin/tickets', label: '工单管理', desc: '处理用户工单', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'), requiredPermission: 'ticket' },
      { path: '/admin/permissions', label: '权限等级', desc: '权限等级定义', icon: S('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'), requiredPermission: 'user' },
      { path: '/admin/rating', label: '权限管理', desc: '用户权限分配', icon: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'), requiredPermission: 'user' },
      { path: '/admin/flightplans', label: '飞行计划管理', desc: '计划审核与检索', icon: S('<path d="M12 19V5M5 12l7-7 7 7"/>'), requiredPermission: 'flightplan' },
      { path: '/admin/staff-applications', label: '职员申请管理', desc: '职员申请审核', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'), requiredPermission: 'staff' },
      { path: '/admin/controller-applications', label: '管制申请管理', desc: '管制员申请审核', icon: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'), requiredPermission: 'controller' },
      { path: '/admin/role-applications', label: '角色变更审批', desc: '敏感角色双人复核', icon: S('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>'), requiredPermission: 'staff', requiredRating: 12 },
      { path: '/admin/deletion-approvals', label: '删除账户审批', desc: '账号删除复核', icon: S('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'), requiredPermission: 'user', requiredRating: 12 },
      { path: '/admin/login-logs', label: '登录日志', desc: '登录记录与异常', icon: S('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>'), requiredPermission: 'online', requiredRating: 12 },
      { path: '/admin/register-logs', label: '注册日志', desc: '注册来源识别', icon: S('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>'), requiredPermission: 'online', requiredRating: 12 },
      { path: '/admin/network-logs', label: '网络日志', desc: 'API 访问溯源', icon: S('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'), requiredPermission: 'online', requiredRating: 12 },
      { path: '/admin/audit-logs', label: '审计日志', desc: '管理操作留痕', icon: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'), requiredPermission: 'online', requiredRating: 12 },
      { path: '/admin/config', label: '系统配置', desc: '站点参数与开关', icon: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'), requiredPermission: 'user', requiredRating: 12 },
    ],
  },
]

/** 单项目（无二级） */
export const singleNavItems = [
  { path: '/dashboard', label: '仪表盘', desc: '我的飞行数据与今日动态', icon: icons.grid },
]

/** 账号区（与主导航分开，由模板渲染在“账号”分组下） */
export const accountNavItems = [
  { path: '/profile', label: '个人中心', desc: '资料、绑定与偏好设置', icon: icons.profile },
]
