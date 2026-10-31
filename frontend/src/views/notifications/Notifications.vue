<template>
  <div class="notifications fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>通知中心</h1>
        <p>查看系统通知和消息</p>
      </div>
      <div class="flex gap-sm">
        <span class="badge badge-info" v-if="unreadCount > 0">{{ unreadCount }} 条未读</span>
        <button class="btn btn-outline btn-sm" @click="markAllRead" v-if="unreadCount > 0">全部已读</button>
      </div>
    </div>

    <div class="card p-lg">
      <div v-for="n in notifications" :key="n.id" class="notification-item flex justify-between items-start p-md" :class="{ unread: !n.read }" @click="markRead(n)">
        <div class="flex-1">
          <div class="flex gap-sm items-center mb-sm">
            <span class="badge" :class="typeBadge(n.type)">{{ n.type }}</span>
            <span class="font-bold">{{ n.title }}</span>
          </div>
          <p class="text-sm text-muted">{{ n.content }}</p>
          <p class="text-xs text-muted mt-sm">{{ formatTime(n.createdAt) }}</p>
        </div>
        <span v-if="!n.read" class="dot"></span>
      </div>
      <div v-if="!notifications.length" class="text-center text-muted p-lg">暂无通知</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const notifications = ref([])
const unreadCount = ref(0)

onMounted(async () => {
  try {
    const r = await api.get('/notifications')
    notifications.value = r.data.items || []
    unreadCount.value = r.data.unread || 0
  } catch (e) { console.error(e) }
})

function typeBadge(t) {
  const m = { system: 'badge-info', event: 'badge-success', forum: 'badge-warning', training: 'badge-primary', achievement: 'badge-info' }
  return m[t] || 'badge-default'
}

function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

async function markRead(n) {
  if (n.read) return
  try { await api.put('/notifications/read/' + n.id); n.read = true; unreadCount.value-- } catch { /* ignore */ }
}

async function markAllRead() {
  try { await api.put('/notifications/read-all'); notifications.value.forEach(n => n.read = true); unreadCount.value = 0 } catch { /* ignore */ }
}
</script>

<style scoped>
.notification-item { cursor: pointer; border-bottom: 1px solid var(--c-border-light); transition: background .2s; }
.notification-item:hover { background: var(--c-bg-hover); }
.notification-item.unread { background: var(--c-bg-subtle); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c-primary); flex-shrink: 0; }
</style>
