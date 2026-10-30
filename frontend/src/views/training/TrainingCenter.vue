<template>
  <div class="training fade-in">
    <div class="page-header">
      <h1>培训中心</h1>
      <p>课程学习和考核</p>
    </div>

    <div class="card p-lg mb-lg">
      <h3 class="mb-md">可用课程</h3>
      <div v-for="c in courses" :key="c.id" class="course-item flex justify-between items-center p-md">
        <div>
          <h4 class="font-bold text-sm">{{ c.title }}</h4>
          <p class="text-xs text-muted">{{ c.category }} · {{ c.difficulty || '初级' }}</p>
        </div>
        <button class="btn btn-outline btn-sm" @click="enroll(c)" :disabled="enrolling === c.id">
          {{ enrolling === c.id ? '报名中...' : '报名' }}
        </button>
      </div>
      <div v-if="!courses.length" class="text-center text-muted p-md">暂无课程</div>
    </div>

    <div class="card p-lg">
      <h3 class="mb-md">我的培训记录</h3>
      <div v-for="r in records" :key="r.id" class="record-item p-md">
        <div class="flex justify-between items-center">
          <div>
            <span class="font-bold text-sm">{{ r.course?.title || '课程' }}</span>
            <span class="badge ml-sm" :class="r.status === 'completed' ? 'badge-success' : r.status === 'in_progress' ? 'badge-info' : 'badge-warning'">
              {{ r.status === 'completed' ? '已完成' : r.status === 'in_progress' ? '进行中' : '未开始' }}
            </span>
          </div>
          <span class="text-xs text-muted">{{ r.score ? r.score + '分' : '' }}</span>
        </div>
        <p class="text-xs text-muted mt-sm">{{ formatTime(r.createdAt) }}</p>
      </div>
      <div v-if="!records.length" class="text-center text-muted p-md">暂无培训记录</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const courses = ref([])
const records = ref([])
const enrolling = ref(null)

onMounted(async () => {
  try { const r = await api.get('/training/courses'); courses.value = r.data || [] } catch {}
  try { const r = await api.get('/training/records'); records.value = r.data || [] } catch {}
})

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

async function enroll(c) {
  enrolling.value = c.id
  try {
    await api.post('/training/courses/' + c.id + '/enroll')
    alert('报名成功！')
  } catch (e) { alert('报名失败: ' + e.message) }
  finally { enrolling.value = null }
}
</script>

<style scoped>
.course-item, .record-item { border-bottom:1px solid var(--c-border-light); }
.course-item:last-child, .record-item:last-child { border-bottom:none; }
</style>
