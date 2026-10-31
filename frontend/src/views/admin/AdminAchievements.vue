<template>
  <div class="admin-achievements fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>成就管理</h1>
        <p>管理平台成就系统</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showCreate = true">创建成就</button>
    </div>

    <div class="card p-lg">
      <div class="table-wrap">
        <table v-sort>
          <thead><tr><th>ID</th><th>图标</th><th>名称</th><th>描述</th><th>条件</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="a in achievements" :key="a.id">
              <td>{{ a.id }}</td><td>{{ a.icon || '🏆' }}</td><td>{{ a.name }}</td>
              <td class="text-sm">{{ a.description }}</td><td class="text-sm">{{ a.condition || '-' }}</td>
              <td><button class="btn btn-outline btn-xs" @click="deleteAchievement(a.id)">删除</button></td>
            </tr>
            <tr v-if="!achievements.length"><td colspan="6" class="text-center text-muted">暂无成就</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal card p-lg">
        <h3 class="mb-md">创建成就</h3>
        <div class="mb-md"><input v-model="newAch.name" class="input" placeholder="成就名称" /></div>
        <div class="mb-md"><input v-model="newAch.icon" class="input" placeholder="图标 (如 🏆)" /></div>
        <div class="mb-md"><input v-model="newAch.description" class="input" placeholder="描述" /></div>
        <div class="mb-md"><input v-model="newAch.condition" class="input" placeholder="解锁条件" /></div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="createAchievement" :disabled="createLoading">{{ createLoading ? '创建中...' : '创建' }}</button>
          <button class="btn btn-outline" @click="showCreate = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const achievements = ref([])
const showCreate = ref(false)
const createLoading = ref(false)
const newAch = ref({ name: '', icon: '🏆', description: '', condition: '' })

onMounted(async () => {
  try { const r = await api.get('/admin/achievements'); achievements.value = r.data || [] } catch { /* ignore */ }
})

async function createAchievement() {
  if (!newAch.value.name) return alert('请输入名称')
  createLoading.value = true
  try {
    await api.post('/admin/achievements', newAch.value)
    alert('创建成功！')
    showCreate.value = false
    newAch.value = { name: '', icon: '🏆', description: '', condition: '' }
    const r = await api.get('/admin/achievements')
    achievements.value = r.data || []
  } catch (e) { alert('创建失败: ' + e.message) }
  finally { createLoading.value = false }
}

async function deleteAchievement(id) {
  if (!confirm('确定删除？')) return
  try { await api.delete('/admin/achievements/' + id); const r = await api.get('/admin/achievements'); achievements.value = r.data || [] } catch { /* ignore */ }
}
</script>

<style scoped>
.modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000; }
.modal { width:480px;max-width:90vw; }
</style>
