/**
 * HTML 转义：防止 XSS 注入
 * 将用户输入中的 HTML 特殊字符转义为实体
 */
export function escapeHtml(str) {
  if (!str) return ''
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
  return String(str).replace(/[&<>"']/g, ch => map[ch])
}

/**
 * 安全渲染纯文本内容（将换行转为 <br>，同时转义 HTML）
 * 适用于论坛帖子、评论、活动回顾等纯文本内容
 */
export function renderText(str) {
  if (!str) return ''
  return escapeHtml(str).replace(/\n/g, '<br>')
}

/**
 * 清理 HTML（使用 DOMPurify 安全过滤）
 * 适用于需要保留基本 HTML 格式的场景（如会议记录、知识库文章）
 */
import DOMPurify from 'dompurify'

export function sanitizeHtml(str) {
  if (!str) return ''
  return DOMPurify.sanitize(str, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'em', 'strong', 'a', 'br', 'p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target'],  // 安全(2026-10-25): 移除 style, 防 CSS 注入
  })
}
