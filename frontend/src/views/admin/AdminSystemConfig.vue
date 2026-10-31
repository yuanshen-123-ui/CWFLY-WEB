<template>
  <div class="admin-config fade-in">
    <div class="page-header">
      <h1>系统配置</h1>
      <p>管理平台系统设置</p>
    </div>

    <!-- 封禁管理 -->
    <div class="card p-lg">
      <div class="flex justify-between items-center mb-md">
        <h2 style="margin:0;font-size:16px;">封禁管理</h2>
        <button class="btn btn-primary btn-sm" @click="openBanManager">管理封禁</button>
      </div>
      <div v-if="bansLoading" class="p-md" aria-busy="true" aria-label="正在加载封禁记录">
        <Skeleton :lines="4" :height="14" />
      </div>
      <div v-else-if="bans.length" class="table-wrap">
        <table v-sort="{ index: 5, desc: true }">
          <thead>
            <tr><th>IP</th><th>封禁用户</th><th>封禁人</th><th>原因</th><th>状态</th><th>时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="b in bans" :key="b.id">
              <td class="font-mono">{{ b.ip }}</td>
              <td>{{ b.bannedUser || (b.bannedUserCids || []).join('、') || '-' }}</td>
              <td>{{ b.bannedBy || '-' }}</td>
              <td>{{ b.reason || '-' }}</td>
              <td><span class="badge" :class="b.active ? 'badge-danger' : 'badge-default'">{{ b.active ? '生效中' : '已禁用' }}</span></td>
              <td class="text-sm">{{ b.createdAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-else icon="shield" title="暂无封禁记录" description="当前没有生效中的 IP 封禁。" compact />
    </div>

    <!-- 网络管理 -->
    <div class="card p-lg">
      <div class="flex justify-between items-center mb-md">
        <h2 style="margin:0;font-size:16px;">网络管理</h2>
        <button class="btn btn-primary btn-sm" @click="openIpList">管理名单</button>
      </div>
      <div v-if="groupsLoading" class="p-md" aria-busy="true" aria-label="正在加载网络名单">
        <Skeleton :lines="4" :height="14" />
      </div>
      <div v-else-if="ipGroupSummary.length" class="table-wrap">
        <table v-sort>
          <thead>
            <tr><th>集合名称</th><th>类型</th><th>状态</th><th>IP 数</th><th>添加人</th><th>时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="g in ipGroupSummary" :key="g.id">
              <td>{{ g.name || ('集合#' + g.id) }}</td>
              <td><span class="badge" :class="g.type === 'white' ? 'badge-success' : 'badge-danger'">{{ g.type === 'white' ? '白名单' : '黑名单' }}</span></td>
              <td><span class="badge" :class="g.active ? 'badge-info' : 'badge-default'">{{ g.active ? '启用' : '停用' }}</span></td>
              <td>{{ g.memberCount }}</td>
              <td>{{ g.addedBy || '-' }}</td>
              <td class="text-sm">{{ g.createdAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-else icon="globe" title="暂无集合" description="还没有 IP 黑白名单集合，点击「管理名单」创建。" compact />
    </div>

    <!-- 封禁管理弹窗：AppModal 统一 Teleport / Esc / 焦点迁移与还原 / 滚动锁 -->
    <AppModal v-model:open="showBanManager" title="封禁管理" width="720px">
      <div class="ban-add">
        <input v-model="newBanIp" class="input flex-1" placeholder="IP 或网段，如 1.2.3.4 / 1.2.3.0/24" />
        <input v-model="newBanReason" class="input flex-1" placeholder="原因（可选）" />
        <button class="btn btn-primary btn-sm" @click="addBan" :disabled="!newBanIp.trim()">添加封禁</button>
      </div>
      <div v-if="bans.length" class="table-wrap">
        <table v-sort="{ index: 5, desc: true }">
          <thead>
            <tr><th>IP</th><th>封禁用户</th><th>封禁人</th><th>原因</th><th>状态</th><th>时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="b in bans" :key="b.id" :class="{ 'ban-edit-row': editingId === b.id }">
              <template v-if="editingId === b.id">
                <td><input ref="editIpInput" v-model="editIp" class="input font-mono" style="min-width:120px;" placeholder="IP 或网段" @blur="onEditBlur" @keyup.enter="saveEdit" /></td>
                <td><input v-model="editUser" class="input font-mono" style="min-width:100px;" placeholder="用户 CID" @blur="onEditBlur" @keyup.enter="saveEdit" /></td>
                <td>{{ b.bannedBy || '-' }}</td>
                <td><input v-model="editReason" class="input" style="min-width:120px;" placeholder="原因" @blur="onEditBlur" @keyup.enter="saveEdit" /></td>
                <td><span class="badge" :class="b.active ? 'badge-danger' : 'badge-default'">{{ b.active ? '生效中' : '已禁用' }}</span></td>
                <td class="text-sm">{{ b.createdAt }}</td>
                <td class="text-muted text-sm">点击空白处保存</td>
              </template>
              <template v-else>
                <td class="font-mono" style="cursor:pointer;" title="双击修改" @dblclick="startEdit(b)">{{ b.ip }}</td>
                <td style="cursor:pointer;" title="双击修改" @dblclick="startEdit(b)">{{ b.bannedUser || (b.bannedUserCids || []).join('、') || '-' }}</td>
                <td>{{ b.bannedBy || '-' }}</td>
                <td style="cursor:pointer;" title="双击修改" @dblclick="startEdit(b)">{{ b.reason || '-' }}</td>
                <td><span class="badge" :class="b.active ? 'badge-danger' : 'badge-default'">{{ b.active ? '生效中' : '已禁用' }}</span></td>
                <td class="text-sm">{{ b.createdAt }}</td>
                <td><button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delBan(b)">删除</button></td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-else icon="shield" title="暂无封禁记录" compact />
      <template #footer>
        <button class="btn btn-outline" @click="closeBanManager">关闭</button>
      </template>
    </AppModal>

    <!-- 网络管理弹窗（集合模式）：AppModal 统一外壳 -->
    <AppModal v-model:open="showIpList" title="网络管理" width="720px">
      <!-- 添加集合 -->
      <div class="ban-add">
        <input v-model="newGroupName" class="input" style="flex:1;" placeholder="集合名称" />
        <SelectMenu v-model="newGroupType" :options="[{ value: 'black', label: '黑名单' }, { value: 'white', label: '白名单' }]" style="max-width:110px;" />
        <button class="btn btn-primary btn-sm" @click="addIpGroup" :disabled="!newGroupName.trim()">添加集合</button>
        <button class="btn btn-outline btn-sm" title="导入 txt 文件到指定集合" @click="pickIpFile">导入 txt</button>
        <input ref="ipFileInput" type="file" accept=".txt,text/plain" style="display:none;" @change="onIpFileChange" />
      </div>
      <!-- 导入确认：选择目标集合 -->
      <div v-if="importPending" class="ip-import-panel">
        <div class="ip-import-title">已解析到 {{ importItems.length }} 条 IP，请选择要添加到的集合：</div>
        <div class="ip-import-row">
          <SelectMenu v-model="importGroupId" :options="[ipGroups.map((g) => ({ value: g.id, label: `${g.name || ('集合#' + g.id)}（${g.type === 'white' ? '白名单' : '黑名单'}）` })), { value: -1, label: '＋ 新建集合' }]" style="flex:1;" />
          <template v-if="importGroupId === -1">
            <input v-model="importNewName" class="input" style="flex:1;" placeholder="新集合名称" />
            <SelectMenu v-model="importNewType" :options="[{ value: 'black', label: '黑名单' }, { value: 'white', label: '白名单' }]" style="max-width:110px;" />
          </template>
          <button class="btn btn-primary btn-sm" @click="confirmImport" :disabled="importLoading || (importGroupId === -1 && !importNewName.trim())">
            <span v-if="importLoading" class="ip-spinner" aria-hidden="true"></span>{{ importLoading ? '正在导入…' : '确认导入' }}
          </button>
          <button class="btn btn-outline btn-sm" @click="cancelImport">取消</button>
        </div>
      </div>
      <!-- 集合列表 -->
      <div class="ip-groups">
        <div v-for="g in ipGroups" :key="g.id" class="ip-group">
          <div class="ip-group-head">
            <button class="ip-group-caret" :title="isGroupExpanded(g) ? '收起' : '展开'" @click="toggleGroupExpand(g)">{{ isGroupExpanded(g) ? '▾' : '▸' }}</button>
            <template v-if="groupEditId === g.id">
              <input v-model="groupEditName" class="input" style="flex:1;min-width:120px;" @keyup.enter="saveGroupEdit(g)" @blur="saveGroupEdit(g)" />
            </template>
            <template v-else>
              <span class="ip-group-name" title="双击改名" @dblclick="startGroupEdit(g)">{{ g.name || ('集合#' + g.id) }}</span>
            </template>
            <span class="badge" :class="g.type === 'white' ? 'badge-success' : 'badge-danger'" style="cursor:pointer;" title="双击切换类型" @dblclick="toggleGroupType(g)">{{ g.type === 'white' ? '白名单' : '黑名单' }}</span>
            <span class="badge" :class="g.active ? 'badge-info' : 'badge-default'" style="cursor:pointer;" title="点击切换状态" @click="toggleIpGroup(g)">{{ g.active ? '启用' : '停用' }}</span>
            <span class="text-muted text-sm">添加人 {{ g.addedBy || '-' }}</span>
            <span class="text-muted text-sm">{{ g.createdAt }}</span>
            <span class="ip-group-count">{{ (g.members || []).length }} 条</span>
            <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delIpGroup(g)">删除集合</button>
          </div>
          <div v-if="isGroupExpanded(g)" class="ip-group-members">
            <div v-for="m in g.members" :key="m.id" class="ip-member">
              <span class="font-mono">{{ m.ip }}</span>
              <button class="ip-member-del" title="移除该 IP" @click="delMember(g, m)">×</button>
            </div>
            <div v-if="addTargetId === g.id" class="ip-member-add">
              <input ref="memberAddInput" v-model="memberAddIp" class="input font-mono" style="flex:1;" placeholder="输入 IP 或网段后回车" @keyup.enter="addMember(g)" @blur="cancelMemberAdd" />
            </div>
            <div v-else class="ip-member-add-placeholder" title="双击在此集合添加 IP" @dblclick="startMemberAdd(g)">＋ 双击此空白行添加 IP</div>
          </div>
        </div>
      </div>
      <EmptyState v-if="!ipGroups.length" icon="globe" title="暂无集合" description="请先在上方添加一个 IP 集合。" compact />
      <template #footer>
        <button class="btn btn-outline" @click="closeIpList">关闭</button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { adminApi } from '@/api'
import AppModal from '@/components/base/AppModal.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import Skeleton from '@/components/base/Skeleton.vue'

const bans = ref([])
const bansLoading = ref(false)
const showBanManager = ref(false)
const newBanIp = ref('')
const newBanReason = ref('')

// ===== 封禁行内编辑 =====
const editingId = ref(null)
const editIp = ref('')
const editReason = ref('')
const editUser = ref('')
const editIpInput = ref(null)

// ===== 网络管理（IP 集合：一组 IP 组成一个集合） =====
const ipGroups = ref([])          // 完整集合（含成员），仅打开弹窗时加载
const ipGroupSummary = ref([])    // 集合概览（不含成员明细），主卡片展示
const groupsLoading = ref(false)
const showIpList = ref(false)
const newGroupName = ref('')
const newGroupType = ref('black')
// 导入 txt 文件（解析后选择目标集合）
const ipFileInput = ref(null)
const importPending = ref(false)
const importItems = ref([])
const importGroupId = ref(null)
const importNewName = ref('')
const importNewType = ref('black')
const importLoading = ref(false) // 批量导入进行中
// 集合成员添加（集合内空白行双击）
const addTargetId = ref(null)
const memberAddIp = ref('')
const memberAddInput = ref(null)
// 集合名行内编辑
const groupEditId = ref(null)
const groupEditName = ref('')
// 集合展开状态（默认折叠）
const expandedMap = ref({}) 

onMounted(() => { loadBans(); loadIpGroupSummary() })

async function loadBans() {
  bansLoading.value = true
  try { const r = await adminApi.ipBans(); bans.value = r.data || [] } catch {} finally {
    bansLoading.value = false
  }
}

function openBanManager() {
  showBanManager.value = true
  loadBans()
}
function closeBanManager() {
  showBanManager.value = false
}

async function addBan() {
  const ip = newBanIp.value.trim()
  if (!ip) return
  try {
    await adminApi.addIpBan({ ip, reason: newBanReason.value.trim(), hours: 0 })
    newBanIp.value = ''
    newBanReason.value = ''
    loadBans()
  } catch (e) { alert('添加失败: ' + e.message) }
}

async function delBan(b) {
  if (!confirm(`确定解除封禁 ${b.ip} ？`)) return
  try {
    await adminApi.deleteIpBan(b.id)
    loadBans()
  } catch (e) { alert('删除失败: ' + e.message) }
}

/**
 * startEdit(b)
 * 作用：进入某条封禁的行内编辑态（编辑 IP/原因）。
 * 调用时机：在「管理封禁」弹窗列表中双击 IP/封禁用户/原因 单元格时触发。
 */
function startEdit(b) {
  editingId.value = b.id
  editIp.value = b.ip
  editReason.value = b.reason || ''
  editUser.value = b.bannedUser || ''
  // 自动聚焦 IP 输入框，确保后续点击空白处能触发 blur 保存
  nextTick(() => { editIpInput.value?.focus() })
}

/**
 * cancelEdit()
 * 作用：退出行内编辑态，丢弃修改。
 * 调用时机：点击「取消」按钮时触发。
 */
function cancelEdit() {
  editingId.value = null
  editIp.value = ''
  editReason.value = ''
}

/**
 * saveEdit()
 * 作用：保存行内编辑的 IP/原因，调用 PUT /admin/ip-bans/:id 更新。
 * 调用时机：行内编辑态点击「保存」按钮时触发。
 */
async function saveEdit() {
  const id = editingId.value
  if (id == null) return
  const ip = editIp.value.trim()
  if (!ip) { cancelEdit(); return }
  try {
    await adminApi.updateIpBan(id, { ip, reason: editReason.value, bannedUser: editUser.value })
    loadBans()
    cancelEdit()
  } catch (e) { alert('保存失败: ' + e.message) }
}

/**
 * onEditBlur()
 * 作用：编辑 input 失焦时，若焦点已离开编辑行（点击空白/外部），自动保存。
 * 调用时机：行内编辑的 IP/原因输入框 blur（点击空白处）时触发。
 */
function onEditBlur() {
  setTimeout(() => {
    const el = document.activeElement
    const row = document.querySelector('.ban-edit-row')
    if (!row || !row.contains(el)) {
      saveEdit()
    }
  }, 0)
}

// ===== 网络管理操作（IP 集合） =====

/**
 * loadIpGroupSummary()
 * 作用：拉取集合概览（不含成员明细，仅计数），供主卡片展示，节省带宽。
 * 调用时机：页面加载 / 增删改集合后刷新主卡片时触发。
 */
async function loadIpGroupSummary() {
  groupsLoading.value = true
  try { const r = await adminApi.ipGroupSummary(); ipGroupSummary.value = r.data || [] } catch { /* ignore */ } finally {
    groupsLoading.value = false
  }
}

/**
 * loadIpGroups()
 * 作用：拉取网络管理完整集合列表（含成员 IP），仅在打开管理弹窗时调用。
 * 调用时机：点击「管理名单」打开弹窗时触发。
 */
async function loadIpGroups() {
  try { const r = await adminApi.ipGroups(); ipGroups.value = r.data || [] } catch { /* ignore */ }
  loadIpGroupSummary() // 弹窗操作后同步刷新主卡片概览
}

/**
 * openIpList()
 * 作用：打开网络管理弹窗并刷新集合列表。
 * 调用时机：点击「管理名单」按钮时触发。
 */
function openIpList() {
  showIpList.value = true
  importPending.value = false
  expandedMap.value = {} // 每次打开默认全部折叠
  loadIpGroups()
}

/**
 * closeIpList()
 * 作用：关闭网络管理弹窗。
 * 调用时机：点击「关闭」或遮罩空白处时触发。
 */
function closeIpList() {
  showIpList.value = false
  importPending.value = false
}

/**
 * addIpGroup()
 * 作用：创建新集合（POST /admin/ip-groups）。
 * 调用时机：点击「添加集合」按钮时触发。
 */
async function addIpGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    await adminApi.addIpGroup({ name, type: newGroupType.value })
    newGroupName.value = ''
    loadIpGroups()
  } catch (e) { alert('添加失败: ' + e.message) }
}

/**
 * delIpGroup(g)
 * 作用：删除集合（连带其全部成员 IP，DELETE /admin/ip-groups/:id）。
 * 调用时机：点击集合的「删除集合」按钮时触发。
 */
async function delIpGroup(g) {
  if (!confirm(`确定删除集合「${g.name || ('集合#' + g.id)}」及其 ${(g.members || []).length} 条 IP ？`)) return
  try {
    await adminApi.deleteIpGroup(g.id)
    loadIpGroups()
  } catch (e) { alert('删除失败: ' + e.message) }
}

/**
 * toggleIpGroup(g)
 * 作用：切换集合启用/停用状态（PUT /admin/ip-groups/:id）。
 * 调用时机：点击集合状态徽章时触发。
 */
async function toggleIpGroup(g) {
  try {
    await adminApi.updateIpGroup(g.id, { active: !g.active })
    loadIpGroups()
  } catch (e) { alert('切换失败: ' + e.message) }
}

/**
 * toggleGroupType(g)
 * 作用：切换集合白/黑名单类型（PUT /admin/ip-groups/:id）。
 * 调用时机：双击集合类型徽章时触发。
 */
async function toggleGroupType(g) {
  try {
    await adminApi.updateIpGroup(g.id, { type: g.type === 'white' ? 'black' : 'white' })
    loadIpGroups()
  } catch (e) { alert('切换失败: ' + e.message) }
}

/**
 * isGroupExpanded(g)
 * 作用：判断集合当前是否展开（成员 IP 列表可见）。
 * 调用时机：模板渲染集合头部箭头/成员区时调用。
 */
function isGroupExpanded(g) { return !!expandedMap.value[g.id] }

/**
 * toggleGroupExpand(g)
 * 作用：切换集合展开/折叠状态。
 * 调用时机：点击集合头部箭头按钮时触发。
 */
function toggleGroupExpand(g) {
  expandedMap.value = { ...expandedMap.value, [g.id]: !expandedMap.value[g.id] }
}

/**
 * startGroupEdit(g)
 * 作用：进入集合名的行内编辑态。
 * 调用时机：双击集合名称时触发。
 */
function startGroupEdit(g) {
  groupEditId.value = g.id
  groupEditName.value = g.name || ''
}

/**
 * saveGroupEdit(g)
 * 作用：保存集合名（PUT /admin/ip-groups/:id）。
 * 调用时机：集合名输入框回车或失焦时触发。
 */
async function saveGroupEdit(g) {
  if (groupEditId.value !== g.id) return
  groupEditId.value = null
  const name = groupEditName.value.trim()
  if (!name) return
  try {
    await adminApi.updateIpGroup(g.id, { name })
    loadIpGroups()
  } catch (e) { alert('保存失败: ' + e.message) }
}

/**
 * startMemberAdd(g)
 * 作用：进入该集合的"空白行添加 IP"输入态。
 * 调用时机：双击集合成员列表末尾的空白行时触发。
 */
function startMemberAdd(g) {
  addTargetId.value = g.id
  memberAddIp.value = ''
  nextTick(() => { memberAddInput.value?.focus() })
}

/**
 * cancelMemberAdd()
 * 作用：退出成员添加输入态。
 * 调用时机：成员输入框失焦（点击外部）时触发。
 */
function cancelMemberAdd() {
  addTargetId.value = null
  memberAddIp.value = ''
}

/**
 * addMember(g)
 * 作用：向集合添加一条 IP（POST /admin/ip-groups/:id/members）。
 * 调用时机：成员输入框按回车时触发。
 */
async function addMember(g) {
  const ip = memberAddIp.value.trim()
  if (!ip) { cancelMemberAdd(); return }
  try {
    await adminApi.addIpGroupMember(g.id, { ip })
    memberAddIp.value = ''
    cancelMemberAdd()
    loadIpGroups()
  } catch (e) { alert('添加失败: ' + e.message) }
}

/**
 * delMember(g, m)
 * 作用：从集合移除一条 IP（DELETE /admin/ip-groups/:id/members/:mid）。
 * 调用时机：点击成员行右侧 × 按钮时触发。
 */
async function delMember(g, m) {
  if (!confirm(`确定从集合移除 ${m.ip} ？`)) return
  try {
    await adminApi.deleteIpGroupMember(g.id, m.id)
    loadIpGroups()
  } catch (e) { alert('删除失败: ' + e.message) }
}

/**
 * pickIpFile()
 * 作用：打开系统文件选择框（仅 txt）。
 * 调用时机：点击「导入 txt」按钮时触发。
 */
function pickIpFile() {
  ipFileInput.value?.click()
}

/**
 * onIpFileChange(e)
 * 作用：读取 txt 文件并解析出 IP 列表，进入"选择目标集合"确认面板。
 *   - 每行一个 IP（支持 CIDR 网段），# 开头为注释，忽略空行
 *   - 解析后不立即导入，由用户在面板选择目标集合（或新建）后 confirmImport 提交
 * 调用时机：文件选择框选中文件后触发。
 */
async function onIpFileChange(e) {
  const file = e.target.files?.[0]
  e.target.value = '' // 允许重复选择同一文件
  if (!file) return
  if (!/\.txt$/i.test(file.name) && file.type !== 'text/plain') {
    alert('仅支持导入 .txt 文件')
    return
  }
  try {
    const text = await file.text()
    const items = []
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const m = line.match(/^(\S+)(?:\s+(.*))?$/)
      if (!m) continue
      items.push({ ip: m[1], reason: (m[2] || '').trim() })
    }
    if (!items.length) { alert('文件中未找到有效 IP'); return }
    if (items.length > 5000) { alert('最多导入 5000 条，当前 ' + items.length + ' 条'); return }
    importItems.value = items
    importGroupId.value = ipGroups.value[0]?.id ?? -1
    importNewName.value = ''
    importNewType.value = 'black'
    importPending.value = true
  } catch (err) { alert('读取文件失败: ' + err.message) }
}

/**
 * cancelImport()
 * 作用：取消导入，隐藏确认面板。
 * 调用时机：点击「取消」按钮时触发。
 */
function cancelImport() {
  importPending.value = false
  importItems.value = []
}

/**
 * confirmImport()
 * 作用：把解析出的 IP 导入到所选集合（若选"新建集合"则先创建），期间显示导入中动画。
 * 调用时机：导入确认面板点击「确认导入」按钮时触发。
 */
async function confirmImport() {
  if (importLoading.value) return
  importLoading.value = true
  let gid = importGroupId.value
  try {
    if (gid === -1) {
      const r = await adminApi.addIpGroup({ name: importNewName.value.trim(), type: importNewType.value, reason: '' })
      gid = r.data.id
    }
    const r = await adminApi.importIpGroup({ groupId: gid, ips: importItems.value.map(i => ({ ip: i.ip })) })
    alert(`导入完成：成功 ${r.data?.added ?? 0} 条，跳过 ${r.data?.skipped ?? 0} 条`)
    cancelImport()
    loadIpGroups()
  } catch (err) { alert('导入失败: ' + err.message) }
  finally { importLoading.value = false }
}

</script>

<style scoped>
/* 相邻卡片之间保留间距（封禁管理 / 网络管理 之间） */
.admin-config .card + .card {
  margin-top: 20px;
}
/* 弹窗外壳（遮罩/卡片/标题/底部按钮）由 base/AppModal.vue 提供，这里只保留内容排版 */
.ban-add {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
/* 弹窗内表格列宽：指定列设百分比，其余按内容自适应（覆盖全局 fixed 等宽布局） */
.table-wrap table {
  table-layout: auto;
  width: 100%;
}
.table-wrap table th,
.table-wrap table td {
  white-space: nowrap;
}
/* 封禁用户(第2列) 5%、封禁人(第3列) 5%、原因(第4列) 15%、状态(第5列) 5% */
.table-wrap table th:nth-child(2),
.table-wrap table td:nth-child(2) { width: 5%; }
.table-wrap table th:nth-child(3),
.table-wrap table td:nth-child(3) { width: 5%; }
.table-wrap table th:nth-child(4),
.table-wrap table td:nth-child(4) { width: 15%; }
.table-wrap table th:nth-child(5),
.table-wrap table td:nth-child(5) { width: 5%; }
/* 网络管理列表列宽：IP 30%、添加人 12%、类型 12%、状态 10%、时间 16% */
.net-list table th:nth-child(1),
.net-list table td:nth-child(1) { width: 30%; }
.net-list table th:nth-child(2),
.net-list table td:nth-child(2) { width: 12%; }
.net-list table th:nth-child(3),
.net-list table td:nth-child(3) { width: 12%; }
.net-list table th:nth-child(4),
.net-list table td:nth-child(4) { width: 10%; }
.net-list table th:nth-child(5),
.net-list table td:nth-child(5) { width: 16%; }
/* 网络管理：集合卡片（高度交给 AppModal 内容区滚动，避免弹窗内二次滚动） */
.ip-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 4px;
}
.ip-group {
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: var(--glass-bg);
  padding: 10px 12px;
}
.ip-group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--glass-border);
}
.ip-group-name {
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}
.ip-group-count {
  font-size: 12px;
  color: var(--c-text-secondary, #6b7280);
}
.ip-group-members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  max-height: 132px; /* 约 5 行，超出滑动显示 */
  overflow-y: auto;
}
.ip-group-caret {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--c-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}
.ip-group-caret:hover { color: var(--c-primary, #0071e3); }
.ip-member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--glass-bg);
}
.ip-member-del {
  border: none;
  background: transparent;
  color: var(--c-text-secondary, #6b7280);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}
.ip-member-del:hover { color: var(--c-danger, #ff453a); }
.ip-member-add-placeholder {
  padding: 6px 8px;
  border: 1px dashed var(--glass-border);
  border-radius: 6px;
  color: var(--c-text-secondary, #6b7280);
  font-size: 12px;
  text-align: center;
  cursor: pointer;
}
.ip-member-add-placeholder:hover {
  border-color: var(--c-primary, #0071e3);
  color: var(--c-primary, #0071e3);
}
.ip-member-add {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 导入确认面板 */
.ip-import-panel {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(0, 113, 227, 0.06);
  border: 1px solid rgba(0, 113, 227, 0.25);
}
.ip-import-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-primary, #0071e3);
}
.ip-import-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
/* 批量导入中动画 */
.ip-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ip-spin .7s linear infinite;
  vertical-align: -2px;
}
@keyframes ip-spin {
  to { transform: rotate(360deg); }
}
</style>
