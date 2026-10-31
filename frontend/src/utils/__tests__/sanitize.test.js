// @vitest-environment jsdom
/**
 * sanitize.js 单元测试（XSS 防线）
 *
 * 覆盖点：
 * - escapeHtml：null/空串/0 走空串分支；& < > " ' 全部转义；普通文本原样；重复转义不重复处理
 * - renderText：先转义再把 \n 变 <br>（换行不能绕过转义）
 * - sanitizeHtml：DOMPurify 白名单保留 b/a/br/ul/li/img 等安全标签与 href/src/alt；
 *   移除 script/iframe/onerror/onclick/style 等危险标签与属性；空值返回空串
 */
import { describe, it, expect } from 'vitest'
import { escapeHtml, renderText, sanitizeHtml } from '../sanitize.js'

describe('escapeHtml', () => {
  it('空值返回空串', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml('')).toBe('')
    expect(escapeHtml(0)).toBe('')
  })

  it('转义全部 HTML 特殊字符', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;',
    )
  })

  it('普通文本与中文保持不变', () => {
    expect(escapeHtml('CWFLY 青翼模拟飞行')).toBe('CWFLY 青翼模拟飞行')
  })

  it('已转义过的 & 会再次被转义（不做幂等猜测）', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })
})

describe('renderText', () => {
  it('空值返回空串', () => {
    expect(renderText(null)).toBe('')
    expect(renderText('')).toBe('')
  })

  it('换行转成 <br>，同时 HTML 被转义', () => {
    expect(renderText('第一行\n<script>x</script>')).toBe(
      '第一行<br>&lt;script&gt;x&lt;/script&gt;',
    )
  })

  it('多行文本逐个换行转 <br>', () => {
    expect(renderText('a\nb\nc')).toBe('a<br>b<br>c')
  })
})

describe('sanitizeHtml', () => {
  it('空值返回空串', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml('')).toBe('')
  })

  it('保留白名单标签与安全属性', () => {
    const out = sanitizeHtml('<p>你好 <b>机长</b> <a href="/x" title="链接">链接</a></p>')
    expect(out).toContain('<p>')
    expect(out).toContain('<b>机长</b>')
    expect(out).toContain('href="/x"')
    expect(out).toContain('title="链接"')
  })

  it('移除 script 标签及其中内容', () => {
    const out = sanitizeHtml('<p>安全</p><script>alert("xss")</script>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert')
    expect(out).toContain('<p>安全</p>')
  })

  it('移除事件处理器与 style 属性（防 CSS 注入）', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)" style="position:fixed">')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('style=')
    expect(out).toContain('src="x"')
  })

  it('移除不在白名单的标签（iframe / form）', () => {
    const out = sanitizeHtml('<iframe src="https://evil"></iframe><form action="/x"></form>')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<form')
  })
})
