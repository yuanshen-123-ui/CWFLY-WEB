<template>
  <div class="admin-notifications fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>通知管理</h1>
        <p>管理系统通知</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showCreate = true">发送通知</button>
    </div>

    <div class="card p-lg">
      <!-- 加载态 Skeleton / 空态 EmptyState -->
      <div v-if="loading" aria-busy="true" aria-label="正在加载通知列表">
        <Skeleton :lines="6" :height="16" />
      </div>
      <div v-else-if="!notifications.length">
        <EmptyState icon="bell" title="暂无通知" description="还没有发送过系统通知，点击右上角「发送通知」创建第一条。" />
      </div>
      <div v-else class="table-wrap">
        <table v-sort>
          <thead>
            <tr><th>ID</th><th>用户</th><th>类型</th><th>标题</th><th>已读</th><th>时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="n in notifications" :key="n.id">
              <td>{{ n.id }}</td><td>{{ n.userId }}</td>
              <td><span class="badge badge-info">{{ n.type }}</span></td>
              <td>{{ n.title }}</td>
              <td>{{ n.read ? '是' : '否' }}</td>
              <td class="text-sm">{{ formatTime(n.createdAt) }}</td>
              <td><button class="btn btn-outline btn-xs" @click="deleteNotif(n.id)">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 创建通知弹窗：AppModal 统一 Teleport / Esc / 焦点迁移与还原 / 滚动锁 -->
    <AppModal
      v-model:open="showCreate"
      title="发送通知"
      width="480px"
    >
      <div class="mb-md">
        <label class="text-sm font-bold mb-sm" style="display:block;">目标用户CID（留空为全部）</label>
        <input v-model="newNotif.userId" class="input" placeholder="留空发送给所有用户" />
      </div>
      <div class="mb-md">
        <label class="text-sm font-bold mb-sm" style="display:block;">类型</label>
        <SelectMenu v-model="newNotif.type" :options="[{ value: 'system', label: '系统通知' }, { value: 'event', label: '活动通知' }, { value: 'forum', label: '论坛通知' }, { value: 'training', label: '培训通知' }]" />
      </div>
      <div class="mb-md">
        <label class="text-sm font-bold mb-sm" style="display:block;">标题</label>
        <input v-model="newNotif.title" class="input" placeholder="通知标题" />
      </div>
      <div>
        <label class="text-sm font-bold mb-sm" style="display:block;">内容</label>
        <textarea v-model="newNotif.content" class="input" rows="3" placeholder="通知内容"></textarea>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="showCreate = false">取消</button>
        <button class="btn btn-primary" @click="createNotif" :disabled="createLoading">{{ createLoading ? '发送中...' : '发送' }}</button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'
import AppModal from '@/components/base/AppModal.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import Skeleton from '@/components/base/Skeleton.vue'

const notifications = ref([])
const loading = ref(false)
const showCreate = ref(false)
const createLoading = ref(false)
const newNotif = ref({ userId: '', type: 'system', title: '', content: '' })

onMounted(() => load())

async function load() {
  loading.value = true
  try { const r = await api.get('/admin/notifications'); notifications.value = r.data || [] } catch { /* ignore */ } finally {
    loading.value = false
  }
}

async function createNotif() {
  if (!newNotif.value.title) return alert('请输入标题')
  createLoading.value = true
  try {
    await api.post('/admin/notifications', newNotif.value)
    alert('发送成功！')
    showCreate.value = false
    newNotif.value = { userId: '', type: 'system', title: '', content: '' }
    load()
  } catch (e) { alert('发送失败: ' + e.message) }
  finally { createLoading.value = false }
}

async function deleteNotif(id) {
  if (!confirm('确定删除？')) return
  try { await api.delete('/admin/notifications/' + id); load() } catch { /* ignore */ }
}

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}
</script>
