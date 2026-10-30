<template>
  <div class="apply fade-in">
    <div class="page-header" style="text-align:center;">
      <h1>职员申请</h1>
      <p>加入平台管理团队</p>
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
            <option value="管理部">管理部</option>
            <option value="活动部">活动部</option>
            <option value="技术部">技术部</option>
            <option value="宣传部">宣传部</option>
            <option value="人事部">人事部</option>
          </select>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">申请理由</label>
          <textarea v-model="form.reason" class="input" rows="4" placeholder="请描述您的优势和期望..." required></textarea>
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
    await applyApi.staff(form.value)
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
