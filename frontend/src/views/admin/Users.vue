<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>用户管理</h1>
        <p>管理系统注册用户</p>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>ID</th>
              <th>CID</th>
              <th>用户名</th>
              <th>角色</th>
              <th>FSD 权限</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.id }}</td>
              <td class="font-bold">{{ u.cid }}</td>
              <td>{{ u.username }}</td>
              <td>
                <span class="badge" :class="ratingBadge(u.rating ?? 0)">{{ ratingName(u.rating ?? 0) }}</span>
              </td>
              <td>
                <span class="fsd-badge" :class="'fsd-' + (u.fsdLevel ?? 1)">{{ fsdLevelName(u.fsdLevel ?? 1) }}</span>
              </td>
              <td class="text-secondary text-sm">{{ u.createdAt }}</td>
              <td style="white-space:nowrap;">
                <!-- 固定最小宽度, 防止仅删除按钮时操作列收缩挤到前一列 -->
                <div class="flex gap-sm" style="min-width:110px;">
                  <!-- 编辑/删除: 仅管理员(11)及以上可操作; 非超管不能操作管理员(11)及以上等级的用户 -->
                  <button v-if="canManageUser(u)" class="btn btn-outline btn-sm" @click="openEdit(u)">编辑</button>
                  <button v-if="canManageUser(u)" class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delUser(u)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!users.length">
              <td colspan="7" class="text-center text-muted">暂无用户</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 编辑弹窗（毛玻璃） -->
    <Teleport to="body">
    <Transition name="modal">
    <div v-if="editUser" class="modal-overlay" @click.self="closeEdit">
      <div class="modal-card">
        <h3 class="modal-title">编辑用户</h3>
        <div class="modal-field"><label>ID</label><span>{{ editUser.id }}</span></div>
        <div class="modal-field"><label>CID</label><span>{{ editUser.cid }}</span></div>
        <div class="modal-field">
          <label>角色</label>
          <SelectMenu
              :model-value="editRating"
              @update:model-value="editRating = $event"
              :options="[
                { value: 0, label: '普通用户' },
                { value: 8, label: '协管员' },
                { value: 9, label: '高级协管员' },
                ...(userStore.rating >= 12 ? [{ value: 11, label: '管理员' }, { value: 12, label: '超级管理员' }] : []),
              ]"
            />
        </div>
        <div class="modal-field">
          <label>FSD 等级</label>
          <SelectMenu v-model="editFsdLevel" :options="Object.entries(FSD_LEVEL_NAMES).map(([lv, name]) => ({ value: Number(lv), label: `${name}` }))" />
        </div>
        <button type="button" class="more-toggle" @click="expandMore = !expandMore">
          {{ expandMore ? '▽ 收起' : '△ 更多' }}
        </button>
        <div v-if="expandMore" class="more-panel">
          <div class="modal-field">
            <label>重置原因</label>
            <div class="flex gap-sm" style="flex:1;">
              <input v-model="editPasswordReason" class="input" type="text" placeholder="(可选)将随邮件通知用户" style="flex:1;" />
              <button type="button" class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="resetPassword">重置密码</button>
            </div>
          </div>
          <!-- 以下敏感信息仅超级管理员可见 -->
          <template v-if="userStore.rating >= 12">
            <div class="modal-field"><label>注册 IP</label><span>{{ editUser.registerIp || '-' }}</span></div>
            <div class="modal-field"><label>注册时间</label><span>{{ editUser.createdAt }}</span></div>
            <div class="modal-field"><label>最近登录 IP</label><span>{{ editUser.lastLoginIp || '-' }}</span></div>
            <div class="modal-field"><label>最近登录时间</label><span>{{ editUser.lastLoginAt || '-' }}</span></div>
            <div class="modal-field"><label>最近登录指纹</label><span>{{ editUser.lastLoginFp || '-' }}</span></div>
          </template>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="saveEdit">保存</button>
          <button class="btn btn-outline" @click="closeEdit">取消</button>
        </div>
      </div>
    </div>
    </Transition>
    </Teleport>

    <!-- 删除确认弹窗（毛玻璃） -->
    <Teleport to="body">
    <Transition name="modal">
    <div v-if="deleteTarget" class="modal-overlay" @click.self="closeDelete">
      <div class="modal-card">
        <h3 class="modal-title">删除用户</h3>
        <p class="modal-desc">
          确定删除用户 <b>{{ deleteTarget.username }}</b>（CID: {{ deleteTarget.cid }}）？此操作不可恢复。
        </p>
        <label class="ban-check">
          <CheckBox :model-value="deleteBan" @update:model-value="deleteBan = $event" />
          <span>同时加入黑名单</span>
        </label>
        <!-- 勾选黑名单后：预览将新增的封禁记录（IP/原因可输入/封禁人）；无有效 IP 时给出提示 -->
        <div v-if="deleteBan" class="ban-preview">
          <template v-if="banPreview.length">
            <div class="ban-preview-title">将新增 {{ banPreview.length }} 条封禁记录：</div>
            <div class="ban-reason-field">
              <span class="ban-preview-label">原因</span>
              <input class="input" v-model="banReason" placeholder="请输入封禁原因（可留空）" />
            </div>
            <div v-for="(item, i) in banPreview" :key="i" class="ban-preview-row">
              <div><span class="ban-preview-label">IP</span><span class="ban-preview-ip">{{ item.ip }}</span></div>
              <div><span class="ban-preview-label">封禁人</span><span>{{ item.bannedBy }}</span></div>
            </div>
          </template>
          <div v-else class="ban-preview-title">该用户无有效 IP，无法加入黑名单</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" style="background:var(--c-danger);border-color:var(--c-danger);" @click="confirmDelete">确认删除</button>
          <button class="btn btn-outline" @click="closeDelete">取消</button>
        </div>
      </div>
    </div>
    </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '@/api'
import { useUserStore } from '@/store/user'

/** 当前登录管理员信息（用于封禁人预览）
 *  调用时机：模块初始化时获取，供 banPreview 计算使用 */
const userStore = useUserStore()

const FSD_LEVEL_NAMES = {
  0: '飞行员', 1: '观察员', 2: '地面/放行 S1', 3: '塔台 S2',
  4: '终端 S3', 5: '区域 C1', 6: '区域 C2', 7: '区域 C3',
  8: '塔台教员 I1', 9: '进近教员 I2', 10: '区域教员 I3',
  11: 'SUP', 12: 'ADM'
}
function fsdLevelName(level) { return FSD_LEVEL_NAMES[level] || `未知(${level})` }

const users = ref([])
const editUser = ref(null)
const editRating = ref(0)
const editFsdLevel = ref(1)
const expandMore = ref(false)
const editPasswordReason = ref('')
const deleteTarget = ref(null)
const deleteBan = ref(false)
/** 勾选黑名单后的自定义封禁原因（空白可输入，多条 IP 共用）
 *  调用时机：删除确认弹窗内由输入框双向绑定，confirmDelete 提交时读取 */
const banReason = ref('')

const RATING_NAMES = { 0: '普通用户', 8: '协管员', 9: '高级协管员', 11: '管理员', 12: '超级管理员' }
function ratingName(level) { return RATING_NAMES[level] || `未知(${level})` }
function ratingBadge(level) { return level >= 11 ? 'badge-danger' : level >= 8 ? 'badge-warning' : 'badge-default' }
// 编辑/删除权限: 仅管理员(11)/超管(12)可操作; 非超管不能操作管理员(11)及以上等级的用户
function canManageUser(u) {
  return userStore.rating >= 11 && (userStore.rating >= 12 || (u.rating ?? 0) < 11)
}

async function loadUsers() {
  try {
    const res = await adminApi.users()
    users.value = res.data
  } catch { /* ignore */ }
}
onMounted(loadUsers)

function openEdit(u) {
  editUser.value = u
  editRating.value = u.rating ?? 0
  editFsdLevel.value = u.fsdLevel ?? 1
  expandMore.value = false
  editPasswordReason.value = ''
}

function closeEdit() {
  editUser.value = null
}

async function saveEdit() {
  const u = editUser.value
  if (!u) return
  try {
    await adminApi.updateUser(u.cid, {
      rating: editRating.value,
      fsdLevel: editFsdLevel.value
    })
    u.rating = editRating.value
    u.fsdLevel = editFsdLevel.value
    closeEdit()
    loadUsers() // 保存后重新拉取列表, 确保页面组件同步更新
  } catch (e) { alert(e.message) }
}

/** 重置密码：确认后由后端生成随机强密码并邮件发送给用户 */
async function resetPassword() {
  const u = editUser.value
  if (!u) return
  if (!confirm(`确定重置用户 ${u.username}（CID: ${u.cid}）的密码？\n系统将生成随机强密码并发送到用户邮箱。`)) return
  try {
    const res = await adminApi.resetUserPassword(u.cid, { reason: editPasswordReason.value.trim() })
    alert('密码已重置' + (res.data?.password ? '：' + res.data.password : ''))
  } catch (e) { alert(e.message) }
}

function to24(ip) {
  const parts = String(ip || '').trim().split('.')
  if (parts.length !== 4) return ''
  return parts.slice(0, 3).join('.') + '.0/24'
}

/** 勾选"同时加入黑名单"后，将要新增的封禁记录预览（IP、封禁人）
 *  调用时机：删除确认弹窗内，deleteBan/deleteTarget 变化时由模板 computed 自动计算 */
const banPreview = computed(() => {
  const u = deleteTarget.value
  if (!deleteBan.value || !u) return []
  const ips = [...new Set([u.registerIp, u.lastLoginIp].map(to24).filter(Boolean))]
  const bannedBy = userStore.cid || '-'
  return ips.map(ip => ({ ip, bannedBy }))
})

function delUser(u) {
  deleteTarget.value = u
  deleteBan.value = false
  banReason.value = '' // 每次打开弹窗重置自定义原因
}

function closeDelete() {
  deleteTarget.value = null
}

async function confirmDelete() {
  const u = deleteTarget.value
  if (!u) return
  try {
    // 非超管：删除/删除+封禁不立即生效，提交审批等待超级管理员审批
    if (userStore.rating < 12) {
      const ips = [...new Set([u.registerIp, u.lastLoginIp].map(to24).filter(Boolean))]
      await adminApi.submitUserDeletionRequest({
        cid: String(u.cid),
        username: u.username || '',
        action: deleteBan.value ? 'delete_ban' : 'delete',
        ips,
        reason: banReason.value.trim()
      })
      alert('已提交删除审批，等待超级管理员审批')
      closeDelete()
      return
    }
    // 超管：直接执行删除（+可选加入黑名单）
    if (deleteBan.value) {
      const ips = [...new Set([u.registerIp, u.lastLoginIp].map(to24).filter(Boolean))]
      const reason = banReason.value.trim() // 自定义封禁原因，可留空
      if (!ips.length) {
        alert('该用户无有效 IP，未加入黑名单')
      } else {
        for (const ip of ips) {
          // 同步到封禁管理：IP + 被封禁用户 CID + 原因；封禁人由后端取当前管理员 CID
          await adminApi.addIpBan({ ip, reason, hours: 0, bannedUser: String(u.cid) })
        }
      }
    }
    // 删除用户；勾选黑名单时后端同步封禁其设备指纹（防换小号注册/登录绕过）
    await adminApi.deleteUser(u.cid, deleteBan.value ? { banDevice: true } : undefined)
    users.value = users.value.filter(x => x.id !== u.id)
    closeDelete()
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>

/* 编辑弹窗：毛玻璃 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.modal-card {
  width: 540px;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  overflow-y: auto;
  padding: 26px 28px;
  border-radius: 20px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
}
.modal-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 600;
}
.modal-field {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.modal-field label {
  width: 110px;
  flex-shrink: 0;
  font-size: 13px;
  white-space: nowrap;
  color: var(--c-text-secondary, #6b7280);
}
.modal-field span {
  font-size: 14px;
  color: var(--c-text, #1d1d1f);
}
.modal-field .input {
  flex: 1;
}
.more-toggle {
  display: block;
  width: 100%;
  margin: 2px 0 6px;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: var(--c-primary, #0071e3);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  border-top: 1px solid var(--glass-border);
}
.more-toggle:hover { opacity: .8; }
.more-panel {
  margin-bottom: 4px;
  padding-top: 4px;
}
.modal-desc {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--c-text, #1d1d1f);
}
.ban-check {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: 13px;
  cursor: pointer;
}
.ban-check input[type="checkbox"] {
  margin: 0;
  accent-color: var(--c-danger, #ff453a);
}
/* 黑名单新增记录预览 */
.ban-preview {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 69, 58, 0.06);
  border: 1px solid rgba(255, 69, 58, 0.25);
}
.ban-preview-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-danger, #ff453a);
}
.ban-preview-row {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--glass-bg);
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-text, #1d1d1f);
}
.ban-preview-row + .ban-preview-row {
  margin-top: 6px;
}
.ban-preview-label {
  display: inline-block;
  width: 44px;
  flex-shrink: 0;
  color: var(--c-text-secondary, #6b7280);
}
.ban-reason-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.55);
}
.ban-reason-field .input {
  flex: 1;
  font-size: 12px;
}
.ban-preview-ip {
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.table-wrap table {
  table-layout: fixed;
  width: 100%;
}
.table-wrap table th:nth-child(1),
.table-wrap table td:nth-child(1),
.table-wrap table th:nth-child(2),
.table-wrap table td:nth-child(2),
.table-wrap table th:nth-child(3),
.table-wrap table td:nth-child(3) {
  width: 5%;
}

.table-wrap table th:nth-child(4),
.table-wrap table td:nth-child(4),
.table-wrap table th:nth-child(5),
.table-wrap table td:nth-child(5) {
  width: 5%;
}

.table-wrap table th:nth-child(6),
.table-wrap table td:nth-child(6) {
  width: 8%;
}


.permission-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}
.perm-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.perm-checkbox input[type="checkbox"] {
  margin: 0;
  accent-color: var(--c-primary, #3b82f6);
}
</style>
