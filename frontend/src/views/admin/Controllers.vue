<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>管制员管理</h1>
        <p>管理管制员信息、评级和状态</p>
      </div>
      <button v-if="canWrite" class="btn btn-primary btn-sm" @click="showForm=true">+ 添加管制员</button>
    </div>

    <!-- 添加表单 -->
    <div v-if="showForm" class="card p-lg mb-lg fade-in">
      <h3 class="mb-md">添加管制员</h3>
      <div style="max-width:500px;">
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">姓名</label>
            <input v-model="form.name" class="input" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">CID</label>
            <input v-model="form.cid" list="ctrlUserList" class="input" placeholder="从列表选择或手动输入" />
            <datalist id="ctrlUserList">
              <option v-for="u in users" :key="u.cid" :value="u.cid">{{ u.cid }} - {{ u.username }}</option>
            </datalist>
            <div v-if="selectedUser" class="text-xs text-muted" style="margin-top:4px;">用户名: {{ selectedUser.username }}</div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">部门</label>
            <SelectMenu v-model="form.department" :options="[{ value: '管制部', label: '管制部' }, { value: '培训部', label: '培训部' }, { value: '塔台管制', label: '塔台管制' }, { value: '进近管制', label: '进近管制' }, { value: '区域管制', label: '区域管制' }]" />
          </div>
          <div class="form-col">
            <label class="text-sm font-bold mb-sm" style="display:block;">职位</label>
            <input v-model="form.position" class="input" placeholder="如 主任管制员" />
          </div>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">评级</label>
          <SelectMenu v-model="form.rating" :options="[{ value: 'S1', label: 'S1 — 学员' }, { value: 'S2', label: 'S2 — 初级' }, { value: 'S3', label: 'S3 — 中级' }, { value: 'C1', label: 'C1 — 高级' }, { value: 'C3', label: 'C3 — 主任' }, { value: 'I1', label: 'I1 — 教员' }, { value: 'I3', label: 'I3 — 高级教员' }, { value: 'SUP', label: 'SUP — 主管' }, { value: 'ADM', label: 'ADM — 管理员' }]" placeholder="无评级" />
        </div>
        <div class="mb-md flex items-center gap-sm">
          <CheckBox :model-value="form.active" @update:model-value="form.active = $event" id="active" />
          <label for="active" class="text-sm">在职</label>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="addController">添加</button>
          <button class="btn btn-outline" @click="showForm=false;resetForm()">取消</button>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <div class="card">
      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>CID</th>
              <th>姓名</th>
              <th>部门</th>
              <th>职位</th>
              <th>评级</th>
              <th>状态</th>
              <th>在线</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in list" :key="c.cid">
              <td class="font-bold">{{ c.cid }}</td>
              <td>
                <span v-if="editing === c.cid">
                  <input v-model="editName" class="input" size="10" />
                </span>
                <span v-else>{{ c.name }}</span>
              </td>
              <td>
                <span v-if="editing === c.cid">
                  <SelectMenu v-model="editDept" :options="[{ value: '管制部', label: '管制部' }, { value: '培训部', label: '培训部' }, { value: '塔台管制', label: '塔台管制' }, { value: '进近管制', label: '进近管制' }, { value: '区域管制', label: '区域管制' }]" style="width:120px;" />
                </span>
                <span v-else>{{ c.department }}</span>
              </td>
              <td>
                <span v-if="editing === c.cid">
                  <input v-model="editPos" class="input" size="10" />
                </span>
                <span v-else>{{ c.position }}</span>
              </td>
              <td>
                <span v-if="editing === c.cid">
                  <SelectMenu v-model="editRating" :options="[{ value: 'S1', label: 'S1' }, { value: 'S2', label: 'S2' }, { value: 'S3', label: 'S3' }, { value: 'C1', label: 'C1' }, { value: 'C3', label: 'C3' }, { value: 'I1', label: 'I1' }, { value: 'I3', label: 'I3' }, { value: 'SUP', label: 'SUP' }, { value: 'ADM', label: 'ADM' }]" placeholder="无" style="width:100px;" />
                </span>
                <span v-else class="badge badge-info">{{ c.rating || '-' }}</span>
              </td>
              <td>
                <span class="badge" :class="c.active ? 'badge-success' : 'badge-default'">
                  {{ c.active ? '在职' : '离职' }}
                </span>
              </td>
              <td>
                <span class="badge" :class="c.online ? 'badge-success' : 'badge-default'">
                  {{ c.online ? '在线' : '离线' }}
                </span>
              </td>
              <td>
                <div v-if="editing === c.cid" class="flex gap-xs">
                  <button class="btn btn-primary btn-sm" @click="saveController(c)">保存</button>
                  <button class="btn btn-outline btn-sm" @click="editing=null">取消</button>
                </div>
                <div v-else class="flex gap-xs">
                  <button v-if="canWrite" class="btn btn-outline btn-sm" @click="startEdit(c)">编辑</button>
                  <button v-if="canWrite" class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delController(c)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="8" class="text-center text-muted">暂无管制员</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { adminApi } from '@/api'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
// 管制员管理的写操作(添加/编辑/删除)仅管理员(11)及以上可操作
const canWrite = computed(() => userStore.rating >= 11)

const list = ref([])
const users = ref([])
const showForm = ref(false)
const editing = ref(null)
const editName = ref('')
const editDept = ref('')
const editPos = ref('')
const editRating = ref('')

const form = ref({
  name: '', cid: '', department: '管制部', position: '', rating: '', active: true
})

const selectedUser = computed(() => users.value.find(u => String(u.cid) === String(form.value.cid)))

watch(() => form.value.cid, (val) => {
  const u = users.value.find(x => String(x.cid) === String(val))
  if (u) form.value.name = u.username
})

onMounted(() => load())

async function load() {
  try {
    const [ctrlRes, userRes] = await Promise.all([adminApi.controllers(), adminApi.users()])
    list.value = ctrlRes.data
    users.value = userRes.data
  } catch { /* ignore */ }
}

function resetForm() {
  form.value = { name: '', cid: '', department: '管制部', position: '', rating: '', active: true }
}

function startEdit(c) {
  editing.value = c.cid
  editName.value = c.name
  editDept.value = c.department
  editPos.value = c.position
  editRating.value = c.rating
}

async function saveController(c) {
  try {
    await adminApi.updateController(c.cid, {
      name: editName.value,
      department: editDept.value,
      position: editPos.value,
      rating: editRating.value
    })
    c.name = editName.value
    c.department = editDept.value
    c.position = editPos.value
    c.rating = editRating.value
    editing.value = null
  } catch (e) { alert(e.message) }
}

async function addController() {
  if (!form.value.name || !form.value.position) return alert('请填写姓名和职位')
  try {
    const res = await adminApi.createStaff({
      ...(form.value.cid ? { cid: parseInt(form.value.cid) } : {}),
      name: form.value.name,
      department: form.value.department,
      position: form.value.position,
      rating: form.value.rating,
      active: form.value.active
    })
    list.value.push(res.data)
    showForm.value = false
    resetForm()
  } catch (e) { alert(e.message) }
}

async function delController(c) {
  if (!confirm(`确定删除管制员 ${c.name} (CID: ${c.cid})？`)) return
  try {
    await adminApi.deleteStaff(c.cid)
    list.value = list.value.filter(x => x.cid !== c.cid)
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
@media (max-width: 640px) {
  .form-row { grid-template-columns: 1fr; }
}
.form-col { display: flex; flex-direction: column; }
</style>
