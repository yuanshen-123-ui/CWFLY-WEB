<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>权限等级</h1>
      <p>平台 rating 权限等级对照</p>
    </div>

    <!-- 权限等级说明 -->
    <div class="card p-lg mb-lg">
      <h3 class="mb-md">平台权限等级对照</h3>
      <div class="rating-table">
        <div class="rating-row" v-for="level in ratingLevels" :key="level.value">
          <span class="rating-tag" :class="level.class">{{ level.name }}</span>
          <span class="rating-range">rating ≥ {{ level.value }}</span>
          <span class="rating-desc">{{ level.desc }}</span>
        </div>
      </div>
    </div>

    <!-- 节点权限矩阵 -->
    <div class="card p-lg mb-lg">
      <h3 class="mb-md">节点权限矩阵</h3>
      <p class="text-sm text-muted mb-md">每个管理功能节点通过最低 FSD 等级要求控制访问权限</p>
      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>节点</th>
              <th>功能</th>
              <th>最低 FSD 等级</th>
              <th>等级名称</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="node in permissionNodes" :key="node.key">
              <td><code>{{ node.key }}</code></td>
              <td>{{ node.label }}</td>
              <td><span class="fsd-badge" :class="'fsd-' + node.minLevel">{{ node.minLevel }}</span></td>
              <td>{{ node.levelLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 说明 -->
    <div class="card p-md" style="background:var(--c-bg);">
      <h4 class="mb-md">说明</h4>
      <p class="text-sm text-muted">用户的 <strong>rating</strong> 控制网站管理后台权限。前往 <router-link to="/admin/rating" class="link">权限管理</router-link> 编辑。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '@/api'

const ratingLevels = [
  { value: 0, name: '普通用户', class: 'rating-default', desc: '无后台权限' },
  { value: 8, name: '协管员', class: 'rating-moderator', desc: '公告/活动/工单/职员管理' },
  { value: 9, name: '高级协管员', class: 'rating-moderator', desc: '以上 + 日志/在线/培训管理' },
  { value: 11, name: '管理员', class: 'rating-admin', desc: '用户/权限/系统配置管理' },
  { value: 12, name: '超级管理员', class: 'rating-admin', desc: '全部权限' },
]

const users = ref([])
const editing = ref(null)
const editVal = ref(0)

onMounted(async () => {
  try {
    const res = await adminApi.users()
    users.value = res.data
  } catch { /* ignore */ }
})

function startEdit(u) {
  editing.value = u.cid
  editVal.value = u.rating ?? 0
}

async function saveRating(u) {
  try {
    await adminApi.updateUser(u.cid, { rating: editVal.value })
    u.rating = editVal.value
    editing.value = null
  } catch (e) { alert(e.message) }
}

const permissionNodes = [
  { key: 'STAFF', label: '职员公示/公告管理', minLevel: 8, levelLabel: 'rating ≥ 8' },
  { key: 'CONTENT', label: '活动/论坛管理', minLevel: 8, levelLabel: 'I1 塔台教员' },
  { key: 'FLIGHTPLAN', label: '飞行计划管理', minLevel: 8, levelLabel: 'I1 塔台教员' },
  { key: 'TICKET', label: '工单管理', minLevel: 8, levelLabel: 'I1 塔台教员' },
  { key: 'CONTROLLER', label: '管制员管理', minLevel: 9, levelLabel: 'I2 进近教员' },
  { key: 'NOTIFICATION', label: '通知/培训管理', minLevel: 9, levelLabel: 'I2 进近教员' },
  { key: 'LOG', label: '日志查看', minLevel: 9, levelLabel: 'I2 进近教员' },
  { key: 'ONLINE', label: '在线管理', minLevel: 9, levelLabel: 'I2 进近教员' },
  { key: 'VA', label: 'VA 管理', minLevel: 9, levelLabel: 'I2 进近教员' },
  { key: 'ACHIEVEMENT', label: '成就管理', minLevel: 9, levelLabel: 'I2 进近教员' },
  { key: 'USER', label: '用户管理', minLevel: 11, levelLabel: 'SUP 督导' },
  { key: 'PERMISSION', label: '权限配置', minLevel: 11, levelLabel: 'SUP 督导' },
  { key: 'CONFIG', label: '系统配置', minLevel: 11, levelLabel: 'SUP 督导' },
]
</script>

<style scoped>
.rating-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rating-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--c-bg);
  border-radius: 8px;
}
.rating-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  min-width: 80px;
  justify-content: center;
}
.rating-range { font-weight: 600; font-size: 14px; min-width: 100px; }
.rating-desc { font-size: 13px; color: var(--c-text-secondary); }
.fsd-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
.fsd-0, .fsd-1, .fsd-2, .fsd-3, .fsd-4, .fsd-5, .fsd-6, .fsd-7, .fsd-8, .fsd-9, .fsd-10, .fsd-11, .fsd-12 {
  background: #e8f5e9; color: #2e7d32;
}
.fsd-0 { background: #fce4ec; color: #b71c1c; }
.fsd-8, .fsd-9, .fsd-10 { background: #e8eaf6; color: #283593; }
.fsd-11, .fsd-12 { background: #fce4ec; color: #c62828; }
.fsd-type-pilot { background: #e8f5e9; color: #2e7d32; }
.fsd-type-atc { background: #fff3e0; color: #e65100; }
.fsd-type-both { background: #e3f2fd; color: #1565c0; }
.link { color: var(--c-primary); text-decoration: none; }
.link:hover { text-decoration: underline; }
</style>
