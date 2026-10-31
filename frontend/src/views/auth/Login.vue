<template>
  <div class="auth-page">
    <div class="auth-card card p-lg">
      <div class="text-center mb-lg">
        <router-link to="/portal" class="auth-logo">CWFLY</router-link>
        <p class="text-muted mt-sm">登录您的账号</p>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">CID</label>
          <input v-model="form.cid" class="input" :class="{ 'input-error': err }" placeholder="4位数字 CID" maxlength="4" pattern="\d{4}" required />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">密码</label>
          <input v-model="form.password" class="input" :class="{ 'input-error': err }" type="password" placeholder="输入密码" required />
        </div>

        <!-- 错误提示 -->
        <div v-if="err" class="error-banner">
          <span class="error-icon">✕</span>
          <span>{{ err }}</span>
        </div>

        <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <!-- 新设备/IP 登录二次验证：果冻弹出邮箱验证码框 -->
        <div v-if="showVerify" class="verify-wrap">
          <div class="verify-box">
            <p class="text-sm text-muted mb-sm">
              检测到新设备/IP 登录，为保障账号安全，请通过邮箱验证码确认身份
              <b>{{ maskedEmail }}</b>
            </p>
            <!-- H-1 加固：login 用途同样需通过 Cloudflare Turnstile 人机验证 -->
            <div ref="turnstileEl" class="turnstile-slot"></div>
            <div class="flex gap-sm mb-sm">
              <input v-model="verifyCode" class="input" placeholder="输入6位邮箱验证码" maxlength="6" style="flex:1;" />
              <button type="button" class="btn btn-outline btn-sm" @click="sendLoginCode" :disabled="sendingCode || codeCooldown > 0">
                {{ codeCooldown > 0 ? codeCooldown + 's' : sendingCode ? '发送中...' : '发送验证码' }}
              </button>
            </div>
            <button type="button" class="btn btn-primary btn-block" @click="confirmLoginVerify" :disabled="verifying">
              {{ verifying ? '验证中...' : '验证并登录' }}
            </button>
            <p v-if="verifyErr" class="text-xs mt-sm" style="color:var(--c-danger);">{{ verifyErr }}</p>
          </div>
        </div>
      </form>

      <div class="text-center mt-md text-sm text-muted">
        还没有账号？ <router-link to="/register">立即注册</router-link>
      </div>

      <p class="text-xs mt-sm text-muted" style="line-height:1.7;text-align:center;">登录即表示你已阅读并同意 <router-link to="/user-agreement">《用户协议》</router-link> 与 <router-link to="/privacy-policy">《隐私政策》</router-link></p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { authApi } from '@/api'
import { waitForPowToken } from '@/utils/pow'

const router = useRouter()
const userStore = useUserStore()
const form = ref({ cid: '', password: '' })
const err = ref('')
const loading = ref(false)

// ===== 新设备/IP 登录二次验证（邮箱验证码）=====
const showVerify = ref(false)   // 验证码框是否显示（果冻弹出）
const verifyEmail = ref('')     // 账号完整邮箱（用于发送验证码）
const verifyCode = ref('')      // 用户输入的邮箱验证码
const sendingCode = ref(false)
const codeCooldown = ref(0)
const verifying = ref(false)
const verifyErr = ref('')
let cooldownTimer = null

// ===== H-1 加固：Turnstile 人机验证（与注册页同一 Site Key；脚本由 index.html 全局引入）=====
const TURNSTILE_SITE_KEY = import.meta.env.DEV
  ? '1x00000000000000000000AA'   // 官方测试 key：总是通过（本地开发用）
  : '0x4AAAAAAEIZ2oKUUuMSozC2'  // 生产真实 Site Key
const turnstileEl = ref(null)
const turnstileToken = ref('')
let turnstileWidgetId = null
let tsPollTimer = null

/** 渲染 Turnstile widget（脚本可能尚未就绪 → 返回 false，由调用方轮询重试） */
function ensureTurnstile() {
  if (turnstileWidgetId != null) return true
  if (!window.turnstile || !turnstileEl.value) return false
  turnstileWidgetId = window.turnstile.render(turnstileEl.value, {
    sitekey: TURNSTILE_SITE_KEY,
    theme: 'light',
    callback: (token) => { turnstileToken.value = token },
    'expired-callback': () => { turnstileToken.value = '' },
    'error-callback': () => { turnstileToken.value = '' }
  })
  return true
}

/** 等待挑战完成拿到 token（含 index.html 脚本加载），超时返回 false */
function waitTurnstileToken(timeoutMs = 20000) {
  return new Promise((resolve) => {
    const started = Date.now()
    if (tsPollTimer) clearInterval(tsPollTimer)
    tsPollTimer = setInterval(() => {
      ensureTurnstile()
      if (turnstileToken.value) { clearInterval(tsPollTimer); tsPollTimer = null; resolve(true); return }
      if (Date.now() - started > timeoutMs) { clearInterval(tsPollTimer); tsPollTimer = null; resolve(false) }
    }, 300)
  })
}

/** token 一次性：siteverify 成功后重置 widget，便于下次点击重新取 token */
function resetTurnstile() {
  turnstileToken.value = ''
  if (turnstileWidgetId != null && window.turnstile) {
    try { window.turnstile.reset(turnstileWidgetId) } catch {}
  }
}

/** 脱敏邮箱用于展示，如 ab***@x.com */
const maskedEmail = computed(() => {
  const e = verifyEmail.value
  if (!e || !e.includes('@')) return ''
  const [name, domain] = e.split('@')
  return (name.slice(0, 2) + '***@' + domain)
})

async function handleLogin() {
  err.value = ''
  loading.value = true
  try {
    const res = await userStore.login(form.value.cid, form.value.password)
    // 新 IP 登录：后端要求邮箱验证码二次验证（不返回 token）
    if (res && res.needVerify) {
      verifyEmail.value = res.email || ''
      showVerify.value = true
      verifyErr.value = ''
      // 验证框渲染后立即初始化人机验证（后续发送验证码需要 token）
      nextTick(() => ensureTurnstile())
      // 自动发送一次验证码到邮箱（用户直接输入即可）
      sendLoginCode()
      return
    }
    router.push('/dashboard')
  } catch (e) {
    err.value = e.message || '登录失败，请检查 CID 和密码'
  } finally {
    loading.value = false
  }
}

/** 发送登录验证码到账号邮箱（purpose=login；H-1 加固后该用途同样强制人机验证，token 一次性） */
async function sendLoginCode() {
  verifyErr.value = ''
  if (!verifyEmail.value) { verifyErr.value = '无法获取账号邮箱'; return }
  sendingCode.value = true
  try {
    // 人机验证：无 token 时等待挑战完成（含脚本加载），超时则提示重试
    if (!turnstileToken.value) {
      ensureTurnstile()
      const ok = await waitTurnstileToken()
      if (!ok || !turnstileToken.value) { verifyErr.value = '人机验证未完成，请重试'; return }
    }
    // PoW：静默等待令牌（拿不到也照常发，由后端判定）
    const powToken = await waitForPowToken(2500)
    const res = await fetch('/api/verify/send', {
      method: 'POST',
      cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(powToken ? { 'X-PoW-Token': powToken } : {})
    },
      body: JSON.stringify({ email: verifyEmail.value, purpose: 'login', turnstileToken: turnstileToken.value })
    })
    const data = await res.json()
    // token 已被服务端 siteverify 消耗：无论成功失败都重置，下次点击重新取新 token
    resetTurnstile()
    if (!data.success) {
      // 服务器冷却中(429)：用返回的剩余秒数恢复倒计时（与注册页一致）
      if (data.cooldown) startCooldown(data.cooldown)
      verifyErr.value = data.message || '发送失败'
      return
    }
    startCooldown(data.cooldown || 60)
  } catch (e) { verifyErr.value = e.message || '发送失败' }
  finally { sendingCode.value = false }
}

/** 验证码按钮倒计时 */
function startCooldown(secs) {
  if (cooldownTimer) clearInterval(cooldownTimer)
  codeCooldown.value = secs
  cooldownTimer = setInterval(() => {
    codeCooldown.value--
    if (codeCooldown.value <= 0) { clearInterval(cooldownTimer); cooldownTimer = null }
  }, 1000)
}

/** 提交邮箱验证码：通过后签发 JWT 并跳转 */
async function confirmLoginVerify() {
  verifyErr.value = ''
  if (!verifyCode.value) { verifyErr.value = '请输入邮箱验证码'; return }
  verifying.value = true
  try {
    const res = await authApi.loginVerify({ cid: form.value.cid, emailCode: verifyCode.value })
    userStore.applyLogin(res.data)
    router.push('/dashboard')
  } catch (e) {
    verifyErr.value = e.message || '验证失败'
  } finally {
    verifying.value = false
  }
}

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
  if (tsPollTimer) clearInterval(tsPollTimer)
  if (turnstileWidgetId != null && window.turnstile) {
    try { window.turnstile.remove(turnstileWidgetId) } catch {}
  }
})
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-bg);
  padding: 24px;
}
.auth-card {
  width: 100%;
  max-width: 400px;
}
.auth-logo {
  font-size: 22px;
  font-weight: 800;
  color: var(--c-primary);
  text-decoration: none;
}
.auth-logo:hover { text-decoration: none; }

.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  border-left: 4px solid var(--c-danger, #ff453a);
  background: rgba(255, 69, 58, 0.08);
  font-size: 14px;
  color: var(--c-text);
  line-height: 1.5;
}
.error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--c-danger, #ff453a);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  flex-shrink: 0;
}

/* ===== 新设备/IP 二次验证框：果冻弹出 ===== */
.verify-wrap {
  margin-top: 16px;
  animation: loginJellyIn .5s cubic-bezier(.34, 1.56, .64, 1) both;
}
.verify-box {
  padding: 16px;
  border: 1px solid var(--c-border-light, rgba(128,128,128,.2));
  border-radius: 10px;
  background: var(--c-bg-soft, rgba(128,128,128,.06));
}
/* Turnstile 容器：未通过时占位（高度由 Cloudflare 决定），避免布局跳动 */
.turnstile-slot {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
  min-height: 65px;
}
@keyframes loginJellyIn {
  0%   { opacity: 0; transform: translateY(-16px) scaleY(.2); }
  55%  { opacity: 1; transform: translateY(3px) scaleY(1.06); }
  75%  { opacity: 1; transform: translateY(-1px) scaleY(.97); }
  100% { opacity: 1; transform: translateY(0) scaleY(1); }
}
</style>
