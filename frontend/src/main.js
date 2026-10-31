import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import pinia from './store'
import { reportPageView } from './utils/deviceFp'
import { touchLastActive, isTokenExpired, isTokenNearExpiry, isWithinActiveWindow } from './utils/jwt'
import api from './api'
import tableSort from './utils/tableSort'
import { showBanner, navigateToLoginAfterBanner } from './utils/banner'
import ToastBanner from './components/ToastBanner.vue'
import ActionBanner from './components/ActionBanner.vue'
import PoWCaptcha from './components/PoWCaptcha.vue'
import FormField from './components/FormField.vue'
import CheckBox from './components/CheckBox.vue'
import SelectMenu from './components/SelectMenu.vue'
import DatePicker from './components/DatePicker.vue'
import SubmitButton from './components/SubmitButton.vue'
import './assets/global.css'

const app = createApp(App)
app.use(router)
app.use(pinia)
// 全局表格排序指令：<table v-sort> 点击表头排序，默认首列 A-Z/1-9 升序
app.directive('sort', tableSort)
// 全局红色横幅：组件全局可用 + this.$banner(...) + window.showBanner(...)
app.component('ToastBanner', ToastBanner)
// 全局动作横幅（密码输入等控件，右侧滑入无进度条）
app.component('ActionBanner', ActionBanner)
// 隐身 PoW 人机验证（不渲染任何 DOM）
app.component('PoWCaptcha', PoWCaptcha)
app.component('FormField', FormField)
app.component('CheckBox', CheckBox)
app.component('SelectMenu', SelectMenu)
app.component('DatePicker', DatePicker)
app.component('SubmitButton', SubmitButton)
app.config.globalProperties.$banner = showBanner
// 全局错误兜底：组件渲染/生命周期报错 → 红横幅提示
app.config.errorHandler = (err) => {
  console.error('[GlobalError]', err)
  showBanner('发生错误: ' + (err?.message || '未知错误'))
}
app.mount('#app')
// 暴露全局函数，任意 JS 可调用
window.showBanner = showBanner

// 访问网页时上报真实设备指纹到服务器（SecurityEvent 证据链：IP + 指纹 + UA + 来源页）
reportPageView()

// ===== 会话活跃记录 =====
// last_active 只在「真实用户交互 / 路由导航」时刷新；
// 页面切回可见时先判断离开时长（见下方 checkSessionOnVisible），不直接刷新。
function recordActive() {
  if (localStorage.getItem('cw_token')) touchLastActive()
}
// 用户交互（点击/键盘/滚动）时记录（节流避免高频写 localStorage）
let activeTimer = null
function throttleActive() {
  if (activeTimer) return
  activeTimer = setTimeout(() => {
    activeTimer = null
    recordActive()
  }, 2000)
}
document.addEventListener('click', throttleActive)
document.addEventListener('keydown', throttleActive)
window.addEventListener('scroll', throttleActive, { passive: true })

/**
 * 页面切回可见 / 窗口聚焦时的会话检查（核心续签判定点）：
 * - 先看「离开前的最后活跃时间」（不刷新），若距现在超过 10 分钟
 *   → 用户离开太久，JWT 已过期 → 清登录跳转登录页。
 * - 若 10 分钟内活跃过 → 刷新活跃时间，并视 token 过期情况自动续签。
 * 说明：页面切到后台期间无交互事件，last_active 停留在离开前，
 *       因此「离开时长」≈ now - last_active，可准确判定 10 分钟窗口。
 */
function checkSessionOnVisible() {
  const token = localStorage.getItem('cw_token')
  if (!token) return
  if (window.location.pathname.startsWith('/login')) return

  // 长时间（默认 7 天）没回来：清登录态，回登录页
  if (!isWithinActiveWindow()) {
    localStorage.removeItem('cw_token')
    localStorage.removeItem('cw_user')
    localStorage.removeItem('cw_last_active')
    showBanner('登录已过期，请重新登录')
    navigateToLoginAfterBanner()
    return
  }

  touchLastActive()

  // 已过期：尝试用宽限期续签，失败才登出
  if (isTokenExpired()) {
    renewSession(true)
    return
  }
  // 临期（不足 1 小时）：静默续签，用户完全无感；失败也不影响当前会话
  if (isTokenNearExpiry(60 * 60 * 1000)) {
    renewSession(false)
  }
}

/** 静默续签；logoutOnFail=true 表示续签失败就必须重新登录 */
function renewSession(logoutOnFail) {
  api.post('/auth/refresh')
    .then(res => {
      const newToken = res?.data?.token
      if (!newToken) throw new Error('no token')
      localStorage.setItem('cw_token', newToken)
      const user = res.data?.user
      if (user) localStorage.setItem('cw_user', JSON.stringify(user))
      touchLastActive()
    })
    .catch(() => {
      if (!logoutOnFail) return
      localStorage.removeItem('cw_token')
      localStorage.removeItem('cw_user')
      localStorage.removeItem('cw_last_active')
      if (!window.location.pathname.startsWith('/login')) {
        showBanner('登录已过期，请重新登录')
        navigateToLoginAfterBanner()
      }
    })
}

// 页面切回可见（从后台/其他标签页返回）时检查
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkSessionOnVisible()
})
// 窗口重新聚焦时检查
window.addEventListener('focus', checkSessionOnVisible)
