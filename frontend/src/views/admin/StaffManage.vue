<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>职员公示管理</h1>
        <p>管理平台职员信息公示</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showForm=true">+ 添加职员</button>
    </div>

    <!-- 添加表单 -->
    <div v-if="showForm" class="card p-lg mb-lg">
      <h3 class="mb-md">添加职员</h3>
      <div style="max-width:500px;">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">CID</label>
          <div class="flex gap-sm">
            <input v-model="form.cid" list="userList" class="input" placeholder="从列表选择或手动输入" />
            <datalist id="userList">
              <option v-for="u in users" :key="u.cid" :value="u.cid">{{ u.cid }} - {{ u.username }}</option>
            </datalist>
          </div>
          <div v-if="selectedUser" class="text-xs text-muted" style="margin-top:4px;">用户名: {{ selectedUser.username }}</div>
        </div>
        <div class="mb-md"><label class="text-sm font-bold mb-sm" style="display:block;">姓名</label><input v-model="form.name" class="input" /></div>
        <div class="mb-md"><label class="text-sm font-bold mb-sm" style="display:block;">部门</label><input v-model="form.department" class="input" placeholder="如 综合部" /></div>
        <div class="mb-md"><label class="text-sm font-bold mb-sm" style="display:block;">职位</label><input v-model="form.position" class="input" placeholder="如 职员" /></div>
        <div class="mb-md"><label class="text-sm font-bold mb-sm" style="display:block;">评级</label><input v-model="form.rating" class="input" placeholder="可选" /></div>
        <div class="mb-md flex items-center gap-sm">
          <input v-model="form.active" type="checkbox" id="active" />
          <label for="active" class="text-sm">在职</label>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="addStaff">添加</button>
          <button class="btn btn-outline" @click="showForm=false;resetForm()">取消</button>
        </div>
      </div>
    </div>

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
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in list" :key="s.cid">
              <td class="font-bold">{{ s.cid }}</td>
              <td>{{ s.name }}</td>
              <td>{{ s.department }}</td>
              <td>{{ s.position }}</td>
              <td>{{ s.rating || '-' }}</td>
              <td><span class="badge" :class="s.active ? 'badge-success' : 'badge-default'">{{ s.active ? '在职' : '离职' }}</span></td>
              <td>
                <button v-if="canWrite" class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delStaff(s)">删除</button>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="7" class="text-center text-muted">暂无职员</td>
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
// 删除职员仅管理员(11)及以上可操作
const canWrite = computed(() => userStore.rating >= 11)

const list = ref([])
const users = ref([])
const showForm = ref(false)
const form = ref({ cid: '', name: '', department: '', position: '', rating: '', active: true })

const selectedUser = computed(() => users.value.find(u => String(u.cid) === String(form.value.cid)))

watch(() => form.value.cid, (val) => {
  const u = users.value.find(x => String(x.cid) === String(val))
  if (u) form.value.name = u.username
})

function resetForm() {
  form.value = { cid: '', name: '', department: '', position: '', rating: '', active: true }
}

onMounted(async () => {
  try {
    const [staffRes, userRes] = await Promise.all([adminApi.staff(), adminApi.users()])
    list.value = staffRes.data
    users.value = userRes.data
  } catch { /* ignore */ }
})

async function addStaff() {
  if (!form.value.name || !form.value.department || !form.value.position) return alert('请填写完整信息')
  try {
    const payload = {
      ...(form.value.cid ? { cid: parseInt(form.value.cid) } : {}),
      name: form.value.name,
      department: form.value.department,
      position: form.value.position,
      rating: form.value.rating,
      active: form.value.active
    }
    const res = await adminApi.createStaff(payload)
    list.value.push(res.data)
    showForm.value = false
    resetForm()
  } catch (e) { alert(e.message) }
}

async function delStaff(s) {
  if (!confirm(`确定删除职员 ${s.name}？`)) return
  try {
    await adminApi.deleteStaff(s.cid)
    list.value = list.value.filter(x => x.cid !== s.cid)
  } catch (e) { alert(e.message) }
}
</script>
