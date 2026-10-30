<template>
  <div class="admin-training fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>培训管理</h1>
        <p>管理课程、考试和培训记录</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showCreate = true">创建课程</button>
    </div>

    <div class="card p-lg mb-lg">
      <h3 class="mb-md">课程列表</h3>
      <div class="table-wrap">
        <table v-sort>
          <thead><tr><th>ID</th><th>标题</th><th>分类</th><th>难度</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="c in courses" :key="c.id">
              <td>{{ c.id }}</td><td>{{ c.title }}</td><td>{{ c.category || '-' }}</td>
              <td>{{ c.difficulty || '-' }}</td>
              <td>
                <button class="btn btn-outline btn-xs" @click="deleteCourse(c.id)">删除</button>
              </td>
            </tr>
            <tr v-if="!courses.length"><td colspan="5" class="text-center text-muted">暂无课程</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card p-lg">
      <h3 class="mb-md">培训记录</h3>
      <div class="table-wrap">
        <table v-sort>
          <thead><tr><th>用户</th><th>课程</th><th>状态</th><th>分数</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="r in records" :key="r.id">
              <td>{{ r.userId }}</td><td>{{ r.course?.title || '-' }}</td>
              <td><span class="badge" :class="r.status === 'completed' ? 'badge-success' : 'badge-warning'">{{ r.status }}</span></td>
              <td>{{ r.score || '-' }}</td>
              <td class="text-sm">{{ formatTime(r.createdAt) }}</td>
            </tr>
            <tr v-if="!records.length"><td colspan="5" class="text-center text-muted">暂无记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 创建课程 -->
    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal card p-lg">
        <h3 class="mb-md">创建课程</h3>
        <div class="mb-md"><input v-model="newCourse.title" class="input" placeholder="课程标题" /></div>
        <div class="mb-md"><input v-model="newCourse.category" class="input" placeholder="分类" /></div>
        <div class="mb-md">
          <select v-model="newCourse.difficulty" class="input">
            <option value="初级">初级</option><option value="中级">中级</option><option value="高级">高级</option>
          </select>
        </div>
        <div class="mb-md"><textarea v-model="newCourse.content" class="input" rows="4" placeholder="课程内容"></textarea></div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="createCourse" :disabled="createLoading">{{ createLoading ? '创建中...' : '创建' }}</button>
          <button class="btn btn-outline" @click="showCreate = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const courses = ref([])
const records = ref([])
const showCreate = ref(false)
const createLoading = ref(false)
const newCourse = ref({ title: '', category: '', difficulty: '初级', content: '' })

onMounted(() => { loadCourses(); loadRecords() })

async function loadCourses() {
  try { const r = await api.get('/admin/training/courses'); courses.value = r.data || [] } catch {}
}
async function loadRecords() {
  try { const r = await api.get('/admin/training/records'); records.value = r.data || [] } catch {}
}

async function createCourse() {
  if (!newCourse.value.title) return alert('请输入标题')
  createLoading.value = true
  try {
    await api.post('/admin/training/courses', newCourse.value)
    alert('创建成功！')
    showCreate.value = false
    newCourse.value = { title: '', category: '', difficulty: '初级', content: '' }
    loadCourses()
  } catch (e) { alert('创建失败: ' + e.message) }
  finally { createLoading.value = false }
}

async function deleteCourse(id) {
  if (!confirm('确定删除？')) return
  try { await api.delete('/admin/training/courses/' + id); loadCourses() } catch {}
}

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}
</script>

<style scoped>
.modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000; }
.modal { width:480px;max-width:90vw; }
</style>
