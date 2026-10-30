<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="admin-sidebar__header">
        <h2>管理后台</h2>
        <button class="admin-sidebar__close" @click="close">&times;</button>
      </div>
      <nav class="admin-sidebar__nav">
        <div v-for="group in sidebarGroups" :key="group.title" class="admin-sidebar__group">
          <div class="admin-sidebar__group-title">{{ group.title }}</div>
          <router-link v-for="item in group.items" :key="item.path" :to="item.path" class="admin-sidebar__link" active-class="admin-sidebar__link--active">
            <span v-html="item.icon"></span><span>{{ item.label }}</span>
          </router-link>
        </div>
      </nav>
    </aside>
    <main class="admin-main">
      <div class="admin-main__bar">
        <router-link to="/dashboard" class="admin-main__back">&larr; 返回仪表盘</router-link>
        <span class="admin-main__title">{{ route.meta?.title || '管理后台' }}</span>
      </div>
      <div class="admin-main__body">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'

const router = useRouter()
const route = useRoute()
const user = useUserStore()

function close() {
  router.push('/dashboard')
}

const sidebarGroups = [
  {
    title: '管理',
    items: [
      { path: '/admin/users', label: '用户管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
      { path: '/admin/controllers', label: '管制员管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
      { path: '/admin/announcements', label: '公告管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>' },
      { path: '/admin/permissions', label: '权限管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
    ]
  },
  {
    title: '日志',
    items: [
      { path: '/admin/login-logs', label: '登录日志', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>' },
      { path: '/admin/audit-logs', label: '审计日志', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
    ]
  },
  {
    title: '内容',
    items: [
      { path: '/admin/events', label: '活动管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
      { path: '/admin/flightplans', label: '飞行计划管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' },
      { path: '/admin/tickets', label: '工单管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
      { path: '/admin/staff', label: '职员公示管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' },
      { path: '/admin/forum', label: '管理论坛', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
      { path: '/admin/va', label: '管理VA', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' },
    ]
  },
  {
    title: '在线',
    items: [
      { path: '/admin/online', label: '在线管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>' },
    ]
  },
  {
    title: '新功能',
    items: [
      { path: '/admin/notifications', label: '通知管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' },
      { path: '/admin/training', label: '培训管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>' },
      { path: '/admin/achievements', label: '成就管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
      { path: '/admin/config', label: '系统配置', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
    ]
  },
  {
    title: '审批',
    items: [
      { path: '/admin/role-applications', label: '角色变更申请', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>' },
      { path: '/admin/staff-applications', label: '职员申请管理', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
      { path: '/admin/controller-applications', label: '管制申请', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' },
    ]
  }
]
</script>

<style scoped>
.admin-layout { display:flex;min-height:calc(100vh - var(--header-h));margin-top:var(--header-h); }
.admin-sidebar { width:220px;flex-shrink:0;background:var(--c-white);border-right:1px solid var(--c-border-light);display:flex;flex-direction:column;height:calc(100vh - var(--header-h));position:sticky;top:var(--header-h); }
.admin-sidebar__header { display:flex;align-items:center;justify-content:space-between;padding:16px 16px 12px;border-bottom:1px solid var(--c-border-light); }
.admin-sidebar__header h2 { font-size:15px;font-weight:700;color:var(--c-text); }
.admin-sidebar__close { width:28px;height:28px;border-radius:6px;background:none;border:none;font-size:20px;color:var(--c-text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center; }
.admin-sidebar__close:hover { background:var(--c-bg);color:var(--c-text); }
.admin-sidebar__nav { flex:1;overflow-y:auto;padding:12px 8px; }
.admin-sidebar__group { margin-bottom:12px; }
.admin-sidebar__group-title { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--c-text-muted);padding:4px 10px;margin-bottom:2px; }
.admin-sidebar__link { display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;color:var(--c-text-secondary);font-size:13px;font-weight:500;text-decoration:none;transition:all .15s;margin-bottom:1px; }
.admin-sidebar__link:hover { background:#F5F7FA;color:#1F2A3A;text-decoration:none; }
.admin-sidebar__link--active { background:#EAF2FF;color:#1769D2;font-weight:600; }
.admin-main { flex:1;display:flex;flex-direction:column;background:var(--c-bg);min-width:0; }
.admin-main__bar { display:flex;align-items:center;gap:12px;padding:12px 24px;background:var(--c-white);border-bottom:1px solid var(--c-border-light); }
.admin-main__back { font-size:13px;color:var(--c-primary);text-decoration:none; }
.admin-main__back:hover { text-decoration:underline; }
.admin-main__title { font-size:15px;font-weight:600;color:var(--c-text); }
.admin-main__body { flex:1;padding:24px;overflow-y:auto; }
@media (max-width:768px) { .admin-sidebar{width:180px} .admin-main__body{padding:16px} }
</style>
