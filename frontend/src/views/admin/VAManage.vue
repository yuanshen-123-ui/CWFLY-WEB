<template>
  <div class="admin-page fade-in">
    <div class="page-header">
      <h1>管理 VA</h1>
      <p>管理虚拟航空公司信息</p>
    </div>

    <div class="card p-lg">
      <div style="max-width:500px;">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">VA 名称</label>
          <input v-model="form.name" class="input" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">网站</label>
          <input v-model="form.website" class="input" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">描述</label>
          <textarea v-model="form.description" class="input" rows="4" style="resize:vertical;"></textarea>
        </div>
        <div class="mb-md p-md" style="background:var(--c-bg);border-radius:var(--radius-sm);">
          <div class="flex justify-between mb-sm"><span class="text-muted">ICAO</span><span class="font-bold">{{ va.icao }}</span></div>
          <div class="flex justify-between mb-sm"><span class="text-muted">成立时间</span><span>{{ va.founded }}</span></div>
          <div class="flex justify-between mb-sm"><span class="text-muted">成员数</span><span>{{ va.members }}</span></div>
          <div class="flex justify-between mb-sm"><span class="text-muted">总航班数</span><span>{{ va.flights }}</span></div>
          <div class="flex justify-between"><span class="text-muted">总飞行小时</span><span>{{ va.hours }}</span></div>
        </div>
        <button class="btn btn-primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '@/api'

const va = ref({})
const form = ref({ name: '', website: '', description: '' })

onMounted(async () => {
  try {
    const res = await adminApi.va()
    va.value = res.data
    form.value = { name: res.data.name, website: res.data.website, description: res.data.description }
  } catch { /* ignore */ }
})

async function save() {
  try {
    await adminApi.updateVA(form.value)
    Object.assign(va.value, form.value)
    alert('VA 信息已更新')
  } catch (e) { alert(e.message) }
}
</script>
