<template>
  <div class="schedule fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>管制排班</h1>
        <p>查看管制员值班安排</p>
      </div>
      <button class="btn btn-primary btn-sm" v-if="isStaff" @click="showBook = true">申请值班</button>
    </div>

    <div class="card p-lg mb-lg">
      <div class="flex gap-sm mb-md">
        <input v-model="date" type="date" class="input" style="width:auto;" @change="load" />
      </div>
      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>日期</th><th>管制员</th><th>席位</th><th>开始时间</th><th>结束时间</th><th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in schedules" :key="s.id">
              <td>{{ s.date }}</td>
              <td>{{ s.userId }}</td>
              <td>{{ s.position || '-' }}</td>
              <td>{{ s.startTime || '-' }}</td>
              <td>{{ s.endTime || '-' }}</td>
              <td><span class="badge" :class="s.status === 'confirmed' ? 'badge-success' : s.status === 'pending' ? 'badge-warning' : 'badge-default'">{{ s.status }}</span></td>
            </tr>
            <tr v-if="!schedules.length"><td colspan="6" class="text-center text-muted">暂无排班</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 申请值班弹窗 -->
    <div v-if="showBook" class="modal-overlay" @click.self="showBook = false">
      <div class="modal card p-lg">
        <h3 class="mb-md">申请值班</h3>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">日期</label>
          <input v-model="bookDate" type="date" class="input" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">席位</label>
          <input v-model="bookPosition" class="input" placeholder="如 DEL/GND/TWR/APP/CTR" />
        </div>
        <div class="flex gap-md mb-md">
          <div class="flex-1">
            <label class="text-sm font-bold mb-sm" style="display:block;">开始时间</label>
            <input v-model="bookStart" type="time" class="input" />
          </div>
          <div class="flex-1">
            <label class="text-sm font-bold mb-sm" style="display:block;">结束时间</label>
            <input v-model="bookEnd" type="time" class="input" />
          </div>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitBook" :disabled="bookLoading">{{ bookLoading ? '提交中...' : '提交申请' }}</button>
          <button class="btn btn-outline" @click="showBook = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '@/store/user'
import api from '@/api'

const user = useUserStore()
// 职员/管理员判定改用 rating（原 role 字段已移除）
const isStaff = computed(() => user.rating >= 9)
const schedules = ref([])
const date = ref(new Date().toISOString().split('T')[0])
const showBook = ref(false)
const bookDate = ref('')
const bookPosition = ref('')
const bookStart = ref('')
const bookEnd = ref('')
const bookLoading = ref(false)

onMounted(() => load())

async function load() {
  try {
    const r = await api.get('/training/schedules', { params: { date: date.value } })
    schedules.value = r.data || []
  } catch {}
}

async function submitBook() {
  if (!bookDate.value || !bookStart.value || !bookEnd.value) return alert('请填写完整信息')
  bookLoading.value = true
  try {
    await api.post('/training/schedules', { date: bookDate.value, position: bookPosition.value, startTime: bookStart.value, endTime: bookEnd.value })
    alert('申请成功！')
    showBook.value = false
    load()
  } catch (e) { alert('申请失败: ' + e.message) }
  finally { bookLoading.value = false }
}
</script>

<style scoped>
.modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000; }
.modal { width:440px;max-width:90vw; }
</style>
