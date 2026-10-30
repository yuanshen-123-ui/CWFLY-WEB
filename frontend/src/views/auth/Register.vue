<template>
  <div class="auth-page">
    <div class="auth-card card p-lg">
      <div class="text-center mb-lg">
        <router-link to="/portal" class="auth-logo">CWFLY</router-link>
        <p class="text-muted mt-sm">注册新账号</p>
      </div>

      <form @submit.prevent="handleRegister">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">CID</label>
          <div class="flex gap-sm">
            <input v-model="form.cid" class="input" :class="{ 'input-error': errors.cid }" placeholder="4位数字 CID" maxlength="4" pattern="\d{4}" required style="flex:1;" @input="onCidInput" />
            <button type="button" class="btn btn-outline btn-sm" @click="randomCid" :disabled="checkingCid || randomLocked">随机</button>
          </div>
          <p v-if="errors.cid" class="text-xs mt-xs" style="color:var(--c-danger);">{{ errors.cid }}</p>
          <p v-else-if="randomLimitMsg" class="text-xs mt-xs" style="color:var(--c-danger);">{{ randomLimitMsg }}</p>
          <p v-else-if="cidOk" class="text-xs mt-xs" style="color:var(--c-success);">该 CID 可用</p>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">用户名</label>
          <input v-model="form.username" class="input" :class="{ 'input-error': errors.username }" placeholder="输入用户名" required />
          <p v-if="errors.username" class="text-xs mt-xs" style="color:var(--c-danger);">{{ errors.username }}</p>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">密码</label>
          <input v-model="form.password" class="input" :class="{ 'input-error': errors.password }" type="password" placeholder="至少 6 位" required />
          <p v-if="errors.password" class="text-xs mt-xs" style="color:var(--c-danger);">{{ errors.password }}</p>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">确认密码</label>
          <input v-model="form.confirm" class="input" :class="{ 'input-error': errors.confirm }" type="password" placeholder="再次输入密码" required />
          <p v-if="errors.confirm" class="text-xs mt-xs" style="color:var(--c-danger);">{{ errors.confirm }}</p>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">邮箱</label>
          <div class="flex gap-sm">
            <input v-model="form.email" class="input" :class="{ 'input-error': errors.email }" type="email" placeholder="your@email.com" required style="flex:1;" />
            <button type="button" class="btn btn-outline btn-sm" @click="sendEmailCode" :disabled="sendingCode || codeCooldown > 0">
              {{ codeCooldown > 0 ? codeCooldown + 's' : sendingCode ? '发送中...' : '发送验证码' }}
            </button>
          </div>
          <p v-if="errors.email" class="text-xs mt-xs" style="color:var(--c-danger);">{{ errors.email }}</p>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">邮箱验证码</label>
          <input v-model="form.emailCode" class="input" placeholder="输入6位验证码" maxlength="6" required />
        </div>
        <!-- 人机验证：UI(iframe) 就绪后再果冻弹出；验证完成后反向缩回消失。
             注意：容器不能用 class="cf-turnstile"/data-sitekey，否则会触发 Turnstile 自动隐式渲染，
             与下方显式 turnstile.render() 冲突导致 400020 / Cannot find Widget -->
        <div v-if="turnstileReady" class="turnstile-wrap" :class="turnstileState">
          <div ref="turnstileEl" class="turnstile-inner"></div>
        </div>

        <p v-if="err" class="text-sm mb-md" style="color:var(--c-danger);">{{ err }}</p>

        <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
          {{ loading ? '注册中...' : '注册' }}
        </button>
      </form>

      <div class="text-center mt-md text-sm text-muted">
        已有账号？ <router-link to="/login">去登录</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'

const router = useRouter()
const userStore = useUserStore()
const form = ref({ cid: '', username: '', password: '', confirm: '', captcha: '' })
const errors = reactive({})
const err = ref('')
const loading = ref(false)
const checkingCid = ref(false)
const cidOk = ref(false)

// ===== Turnstile 人机验证（Cloudflare） =====
// Site Key 是公开标识，可安全放在前端
// 本地开发用 Turnstile 官方测试 key（任意域名可用、总是通过、不注入挑战平台拦截点击）；
// 生产构建(import.meta.env.DEV=false)自动使用真实 Site Key。
const TURNSTILE_SITE_KEY = import.meta.env.DEV
  ? '1x00000000000000000000AA'   // 测试 key：总是通过，避免 localhost 未白名单时阻塞表单
  : '0x4AAAAAAEIZ2oKUUuMSozC2'  // 生产真实 Site Key
const turnstileEl = ref(null)
const turnstileToken = ref('')
const turnstileReady = ref(false) // 控制 widget 容器是否存在
const turnstileState = ref('')    // 动画状态：'' 未就绪(透明静止) | 'is-ready' 果冻弹出 | 'is-hiding' 果冻缩回
let turnstileWidgetId = null
let tsReadyTimer = null       // 等待 Turnstile 脚本加载的轮询
let tsUiTimer = null          // 等待 iframe/UI 就绪的轮询
let passedSilently = false    // 托管式无感通过标记：正常用户未显示 widget 即自动通过，随后直接保持隐藏
let turnstileWaitResolve = null // 「等待 Turnstile 挑战完成」的 Promise resolve（点发送验证码 execute 后使用）

/**
 * onMounted —— 组件挂载时立即初始化人机验证
 * 作用：进入注册页立即渲染 Turnstile 并触发挑战（一进页面就验证），
 *       完成后自动缩回、token 留存；后续「发送验证码」「注册提交」直接复用，无需重复挑战。
 * 调用时机：注册页加载完成（组件挂载）时自动触发。
 */
onMounted(() => {
  initTurnstileImmediate()
})

/**
 * onUnmounted —— 组件卸载时清理资源
 * 作用：清除 Turnstile 等待轮询定时器，并销毁已渲染的 Turnstile 实例（释放 iframe/监听）。
 * 调用时机：离开注册页（组件卸载）时自动触发。
 */
onUnmounted(() => {
  if (tsReadyTimer) clearInterval(tsReadyTimer)
  if (tsUiTimer) clearInterval(tsUiTimer)
  if (randomLimitTimer) clearInterval(randomLimitTimer)
  if (turnstileWidgetId != null && window.turnstile) {
    try { window.turnstile.remove(turnstileWidgetId) } catch {}
  }
})

/**
 * doRender(resolve)
 * 作用：渲染 Cloudflare Turnstile widget（托管式 Managed，不传 execution），由 Turnstile 自动判断：
 *       正常用户自动通过、无感（不显示验证框）；可疑用户才显示交互验证。
 *       完成后 token 留存；若传入 resolve，则挑战完成时回调(true)。
 * 参数：resolve —— 可选回调，挑战完成时调用(传 true)；无人等待(页面自动挑战)时传 null。
 * 调用时机：initTurnstileImmediate()（进入页面立即渲染）、showTurnstileAndWait()（token 过期重新渲染）。
 */
function doRender(resolve) {
  // 已有旧实例（曾缩回，DOM 已移除）→ 先销毁再重新渲染
  if (turnstileWidgetId != null) {
    try { window.turnstile.remove(turnstileWidgetId) } catch {}
    turnstileWidgetId = null
  }
  // 让容器出现（默认透明不占位，后台加载 widget）；正常用户无感通过，可疑用户 iframe 就绪后再果冻弹出
  turnstileReady.value = true
  nextTick(() => {
    if (!window.turnstile || !turnstileEl.value) { if (resolve) resolve(false); return }
    turnstileWidgetId = window.turnstile.render(turnstileEl.value, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'light', // 固定浅色，避免跟随系统深色模式渲染成黑底
      // 托管式（Managed）：不传 execution，Turnstile 自动判断是否显示交互验证（正常用户无感通过）
      callback: (token) => {
        turnstileToken.value = token
        // 验证完成：已展示则果冻缩回；尚未展示（无感自动通过）则保持隐藏、不弹出
        if (turnstileState.value === 'is-ready') {
          hideTurnstile()
        } else {
          passedSilently = true
        }
        // 通知等待者（发送验证码触发挑战后）挑战已完成
        if (resolve) resolve(true)
      },
      'expired-callback': () => { turnstileToken.value = '' },
      // 出错（域名未白名单/网络异常等）：清 token 并提示，避免静默失败让用户干等
      'error-callback': (code) => {
        turnstileToken.value = ''
        if (turnstileState.value === 'is-ready') hideTurnstile()
        else { passedSilently = false; turnstileReady.value = false; turnstileState.value = '' }
        if (resolve) resolve(false)
        console.warn('[Turnstile] 验证出错, code=', code)
        err.value = '人机验证组件加载失败，请刷新页面重试'
      }
    })
    // 等 iframe/UI 就绪：正常用户已无感通过则直接清理保持隐藏；可疑用户弹出交互验证
    waitUiReady(() => {
      if (passedSilently) {
        // 无感自动通过：不弹出，直接保持隐藏（widget 已完成使命，移除容器）
        passedSilently = false
        turnstileReady.value = false
        turnstileState.value = ''
        return
      }
      turnstileState.value = 'is-ready'
    })
  })
}

/**
 * initTurnstileImmediate()
 * 作用：进入注册页立即渲染 Turnstile 并触发挑战（一进页面就验证）。
 *       完成后自动果冻缩回，token 留存供「发送验证码」与「注册提交」使用。
 *       脚本未就绪时轮询等待，就绪后自动执行。
 * 调用时机：组件挂载(onMounted)时调用。
 */
function initTurnstileImmediate() {
  if (!window.turnstile) {
    // Turnstile 脚本尚未就绪：轮询等待后重试
    if (tsReadyTimer) clearInterval(tsReadyTimer)
    tsReadyTimer = setInterval(() => {
      if (window.turnstile) { clearInterval(tsReadyTimer); tsReadyTimer = null; doRender(null) }
    }, 100)
    return
  }
  doRender(null)
}

/**
 * showTurnstileAndWait()
 * 作用：重新渲染 Cloudflare Turnstile 并触发挑战，等待用户完成；
 *       返回 Promise，完成 resolve(true)，超时(15s) resolve(false)。
 *       仅在 token 缺失或已过期（expired-callback 已清空）时调用，用于重新人机验证。
 * 调用时机：sendEmailCode() 中 turnstileToken 为空时调用。
 */
function showTurnstileAndWait() {
  return new Promise(resolve => {
    doRender(ok => resolve(ok))
    // 超时保护：15s 内未完成挑战则视为放弃
    setTimeout(() => resolve(false), 15000)
  })
}

/**
 * hideTurnstile()
 * 作用：播放果冻缩回动画，动画结束后移除 widget 容器（消失）。
 * 调用时机：人机验证完成（callback）且 widget 已展示时调用；或在「UI 就绪前自动通过」短暂展示后调用。
 */
function hideTurnstile() {
  if (turnstileState.value !== 'is-ready') return
  turnstileState.value = 'is-hiding'
  setTimeout(() => {
    turnstileReady.value = false
    turnstileState.value = ''
  }, 1450) // 略大于 fadeOutThenCollapse 动画时长(1400ms)
}

/**
 * waitUiReady(cb)
 * 作用：等待 Turnstile iframe 渲染且其内容(人机验证 UI)加载完成，就绪后执行回调 cb。
 *       通过 iframe 的 load 事件判定 UI 就绪；load 已错过时 500ms 兜底；总超时 8s 避免卡死。
 * 调用时机：showTurnstile() 渲染 widget 后调用，确保果冻弹出动画在 iframe UI 加载完成后播放。
 */
function waitUiReady(cb) {
  const start = Date.now()
  let iframeSeen = false
  let iframeLoaded = false
  tsUiTimer = setInterval(() => {
    const iframe = turnstileEl.value?.querySelector('iframe')
    // 首次找到 iframe：挂载 load 监听（人机验证 UI 内容加载完成时置位）
    if (iframe && !iframeSeen) {
      iframeSeen = true
      iframe.addEventListener('load', () => { iframeLoaded = true }, { once: true })
      // 兜底：若 iframe 已加载但 load 事件错过，500ms 后仍视为就绪
      setTimeout(() => {
        if (tsUiTimer && !iframeLoaded) { clearInterval(tsUiTimer); tsUiTimer = null; cb() }
      }, 500)
    }
    if (iframeLoaded) {
      clearInterval(tsUiTimer); tsUiTimer = null
      cb()
      return
    }
    // 总超时兜底（如 hostname 未配置导致 iframe 不渲染），避免卡死
    if (Date.now() - start > 8000) {
      clearInterval(tsUiTimer); tsUiTimer = null
      cb()
    }
  }, 100)
}
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
 * 作用：校验邮箱后发送验证码。进入页面时已完成 Turnstile 人机验证并取得 token，直接复用；
 *       若 token 缺失或已过期（长时间未操作触发 expired-callback 清空），则重新触发挑战并等待完成，
 *       通过后再调用 POST /api/verify/send；成功后按服务器冷却秒数启动倒计时，冷却中(429)用剩余秒数恢复。
 * 调用时机：用户点击「发送验证码」按钮时触发。
 */
async function sendEmailCode() {
  if (!form.value.email) { errors.email = '请先输入邮箱'; return }
  // token 缺失/已过期：重新渲染并触发挑战（通常进页已自动验证，此处为兜底）
  if (!turnstileToken.value) {
    errors.email = ''
    const ok = await showTurnstileAndWait()
    if (!ok || !turnstileToken.value) { errors.email = '请完成人机验证'; return }
  }
  errors.email = ''
  sendingCode.value = true
  try {
    const res = await fetch('/api/verify/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.value.email, purpose: 'register', turnstileToken: turnstileToken.value })
    })
    const data = await res.json()
    if (!data.success) {
      // 服务器冷却中：用服务器返回的剩余秒数恢复倒计时
      if (data.cooldown) startCooldown(data.cooldown)
      errors.email = data.message
      return
    }
    // 不重置 Turnstile：同一 token 供注册提交时 siteverify，全程只需验证一次
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
  return ok
}

/**
 * handleRegister()
 * 作用：提交注册——本地校验 + Turnstile token 检查后，直接调 userStore.register(/auth/register)。
 *       邮箱验证码由后端 /auth/register 强制校验一次（verifyCode 校验通过即删除，防批量刷号）。
 *       注意：不再单独调 /api/verify/check，否则验证码会先被 /check 消耗、注册时再校验即报「验证码错误或已过期」。
 * 调用时机：表单提交（@submit.prevent="handleRegister"），即点击「注册」按钮时触发。
 */
async function handleRegister() {
  err.value = ''
  if (!validate()) return
  loading.value = true
  try {
    // Turnstile 人机验证：token 缺失/已过期时重新触发挑战并等待完成（与发送验证码同逻辑）
    if (!turnstileToken.value) {
      err.value = '正在重新进行人机验证...'
      const ok = await showTurnstileAndWait()
      if (!ok || !turnstileToken.value) { err.value = '人机验证未完成，请重试'; loading.value = false; return }
      err.value = ''
    }

    await userStore.register({
      cid: form.value.cid,
      username: form.value.username,
      password: form.value.password,
      email: form.value.email,
      emailCode: form.value.emailCode,
      turnstileToken: turnstileToken.value
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

/* ===== 人机验证果冻弹出/缩回动画 ===== */
/* 默认（widget 加载中）：透明 + 负 margin 抵消自身高度 → 不占布局、不可见；
   进入页面默认不显示，等 Turnstile 自身 iframe 加载完成(UI 就绪)后才动画弹出。
   保留 84px 真实尺寸（不使用 scaleY 压缩，避免 Turnstile 测量到异常尺寸导致挑战平台挂起拦截交互） */
.turnstile-wrap {
  height: 84px;
  margin-top: -84px;      /* 负 margin 抵消自身高度：默认不占位（缩回状态），但仍保有尺寸供 Turnstile 渲染 */
  overflow: hidden;
  opacity: 0;
  transform: translateY(-16px);
  transform-origin: top center;
  pointer-events: none;
}
/* UI 就绪（iframe 加载完成）：margin 归零展开占位 + 果冻弹出 */
.turnstile-wrap.is-ready {
  margin-top: 0;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition: margin-top .45s cubic-bezier(.34, 1.56, .64, 1);
  animation: jellyIn .5s cubic-bezier(.34, 1.56, .64, 1) both;
}
/* 验证完成：先渐隐(位置不动)再收起，避免缩回时跑到上方邮箱验证码位置 */
.turnstile-wrap.is-hiding {
  margin-top: 0;
  opacity: 1;
  visibility: visible;
  pointer-events: none;
  animation: fadeOutThenCollapse 1.4s ease both;
}
/* 弹出：从邮箱验证码下方往下果冻状展开 */
@keyframes jellyIn {
  0%   { opacity: 0; transform: translateY(-16px) scaleY(.2); }
  55%  { opacity: 1; transform: translateY(3px) scaleY(1.06); }
  75%  { opacity: 1; transform: translateY(-1px) scaleY(.97); }
  100% { opacity: 1; transform: translateY(0) scaleY(1); }
}
/* 缩回：前 ~1s 渐隐（位置不动），最后快速向上收起（margin 回负，不占位） */
@keyframes fadeOutThenCollapse {
  0%   { opacity: 1; margin-top: 0; transform: translateY(0) scaleY(1); }
  75%  { opacity: 0; margin-top: 0; transform: translateY(0) scaleY(.92); }
  100% { opacity: 0; margin-top: -84px; transform: translateY(-16px) scaleY(.2); }
}
</style>
