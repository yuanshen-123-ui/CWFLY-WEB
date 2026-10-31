/**
 * 二次确认弹层（与 CTYFLY-WEB 的 confirmModal 对齐，轻量实现）
 * 用法：if (!(await confirmDialog({ title, message, confirmText }))) return
 */
export function confirmDialog({
  title = '确认操作',
  message = '',
  confirmText = '确定',
  cancelText = '取消',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.32);padding:20px;animation:cwdlg-in .14s ease both'

    const box = document.createElement('div')
    box.style.cssText =
      'width:100%;max-width:360px;padding:20px 20px 16px;border-radius:16px;' +
      'background:var(--glass-bg-strong,#fff);backdrop-filter:blur(20px);' +
      'border:1px solid var(--glass-border-strong,rgba(0,0,0,.08));' +
      'box-shadow:0 18px 48px rgba(0,0,0,.18);color:var(--c-text,#1d1d1f)'
    const titleEl = document.createElement('div')
    titleEl.textContent = title
    titleEl.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:8px'
    const msgEl = document.createElement('div')
    msgEl.textContent = message
    msgEl.style.cssText = 'font-size:13px;line-height:1.6;color:var(--c-text-secondary,#666);white-space:pre-wrap'
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:18px'

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.textContent = cancelText
    cancelBtn.style.cssText =
      'padding:8px 16px;border-radius:999px;border:none;cursor:pointer;font-size:13px;' +
      'background:rgba(0,0,0,.06);color:inherit'
    const okBtn = document.createElement('button')
    okBtn.type = 'button'
    okBtn.textContent = confirmText
    okBtn.style.cssText =
      'padding:8px 16px;border-radius:999px;border:none;cursor:pointer;font-size:13px;' +
      'font-weight:600;background:var(--c-danger,#ff3b30);color:#fff'

    actions.append(cancelBtn, okBtn)
    box.append(titleEl, msgEl, actions)
    overlay.append(box)
    document.body.appendChild(overlay)

    const close = (value) => {
      document.removeEventListener('keydown', onKey)
      overlay.remove()
      resolve(value)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false)
    })
    cancelBtn.addEventListener('click', () => close(false))
    okBtn.addEventListener('click', () => close(true))
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => okBtn.focus())
  })
}
