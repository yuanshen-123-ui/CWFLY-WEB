// ===== 全局动作横幅（右侧滑入，无进度条，可放自定义控件）=====
// 用法：
//   import { showActionBanner, hideActionBanner } from '@/utils/bannerAction'
//   showActionBanner({ type: 'secret', title: '输入提交密码', onConfirm: (value) => { ... } })
//
// 行为：横幅从右侧滑入 → 用户输入/操作 → 确定后 onConfirm(value) 并缩回；取消直接缩回。
// 通用：type 决定横幅内渲染的控件（目前支持 'secret' 密码输入），后续其他控件在此扩展。
import { reactive } from 'vue'

export const actionState = reactive({
  visible: false,
  key: 0,          // 每次显示自增，强制重启滑入动画
  type: '',        // 'secret' 等
  title: '',       // 横幅标题
  placeholder: '', // 输入控件占位符（type=secret 用）
  onConfirm: null, // 确认回调 (value) => {}
})

export function showActionBanner(opts = {}) {
  actionState.title = opts.title ?? ''
  actionState.type = opts.type ?? ''
  actionState.placeholder = opts.placeholder ?? ''
  actionState.onConfirm = opts.onConfirm ?? null
  actionState.key++
  actionState.visible = true
}

export function hideActionBanner() {
  actionState.visible = false
  actionState.onConfirm = null
}
