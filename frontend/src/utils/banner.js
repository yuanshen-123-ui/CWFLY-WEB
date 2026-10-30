// ===== 全局横幅（红色提示条）=====
// 用法：
//   import { showBanner } from '@/utils/banner'
//   showBanner('登录已过期,请重新登录!', { duration: 3000 })
// 或 options API 组件：this.$banner('xxx')
// 或任意 JS：window.showBanner('xxx')
//
// 行为：右上角菜单栏下方从右侧滑入（向左弹出）→ 红色背景 + 底部进度条向左收缩
//       → 进度条结束动画触发横幅向右侧缩回消失
import { reactive } from 'vue'

export const bannerState = reactive({
  visible: false,
  message: '',
  duration: 3000,   // 进度条时长（毫秒）
  key: 0            // 每次显示自增，强制重启进度条动画
})

let hideTimer = null

export function showBanner(message, opts = {}) {
  bannerState.message = String(message ?? '')
  bannerState.duration = Math.max(1000, opts.duration || 3000)
  bannerState.key++
  bannerState.visible = true
  clearTimeout(hideTimer)
  // 兜底：进度条 animationend 未触发（如元素被销毁）时也能隐藏
  hideTimer = setTimeout(() => { bannerState.visible = false }, bannerState.duration + 500)
}

export function hideBanner() {
  bannerState.visible = false
}

/**
 * 等横幅动画完整走完后跳转登录页。
 * 调用时机：登录过期等需要提示用户后再离开当前页面的场景。
 * navigate 可选：传入则用其执行路由内跳转（如 vue-router 的 next），否则整页跳 /login。
 */
export function navigateToLoginAfterBanner(navigate) {
  // 进入滑入 350ms + 进度条 duration + 离开滑出 350ms + 200ms 余量
  const enterLeave = 350
  const barDuration = bannerState?.duration || 3000
  const delay = enterLeave + barDuration + enterLeave + 200
  setTimeout(() => {
    // 跳转前再校验一次：若期间已手动跳到登录页则跳过
    if (window.location.pathname.startsWith('/login')) return
    if (typeof navigate === 'function') {
      navigate('/login')
    } else {
      window.location.href = '/login'
    }
  }, delay)
}
