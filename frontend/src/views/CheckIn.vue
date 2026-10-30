<template>
  <div class="checkin fade-in">
    <div class="page-header">
      <h1>活动签到</h1>
      <p>为参加的活动签到</p>
    </div>

    <div class="card p-lg mb-lg">
      <h3 class="mb-md">签到</h3>
      <div class="flex gap-sm items-end flex-wrap">
        <div style="flex:1;min-width:200px;">
          <label class="text-sm text-muted mb-sm" style="display:block;">选择活动</label>
          <select v-model="selectedEvent" class="input">
            <option value="" disabled>请选择活动</option>
            <option v-for="e in events" :key="e.id" :value="e.id">{{ e.title }}</option>
          </select>
        </div>
        <button class="btn btn-primary" @click="doCheckin" :disabled="!selectedEvent">签到</button>
      </div>
      <p v-if="msg" class="text-sm mt-sm" :style="{ color: msgType === 'ok' ? 'var(--c-success)' : 'var(--c-danger)' }">{{ msg }}</p>
    </div>

    <div class="card p-lg">
      <h3 class="mb-md">签到历史</h3>
      <div class="table-wrap">
        <table v-sort>
          <thead><tr><th>活动名称</th><th>签到时间</th></tr></thead>
          <tbody>
            <tr v-for="h in history" :key="h.id">
              <td>{{ h.eventTitle }}</td>
              <td class="text-sm text-muted">{{ h.time }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!history.length" class="text-center text-muted mt-md">暂无签到记录</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { checkinApi, eventsApi } from '@/api'

const selectedEvent = ref('')
const msg = ref('')
const msgType = ref('ok')
const history = ref([])
const events = ref([])

onMounted(async () => {
  try {
    const [evRes, histRes] = await Promise.all([eventsApi.list(), checkinApi.history()])
    events.value = evRes.data
    history.value = histRes.data
  } catch { /* ignore */ }
})

async function doCheckin() {
  if (!selectedEvent.value) return
  try {
    await checkinApi.do(selectedEvent.value)
    msg.value = '签到成功！'
    msgType.value = 'ok'
    const histRes = await checkinApi.history()
    history.value = histRes.data
  } catch (e) {
    msg.value = e.message || '签到失败'
    msgType.value = 'err'
  }
}
</script>
