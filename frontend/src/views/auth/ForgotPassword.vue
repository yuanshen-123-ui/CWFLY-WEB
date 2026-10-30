<template>
  <div class="forgot-password fade-in">
    <div class="auth-card card p-lg">
      <h2 class="text-center mb-md">找回密码</h2>

      <div v-if="step === 1">
        <p class="text-sm text-muted mb-md">输入你的注册邮箱，我们将发送验证码。</p>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">邮箱</label>
          <input v-model="email" class="input" type="email" placeholder="your@email.com" />
        </div>
        <button class="btn btn-primary w-full" @click="sendCode" :disabled="sending">{{ sending ? '发送中...' : '发送验证码' }}</button>
        <p class="text-center mt-md"><router-link to="/login" class="text-sm">返回登录</router-link></p>
      </div>

      <div v-if="step === 2">
        <p class="text-sm text-muted mb-md">输入验证码和新密码。</p>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">验证码</label>
          <input v-model="code" class="input" placeholder="6位验证码" maxlength="6" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">新密码</label>
          <input v-model="newPassword" class="input" type="password" placeholder="新密码" />
        </div>
        <button class="btn btn-primary w-full" @click="resetPassword" :disabled="resetting">{{ resetting ? '重置中...' : '重置密码' }}</button>
      </div>

      <div v-if="step === 3" class="text-center">
        <div class="text-4xl mb-md">✅</div>
        <h3 class="mb-md">密码重置成功</h3>
        <p class="text-sm text-muted mb-md">请使用新密码登录。</p>
        <router-link to="/login" class="btn btn-primary">去登录</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import api from '@/api'

const step = ref(1)
const email = ref('')
const code = ref('')
const newPassword = ref('')
const sending = ref(false)
const resetting = ref(false)

async function sendCode() {
  if (!email.value) return alert('请输入邮箱')
  sending.value = true
  try {
    await api.post('/auth/forgot-password', { email: email.value })
    alert('验证码已发送到邮箱')
    step.value = 2
  } catch (e) { alert('发送失败: ' + e.message) }
  finally { sending.value = false }
}

async function resetPassword() {
  if (!code.value || !newPassword.value) return alert('请填写完整')
  resetting.value = true
  try {
    await api.post('/auth/reset-password', { email: email.value, code: code.value, password: newPassword.value })
    step.value = 3
  } catch (e) { alert('重置失败: ' + e.message) }
  finally { resetting.value = false }
}
</script>

<style scoped>
.forgot-password { display:flex;align-items:center;justify-content:center;min-height:80vh; }
.auth-card { width:400px;max-width:90vw; }
.w-full { width:100%; }
.text-4xl { font-size:3rem; }
</style>
