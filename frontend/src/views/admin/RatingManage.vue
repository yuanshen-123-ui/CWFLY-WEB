<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>权限管理</h1>
      <p>为每个用户分配细分管理权限</p>
    </div>

    <div class="card p-lg">
      <div class="mb-md flex gap-sm flex-wrap" style="align-items:center;">
        <span class="text-sm text-muted">筛选：</span>
        <button class="btn btn-sm" :class="filter === 'all' ? 'btn-primary' : 'btn-outline'" @click="filter='all'">全部 ({{ filteredBy('all').length }})</button>
        <button class="btn btn-sm" :class="filter === 'moderator' ? 'btn-primary' : 'btn-outline'" @click="filter='moderator'">协管员 ({{ filteredBy('moderator').length }})</button>
        <button class="btn btn-sm" :class="filter === 'admin' ? 'btn-primary' : 'btn-outline'" @click="filter='admin'">管理员 ({{ filteredBy('admin').length }})</button>
      </div>

      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>CID</th>
              <th>用户名</th>
              <th style="min-width:120px;">权限等级</th>
              <th>细分权限</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in filteredUsers" :key="u.cid">
              <td class="font-bold">{{ u.cid }}</td>
              <td>{{ u.username }}</td>
              <td>
                <span class="badge" :class="ratingBadge(u._editRating ?? u.rating ?? 0)">{{ ratingName(u._editRating ?? u.rating ?? 0) }}</span>
              </td>
              <td>
                <div class="perm-checkboxes">
                  <label v-for="p in ALL_PERMS" :key="p.key" class="perm-item" :class="{ disabled: !canEdit(u) }">
                    <input type="checkbox" :value="p.key" v-model="u._editPerms" :disabled="!canEdit(u)" @change="u._dirty = true" />
                    <span>{{ p.label }}</span>
                  </label>
                </div>
                <button v-if="u._dirty" class="btn btn-primary btn-xs mt-sm" @click="saveUser(u)">保存</button>
              </td>
            </tr>
            <tr v-if="!filteredUsers.length">
              <td colspan="4" class="text-center text-muted">暂无用户</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '@/api'
import { useUserStore } from '@/store/user'

const ALL_PERMS = [
  { key: 'user', label: '用户管理' },
  { key: 'flightplan', label: '飞行计划管理' },
  { key: 'event', label: '活动管理' },
  { key: 'controller', label: '管制员申请管理' },
  { key: 'staff', label: '职员申请管理' },
  { key: 'ticket', label: '工单管理' },
  { key: 'online', label: '在线管理' },
]

const users = ref([])
const filter = ref('all')

/** 当前登录管理员的 rating（决定可修改哪些等级） */
const userStore = useUserStore()
const myRating = computed(() => userStore.rating)

/** 表单仅显示协管员及以上（rating>=8），普通用户不出现在表单 */
const visibleUsers = computed(() => users.value.filter(u => (u.rating ?? 0) >= 8))

const filteredUsers = computed(() => {
  if (filter.value === 'all') return visibleUsers.value
  if (filter.value === 'admin') return visibleUsers.value.filter(u => (u.rating ?? 0) >= 11)
  return visibleUsers.value.filter(u => (u.rating ?? 0) < 11) // 协管员 8/9
})

function filteredBy(type) {
  if (type === 'admin') return visibleUsers.value.filter(u => (u.rating ?? 0) >= 11)
  if (type === 'moderator') return visibleUsers.value.filter(u => (u.rating ?? 0) < 11)
  return visibleUsers.value
}

/**
 * canEdit(u)
 * 作用：判断当前登录管理员能否修改目标用户的细分权限。
 *   超级管理员(12) 可修改 12 及以下（含管理员/其他超管）；管理员(11) 可修改 11 以下（8/9）。
 * 调用时机：模板渲染细分权限 checkbox 的禁用状态时调用。
 */
function canEdit(u) {
  const target = u._editRating ?? u.rating ?? 0
  return myRating.value >= 12 || target < myRating.value
}

const RATING_NAMES = { 0: '普通用户', 8: '协管员', 9: '高级协管员', 11: '管理员', 12: '超级管理员' }
function ratingName(level) { return RATING_NAMES[level] || `未知(${level})` }
function ratingBadge(level) { return level >= 11 ? 'badge-danger' : level >= 8 ? 'badge-warning' : 'badge-default' }

onMounted(async () => {
  try {
    const res = await adminApi.users()
    users.value = res.data.map(u => ({
      ...u,
      _editRating: u.rating ?? 0,
      _editPerms: (u.permissions || '').split(',').filter(Boolean),
      _dirty: false
    }))
  } catch { /* ignore */ }
})

async function saveUser(u) {
  if (!canEdit(u)) { alert('您没有权限修改该用户的权限'); return }
  try {
    await adminApi.updateUser(u.cid, { rating: u._editRating, permissions: u._editPerms })
    u.rating = u._editRating
    u.permissions = u._editPerms.join(',')
    u._dirty = false
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.perm-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.perm-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  background: var(--c-bg);
  border: 1px solid var(--glass-border);
  transition: all .15s;
}
.perm-item:hover { border-color: var(--c-primary); }
.perm-item.disabled { opacity: .5; cursor: not-allowed; }
.perm-item input { margin: 0; }
.btn-xs { font-size:11px;padding:3px 8px;border-radius:5px; }
.mt-sm { margin-top:8px; }

/* 列宽：CID 5%、用户名 10%、权限等级 10%、细分权限占满剩余全部 */
.table-wrap table { table-layout: fixed; width: 100%; }
.table-wrap table th:nth-child(1),
.table-wrap table td:nth-child(1) { width: 5%; }
.table-wrap table th:nth-child(2),
.table-wrap table td:nth-child(2) { width: 10%; }
.table-wrap table th:nth-child(3),
.table-wrap table td:nth-child(3) { width: 10%; }
.table-wrap table th:nth-child(4),
.table-wrap table td:nth-child(4) { width: 75%; }
</style>
