<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>管理论坛</h1>
      <p>管理论坛帖子，支持置顶、锁定和删除</p>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>标题</th>
              <th>作者</th>
              <th>版块</th>
              <th>回复</th>
              <th>浏览</th>
              <th>时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in posts" :key="p.id">
              <td class="font-bold">{{ p.title }}</td>
              <td>{{ p.author }}</td>
              <td class="text-sm text-muted">{{ p.board }}</td>
              <td>{{ p.replies }}</td>
              <td>{{ p.views }}</td>
              <td class="text-muted text-sm">{{ p.time }}</td>
              <td>
                <span v-if="p.pinned" class="badge badge-warning">置顶</span>
                <span v-if="p.locked" class="badge badge-danger">锁定</span>
                <span v-if="!p.pinned && !p.locked" class="badge badge-default">正常</span>
              </td>
              <td>
                <div class="flex gap-sm">
                  <button v-if="!p.pinned" class="btn btn-outline btn-sm" @click="togglePin(p)">置顶</button>
                  <button v-else class="btn btn-outline btn-sm" @click="togglePin(p)">取消置顶</button>
                  <button v-if="!p.locked" class="btn btn-outline btn-sm" @click="toggleLock(p)">锁定</button>
                  <button v-else class="btn btn-outline btn-sm" @click="toggleLock(p)">解锁</button>
                  <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delPost(p)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!posts.length">
              <td colspan="8" class="text-center text-muted">暂无帖子</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '@/api'

const posts = ref([])

onMounted(async () => {
  try {
    const res = await adminApi.forum()
    posts.value = res.data
  } catch { /* ignore */ }
})

async function togglePin(p) {
  try {
    await adminApi.updateForumPost(p.id, { pinned: !p.pinned })
    p.pinned = !p.pinned
  } catch (e) { alert(e.message) }
}

async function toggleLock(p) {
  try {
    await adminApi.updateForumPost(p.id, { locked: !p.locked })
    p.locked = !p.locked
  } catch (e) { alert(e.message) }
}

async function delPost(p) {
  if (!confirm(`确定删除帖子"${p.title}"？`)) return
  try {
    await adminApi.deleteForumPost(p.id)
    posts.value = posts.value.filter(x => x.id !== p.id)
  } catch (e) { alert(e.message) }
}
</script>
