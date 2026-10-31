/**
 * 表单校验反馈（对齐 CTYFLY-WEB 的 fieldFeedback.js）
 *
 * 出错：红边 + 水平轻晃 + 提示条从下方滑入；用户一改这个字段就自动收起。
 *
 * 用法：
 *   const fb = useFieldFeedback(['account', 'password'])
 *   fb.fail('account', '请填写账号')   // 红边 + 摇晃 + 提示
 *   fb.input('account')                // 输入时调用：有错就收起
 *   fb.errors.account / fb.shaking.account   // 模板绑定
 */
import { reactive } from 'vue'

export function useFieldFeedback(fields = []) {
  const errors = reactive({})
  const shaking = reactive({})
  for (const f of fields) {
    errors[f] = ''
    shaking[f] = false
  }

  /** 标记字段出错：先清抖动，下一帧再打开，保证重复提交也能重播动画 */
  function fail(field, message) {
    errors[field] = message
    shaking[field] = false
    requestAnimationFrame(() => {
      shaking[field] = true
    })
  }

  function clear(field) {
    errors[field] = ''
    shaking[field] = false
  }

  function clearAll() {
    for (const f of fields) clear(f)
  }

  /** 用户正在修改该字段：收起错误（动画交给 CSS transition） */
  function input(field) {
    if (errors[field]) clear(field)
  }

  function hasError() {
    return fields.some((f) => !!errors[f])
  }

  /** 第一个出错字段名（用于聚焦定位） */
  function firstErrorField() {
    return fields.find((f) => !!errors[f]) || ''
  }

  return { errors, shaking, fail, clear, clearAll, input, hasError, firstErrorField }
}

export default useFieldFeedback
