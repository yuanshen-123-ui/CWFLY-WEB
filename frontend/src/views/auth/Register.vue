<template>
  <div class="auth-page">
    <div class="auth-card card p-lg">
      <div class="text-center mb-lg">
        <router-link to="/portal" class="auth-logo">CWFLY</router-link>
        <p class="text-muted mt-sm">注册新账号</p>
      </div>

      <form @submit.prevent="handleRegister" novalidate>
        <FormField label="CID" required for-id="reg-cid" :error="errors.cid" :hint="cidOk ? '该 CID 可用' : '4 位数字，注册后不可修改'">
          <div class="input-row">
            <input
              id="reg-cid" v-model="form.cid" class="input" style="flex:1;"
              inputmode="numeric" maxlength="4" placeholder="4 位数字 CID"
              autocomplete="username" aria-required="true"
              :aria-invalid="!!errors.cid" @input="onCidInput"
            />
            <button type="button" class="btn btn-outline btn-sm" @click="randomCid" :disabled="checkingCid || randomLocked">随机</button>
          </div>
          <p v-if="randomLimitMsg" class="hint err">{{ randomLimitMsg }}</p>
        </FormField>

        <FormField label="用户名" required for-id="reg-username" :error="errors.username">
          <input id="reg-username" v-model="form.username" class="input" placeholder="输入用户名" autocomplete="nickname" aria-required="true" :aria-invalid="!!errors.username" />
        </FormField>

        <FormField label="邮箱" required for-id="reg-email" :error="errors.email">
          <div class="input-row">
            <input id="reg-email" v-model="form.email" class="input" type="email" placeholder="your@email.com" autocomplete="email" aria-required="true" :aria-invalid="!!errors.email" style="flex:1;" />
            <button type="button" class="btn btn-outline btn-sm" @click="sendEmailCode" :disabled="sendingCode || codeCooldown > 0">
              {{ codeCooldown > 0 ? codeCooldown + 's' : sendingCode ? '发送中...' : '发送验证码' }}
            </button>
          </div>
        </FormField>

        <FormField label="邮箱验证码" required for-id="reg-code">
          <input id="reg-code" v-model="form.emailCode" class="input" placeholder="输入 6 位验证码" maxlength="6" inputmode="numeric" autocomplete="one-time-code" aria-required="true" />
        </FormField>

        <FormField label="密码" required for-id="reg-pwd" :error="errors.password" hint="8-64 位，须同时包含字母和数字">
          <input id="reg-pwd" v-model="form.password" class="input" type="password" placeholder="设置密码" autocomplete="new-password" aria-required="true" :aria-invalid="!!errors.password" />
        </FormField>

        <FormField label="确认密码" required for-id="reg-confirm" :error="errors.confirm">
          <input id="reg-confirm" v-model="form.confirm" class="input" type="password" placeholder="再次输入密码" autocomplete="new-password" aria-required="true" :aria-invalid="!!errors.confirm" />
        </FormField>

        <FormField :error="agreeError">
          <label class="agree-row">
            <CheckBox v-model="agree" id="reg-agree" />
            <span class="text-sm">
              我已阅读并同意
              <router-link to="/user-agreement" target="_blank">《用户协议》</router-link> 与
              <router-link to="/privacy-policy" target="_blank">《隐私政策》</router-link>
            </span>
          </label>
        </FormField>

        <div v-if="err" class="alert alert-err">{{ err }}</div>

        <SubmitButton :status="loading ? 'loading' : 'idle'" label="注 册" />
      </form>

      <div class="text-center mt-md text-sm text-muted">
        已有账号？<router-link to="/login">去登录</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { waitForPowToken } from '@/utils/pow'

const router = useRouter()
const userStore = useUserStore()
const form = ref({ cid: '', username: '', password: '', confirm: '', email: '', emailCode: '', captcha: '' })
const agree = ref(false)
const agreeError = ref('')
const errors = reactive({})
const err = ref('')
const loading = ref(false)
const checkingCid = ref(false)
const cidOk = ref(false)

// 反滥用：完全由本地 PoW（src/components/PoWCaptcha.vue）承担，不再引入第三方人机验证服务
onUnmounted(() => {
  if (randomLimitTimer) clearInterval(randomLimitTimer)
})

watch(agree, (v) => { if (v) agreeError.value = '' })

let cidCheckTimer = null

// 数字验证
const captchaExpr = ref('')
const sendingCode = ref(false)
const codeCooldown = ref(0)
let cooldownTimer = null

// ===== 随机 CID 限制：1 分钟窗口内最多随机 10 次 =====
const RANDOM_MAX = 10
const RANDOM_WINDOW_MS = 60 * 1000
let randomTimes = []          // 记录当前 1 分钟窗口内的随机时间戳
const randomLocked = ref(false) // 达到上限后锁定按钮
const randomLimitMsg = ref('')  // 上限提示文案（含剩余秒数）
let randomLimitTimer = null     // 上限倒计时定时器

/**
 * startRandomLock()
 * 作用：随机 CID 达到 1 分钟上限时锁定按钮并显示剩余等待秒数（最早记录过期后解锁）。
 * 调用时机：randomCid() 判断窗口内已达上限(10 次)时调用。
 */
function startRandomLock() {
  randomLocked.value = true
  const tick = () => {
    const remain = Math.ceil((randomTimes[0] + RANDOM_WINDOW_MS - Date.now()) / 1000)
    if (remain <= 0) {
      clearInterval(randomLimitTimer); randomLimitTimer = null
      randomLocked.value = false
      randomLimitMsg.value = ''
      randomTimes = randomTimes.filter(t => Date.now() - t < RANDOM_WINDOW_MS)
    } else {
      randomLimitMsg.value = `1分钟内最多随机 ${RANDOM_MAX} 次，请 ${remain} 秒后重试`
    }
  }
  if (randomLimitTimer) clearInterval(randomLimitTimer)
  tick()
  randomLimitTimer = setInterval(tick, 1000)
}

/**
 * randomCid()
 * 作用：随机生成 4 位 CID，逐个调用 /api/auth/check-cid 校验可用性，找到可用值填入表单；1 分钟内最多随机 10 次。
 * 调用时机：用户点击 CID 输入框旁的「随机」按钮时触发。
 */
async function randomCid() {
  // ===== 1 分钟窗口内最多随机 10 次 =====
  const now = Date.now()
  randomTimes = randomTimes.filter(t => now - t < RANDOM_WINDOW_MS)
  if (randomTimes.length >= RANDOM_MAX) {
    startRandomLock()
    return
  }
  randomTimes.push(now)
  randomLimitMsg.value = ''
  checkingCid.value = true
  cidOk.value = false
  for (let attempt = 0; attempt < 8; attempt++) {
    const cid = String(Math.floor(1000 + Math.random() * 9000))
    try {
      const res = await fetch('/api/auth/check-cid?cid=' + cid)
      const data = await res.json()
      if (!data.exists) {
        form.value.cid = cid
        cidOk.value = true
        break
      }
    } catch { break }
  }
  checkingCid.value = false
}

/**
 * onCidInput()
 * 作用：CID 输入满 4 位数字时防抖 500ms 调用 /api/auth/check-cid 检查是否被占用，并更新占用提示/可用状态。
 * 调用时机：CID 输入框每次输入（@input）时触发。
 */
function onCidInput() {
  cidOk.value = false
  if (cidCheckTimer) clearTimeout(cidCheckTimer)
  if (form.value.cid.length === 4 && /^\d{4}$/.test(form.value.cid)) {
    cidCheckTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/check-cid?cid=' + form.value.cid)
        const data = await res.json()
        if (data.exists) errors.cid = '该 CID 已被注册'
        else { errors.cid = ''; cidOk.value = true }
      } catch {}
    }, 500)
  }
}

/**
 * sendEmailCode()
 * 作用：校验邮箱与人机验证后，调用 POST /api/verify/send 发送邮箱验证码；
 *       成功后按服务器返回的冷却秒数启动倒计时，冷却中(429)则用服务器剩余秒数恢复倒计时。
 * 调用时机：用户点击「发送验证码」按钮时触发。
 */
/**
 * sendEmailCode()
 * 作用：校验邮箱后发送验证码（人机验证由本地 PoW 静默完成）；
 *       若 token 缺失或已过期（长时间未操作触发 expired-callback 清空），则重新触发挑战并等待完成，
 *       通过后再调用 POST /api/verify/send；成功后按服务器冷却秒数启动倒计时，冷却中(429)用剩余秒数恢复。
 * 调用时机：用户点击「发送验证码」按钮时触发。
 */
async function sendEmailCode() {
  if (!form.value.email) { errors.email = '请先输入邮箱'; return }
  errors.email = ''
  sendingCode.value = true
  try {
    // PoW：静默等待令牌（拿不到也照常发，由后端判定）
    const powToken = await waitForPowToken(1200)
    const res = await fetch('/api/verify/send', {
      method: 'POST',
      cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(powToken ? { 'X-PoW-Token': powToken } : {})
    },
      body: JSON.stringify({ email: form.value.email, purpose: 'register' })
    })
    const data = await res.json()
    if (!data.success) {
      // 服务器冷却中：用服务器返回的剩余秒数恢复倒计时
      if (data.cooldown) startCooldown(data.cooldown)
      errors.email = data.message
      return
    }
    startCooldown(data.cooldown || 60)
  } catch (e) { errors.email = e.message }
  finally { sendingCode.value = false }
}

/**
 * startCooldown(secs)
 * 作用：启动「发送验证码」按钮倒计时（显示用），每秒 -1，归零后恢复可点击。
 * 调用时机：发送验证码成功、或服务器返回冷却中(429 带 cooldown)时调用，用于启动/恢复倒计时。
 * 说明：真正的 60s 拦截由服务器端强制执行，前端倒计时仅为展示与体验。
 */
function startCooldown(secs) {
  if (cooldownTimer) clearInterval(cooldownTimer)
  codeCooldown.value = secs
  cooldownTimer = setInterval(() => {
    codeCooldown.value--
    if (codeCooldown.value <= 0) { clearInterval(cooldownTimer); cooldownTimer = null }
  }, 1000)
}

/**
 * validate()
 * 作用：校验注册表单字段（CID/用户名/密码/确认密码/邮箱/验证码），出错写入 errors 并返回是否通过。
 * 调用时机：点击「注册」提交表单（handleRegister）时最先调用。
 */
function validate() {
  Object.keys(errors).forEach(k => errors[k] = '')
  agreeError.value = ''
  let ok = true
  if (!/^\d+$/.test(form.value.cid)) { errors.cid = 'CID 必须为数字'; ok = false }
  if (form.value.username.length < 2) { errors.username = '用户名至少 2 个字符'; ok = false }
  // L-3：与后端服务端策略保持一致（8-64 位，须同时含字母和数字）
  const pwd = form.value.password
  if (pwd.length < 8 || pwd.length > 64) { errors.password = '密码长度需为 8-64 位'; ok = false }
  else if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) { errors.password = '密码需同时包含字母和数字'; ok = false }
  if (form.value.password !== form.value.confirm) { errors.confirm = '两次密码不一致'; ok = false }
  if (!form.value.email) { errors.email = '请输入邮箱'; ok = false }
  if (!form.value.emailCode) { errors.email = '请输入邮箱验证码'; ok = false }
  if (!agree.value) { agreeError.value = '请先勾选同意《用户协议》与《隐私政策》'; ok = false }
  return ok
}

/**
 * handleRegister()
 * 作用：提交注册——本地校验后直接调 userStore.register(/auth/register)（PoW 由请求拦截器自动携带）。
 *       邮箱验证码由后端 /auth/register 强制校验一次（verifyCode 校验通过即删除，防批量刷号）。
 *       注意：不再单独调 /api/verify/check，否则验证码会先被 /check 消耗、注册时再校验即报「验证码错误或已过期」。
 * 调用时机：表单提交（@submit.prevent="handleRegister"），即点击「注册」按钮时触发。
 */
async function handleRegister() {
  err.value = ''
  if (!validate()) return
  loading.value = true
  try {
        await userStore.register({
      cid: form.value.cid,
      username: form.value.username,
      password: form.value.password,
      email: form.value.email,
      emailCode: form.value.emailCode,
    })
    router.push('/dashboard')
  } catch (e) {
    err.value = e.message || '注册失败'
  } finally {
    loading.value = false
  }
}
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
  max-width: 420px;
}
.auth-logo {
  font-size: 22px;
  font-weight: 800;
  color: var(--c-primary);
  text-decoration: none;
}
.auth-logo:hover { text-decoration: none; }
.agree-row { display: flex; align-items: flex-start; gap: 9px; line-height: 1.6; }
.agree-row :deep(a) { color: var(--c-primary); }
.captcha-box {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  background: var(--c-primary-light);
  color: var(--c-primary);
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 15px;
  white-space: nowrap;
}

</style>
