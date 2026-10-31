<template>
  <div class="forgot-password fade-in">
    <div class="auth-card card p-lg">
      <h2 class="text-center mb-md">找回密码</h2>

      <div v-if="step === 1">
        <p class="text-sm text-muted mb-md">输入你的注册邮箱，我们将发送验证码。</p>
        <FormField label="邮箱" required for-id="fp-email" :error="fb.errors.email" :shake="fb.shaking.email" @animationend="fb.shaking.email = false">
          <input id="fp-email" v-model="email" class="input" type="email" placeholder="your@email.com" autocomplete="email" :aria-invalid="!!fb.errors.email" @input="fb.input('email')" />
        </FormField>
        <div v-if="err" class="alert alert-err">{{ err }}</div>
        <button class="btn btn-primary w-full" @click="sendCode" :disabled="sending">{{ sending ? '发送中...' : '发送验证码' }}</button>
        <p class="text-center mt-md"><router-link to="/login" class="text-sm">返回登录</router-link></p>
      </div>

      <div v-if="step === 2">
        <p class="text-sm text-muted mb-md">输入验证码和新密码。</p>
        <FormField label="验证码" required for-id="fp-code" :error="fb.errors.code">
          <input id="fp-code" v-model="code" class="input" placeholder="6 位验证码" maxlength="6" inputmode="numeric" autocomplete="one-time-code" @input="fb.input('code')" />
        </FormField>
        <FormField label="新密码" required for-id="fp-pwd" :error="fb.errors.password" hint="8-64 位，须同时包含字母和数字">
          <input id="fp-pwd" v-model="newPassword" class="input" type="password" placeholder="新密码" autocomplete="new-password" @input="fb.input('password')" />
        </FormField>
        <div v-if="err" class="alert alert-err">{{ err }}</div>
        <button class="btn btn-primary w-full" @click="resetPassword" :disabled="resetting">{{ resetting ? '重置中...' : '重置密码' }}</button>
      </div>

      <div v-if="step === 3" class="text-center">
        <div class="text-4xl mb-md">✓</div>
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
import { useFieldFeedback } from '@/utils/fieldFeedback'

const step = ref(1)
const email = ref('')
const code = ref('')
const newPassword = ref('')
const sending = ref(false)
const resetting = ref(false)
const err = ref('')
const fb = useFieldFeedback(['email', 'code', 'password'])

async function sendCode() {
  err.value = ''
  fb.clearAll()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value)) return fb.fail('email', '请输入正确的邮箱地址')
  sending.value = true
  try {
    await api.post('/auth/forgot-password', { email: email.value })
    step.value = 2
  } catch (e) { err.value = e.message || '发送失败' }
  finally { sending.value = false }
}

async function resetPassword() {
  err.value = ''
  if (!code.value) return fb.fail('code', '请输入验证码')
  if (!newPassword.value) return fb.fail('password', '请输入新密码')
  resetting.value = true
  try {
    await api.post('/auth/reset-password', { email: email.value, code: code.value, password: newPassword.value })
    step.value = 3
  } catch (e) { err.value = e.message || '重置失败' }
  finally { resetting.value = false }
}
</script>

<style scoped>
.forgot-password { display:flex;align-items:center;justify-content:center;min-height:80vh; }
.auth-card { width:400px;max-width:90vw; }
.w-full { width:100%; }
.text-4xl { font-size:3rem; }
</style>
