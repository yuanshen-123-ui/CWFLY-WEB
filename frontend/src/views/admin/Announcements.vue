<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>公告管理</h1>
        <p>发布和管理平台公告</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showForm=true">+ 发布公告</button>
    </div>

    <!-- 发布/编辑表单 -->
    <div v-if="showForm" class="card p-lg mb-lg">
      <h3 class="mb-md">{{ editingItem ? '编辑公告' : '发布公告' }}</h3>
      <div style="max-width:600px;">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">标题</label>
          <input v-model="form.title" class="input" placeholder="公告标题" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">内容</label>
          <textarea v-model="form.content" class="input" rows="5" placeholder="公告内容" style="resize:vertical;"></textarea>
        </div>
        <div class="mb-md flex items-center gap-sm">
          <CheckBox :model-value="form.pinned" @update:model-value="form.pinned = $event" id="pinned" />
          <label for="pinned" class="text-sm">置顶公告</label>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitForm">{{ editingItem ? '保存' : '发布' }}</button>
          <button class="btn btn-outline" @click="cancelForm">取消</button>
        </div>
      </div>
    </div>

    <!-- 公告列表 -->
    <div class="card">
      <div class="table-wrap">
        <table v-sort="{ index: 2, desc: true }">
          <thead>
            <tr>
              <th>标题</th>
              <th>发布人</th>
              <th>时间</th>
              <th>置顶</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in list" :key="a.id">
              <td class="font-bold">{{ a.title }}</td>
              <td>{{ a.publisher }}</td>
              <td class="text-muted text-sm">{{ a.time }}</td>
              <td><span class="badge" :class="a.pinned ? 'badge-warning' : 'badge-default'">{{ a.pinned ? '置顶' : '普通' }}</span></td>
              <td>
                <div class="flex gap-sm">
                  <button class="btn btn-outline btn-sm" @click="editItem(a)">编辑</button>
                  <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delItem(a)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="5" class="text-center text-muted">暂无公告</td>
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

const list = ref([])
const showForm = ref(false)
const editingItem = ref(null)
const form = ref({ title: '', content: '', pinned: false })

onMounted(async () => {
  try {
    const res = await adminApi.announcements()
    list.value = res.data
  } catch { /* ignore */ }
})

function cancelForm() {
  showForm.value = false
  editingItem.value = null
  form.value = { title: '', content: '', pinned: false }
}

function editItem(a) {
  editingItem.value = a
  form.value = { title: a.title, content: a.content, pinned: a.pinned }
  showForm.value = true
}

async function submitForm() {
  if (!form.value.title || !form.value.content) return alert('请填写标题和内容')
  try {
    if (editingItem.value) {
      await adminApi.updateAnnouncement(editingItem.value.id, form.value)
      Object.assign(editingItem.value, form.value)
    } else {
      const res = await adminApi.createAnnouncement(form.value)
      list.value.unshift(res.data)
    }
    cancelForm()
  } catch (e) { alert(e.message) }
}

async function delItem(a) {
  if (!confirm(`确定删除公告"${a.title}"？`)) return
  try {
    await adminApi.deleteAnnouncement(a.id)
    list.value = list.value.filter(x => x.id !== a.id)
  } catch (e) { alert(e.message) }
}
</script>
