<template>
  <div class="auth-page">
    <div class="auth-card card p-lg" style="text-align:center;">
      <div class="auth-logo" style="font-size:24px;font-weight:800;color:var(--c-primary);margin-bottom:8px;">CWFLY</div>
      <p class="text-muted mb-lg">授权登录 ATC 管制员中心</p>

      <!-- 已有登录状态：需用户显式确认才授权(2026-10-25 审计 P0-2: 此前打开页面即自动携 token 跳转) -->
      <div v-if="checking" class="text-sm text-muted">验证登录状态...</div>
      <div v-else-if="token && !granted" class="mt-lg">
        <p class="mb-md text-sm">即将向 <b>{{ getRedirectUri() }}</b> 授权您的 CWFLY 登录凭证。</p>
        <p class="mb-lg text-sm text-muted">请确认这是您本人发起的操作。</p>
        <button class="btn btn-primary btn-block" @click="grant">确认授权</button>
        <button class="btn btn-block mt-sm" @click="cancel">取消</button>
      </div>

      <!-- 未登录：显示登录表单 -->
      <form v-else-if="!token" @submit.prevent="handleLogin">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">CID</label>
          <input v-model="form.cid" class="input" placeholder="4位数字 CID" maxlength="4" required />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">密码</label>
          <input v-model="form.password" class="input" type="password" placeholder="输入密码" required />
        </div>
        <div v-if="err" class="error-banner mb-md"><span>{{ err }}</span></div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
          {{ loading ? '登录中...' : '登录并授权' }}
        </button>
      </form>

      <!-- 跳转中 -->
      <div v-else class="text-sm text-success">授权成功，正在跳转...</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '@/api/index.js'

const route = useRoute()
const router = useRouter()
const token = ref('')
const checking = ref(true)
const loading = ref(false)
const err = ref('')
const granted = ref(false)

function grant() {
  granted.value = true
  const redirect = getRedirectUri()
  window.location.href = `${redirect}?token=${encodeURIComponent(token.value)}`
}
function cancel() { router.push('/') }
const form = ref({ cid: '', password: '' })

// 受信任的重定向地址白名单
const ALLOWED_REDIRECTS = [
  'http://localhost:5176/oauth/callback',
  'http://localhost:5173/oauth/callback',
  'https://cwflysim.cn/oauth/callback',
  'https://atc.cwflysim.cn/oauth/callback',
  'https://www.cwflysim.cn/oauth/callback',
]

function getRedirectUri() {
  const uri = route.query.redirect_uri || route.query.redirect || ''
  // 仅允许白名单中的地址
  if (ALLOWED_REDIRECTS.includes(uri)) return uri
  return 'http://localhost:5176/oauth/callback'
}

onMounted(() => {
  // 检查是否已登录
  const savedToken = localStorage.getItem('cw_token')
  const savedUser = localStorage.getItem('cw_user')
  if (savedToken && savedUser) {
    token.value = savedToken
    checking.value = false   // 等待用户显式点击「确认授权」
  } else {
    checking.value = false
  }
})

async function handleLogin() {
  if (!form.value.cid || !form.value.password) { err.value = '请填写 CID 和密码'; return }
  loading.value = true; err.value = ''
  try {
    const res = await authApi.login({ cid: form.value.cid, password: form.value.password })
    token.value = res.data.token
    // 保存到 localStorage 以便下次自动登录
    localStorage.setItem('cw_token', res.data.token)
    localStorage.setItem('cw_user', JSON.stringify(res.data.user))
    granted.value = true
    const redirect = getRedirectUri()
    window.location.href = `${redirect}?token=${encodeURIComponent(res.data.token)}`
  } catch (e) { err.value = e.message || '登录失败' }
  finally { loading.value = false }
}
</script>
