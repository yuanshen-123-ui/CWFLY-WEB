<template>
  <div class="apply fade-in">
    <div class="page-header" style="text-align:center;">
      <h1>管制员申请</h1>
      <p>加入管制团队，为连飞活动提供服务</p>
    </div>

    <div class="card p-lg" style="max-width:600px; margin:0 auto;">
      <form @submit.prevent="submit">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">CID</label>
          <input v-model="form.cid" class="input" readonly />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">用户名</label>
          <input v-model="form.name" class="input" readonly />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">申请部门</label>
          <select v-model="form.department" class="input" required>
            <option value="">请选择</option>
            <option value="区调管制">区调管制</option>
            <option value="进近管制">进近管制</option>
            <option value="塔台管制">塔台管制</option>
            <option value="地面管制">地面管制</option>
          </select>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">申请理由</label>
          <textarea v-model="form.reason" class="input" rows="4" placeholder="请描述您的飞行经历、管制经验等..." required></textarea>
        </div>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? '提交中...' : '提交申请' }}
        </button>
        <p v-if="msg" class="text-sm mt-sm" :style="{ color: msgType === 'ok' ? 'var(--c-success)' : 'var(--c-danger)' }">{{ msg }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { applyApi } from '@/api'

const user = computed(() => {
  try { return JSON.parse(localStorage.getItem('cw_user')) }
  catch { return null }
})

const form = ref({ cid: user.value?.cid || '', name: user.value?.username || '', department: '', reason: '' })
const loading = ref(false)
const submitted = ref(false)
const msg = ref('')
const msgType = ref('ok')
const router = useRouter()

async function submit() {
  if (submitted.value) return
  loading.value = true
  submitted.value = true
  msg.value = ''
  try {
    await applyApi.controller(form.value)
    msg.value = '✅ 申请已提交成功，请等待通知'
    msgType.value = 'ok'
    // 2秒后跳转到仪表盘
    setTimeout(() => router.push('/dashboard'), 2000)
  } catch (e) {
    msg.value = e.message
    msgType.value = 'err'
    submitted.value = false
  } finally {
    loading.value = false
  }
}
</script>
