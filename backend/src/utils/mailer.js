import nodemailer from 'nodemailer'
import crypto from 'crypto'

// ==================== 配置 ====================
const SMTP_USER = process.env.SMTP_USERNAME
const SMTP_PASS = process.env.SMTP_PASSWORD
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@dwflysim.cn'
const FROM_NAME = process.env.SMTP_FROM_NAME || 'CW 模拟飞行连飞平台'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

let transporter = null

if (SMTP_USER && SMTP_PASS) {
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587')
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  })
  transporter.verify().catch(err => {
    console.warn('[Mailer] SMTP 连接验证失败，邮件功能将降级:', err.message)
    transporter = null
  })
} else {
  console.warn('[Mailer] 未配置 SMTP 环境变量，邮件功能不可用（开发模式使用控制台输出）')
}

// ==================== 验证码存储（内存降级方案） ====================
const codeStore = new Map()

// ==================== 验证码生成（数据库 — 支持多实例共享） ====================

export function generateCode() {
  return String(crypto.randomInt(100000, 1000000))
}

export async function storeCode(email, code) {
  try {
    const { default: prisma } = await import('../utils/prisma.js')
    // 删除该邮箱之前的验证码
    await prisma.verificationCode.deleteMany({ where: { email } })
    // 存入新验证码（10分钟过期）
    await prisma.verificationCode.create({
      data: { email, code, expiresAt: new Date(Date.now() + 600000) }
    })
  } catch (e) {
    console.warn('[验证码] 数据库存储失败，降级到内存:', e.message)
    codeStore.set(email, { code, time: Date.now(), attempts: 0 })
  }
}

export async function verifyCode(email, code) {
  try {
    const { default: prisma } = await import('../utils/prisma.js')
    const record = await prisma.verificationCode.findFirst({
      where: { email, code, expiresAt: { gt: new Date() } }
    })
    if (!record) {
      // 防暴力(2026-08-07): 失败递增计数, 连续失败达上限则作废该邮箱验证码(需重新获取)
      const cur = codeStore.get(email) || { attempts: 0 }
      cur.attempts = (cur.attempts || 0) + 1
      codeStore.set(email, cur)
      if (cur.attempts >= 5) {
        await prisma.verificationCode.deleteMany({ where: { email } }).catch(() => {})
        codeStore.delete(email)
      }
      return false
    }
    // 验证通过后删除
    await prisma.verificationCode.delete({ where: { id: record.id } })
    codeStore.delete(email)
    return true
  } catch (e) {
    // 数据库查询失败时降级到内存
    console.warn('[验证码] 数据库验证失败，降级到内存:', e.message)
    const record = codeStore.get(email)
    if (!record) return false
    if (Date.now() - record.time > 600000) { codeStore.delete(email); return false }
    if (record.code !== code) return false
    codeStore.delete(email)
    return true
  }
}

// ==================== 异步邮件队列 ====================
const mailQueue = []
let processing = false

async function processQueue() {
  if (processing || mailQueue.length === 0) return
  processing = true
  while (mailQueue.length > 0) {
    const task = mailQueue.shift()
    try {
      await transporter.sendMail(task)
      // 写入邮件日志（异步，不阻塞）
      logEmail(task).catch(() => {})
    } catch (err) {
      console.error('[Mailer] 队列发送失败:', err.message)
    }
  }
  processing = false
}

function enqueue(mailOptions) {
  mailQueue.push(mailOptions)
  if (transporter) processQueue()
}

// 写入 EmailLog（延迟加载 prisma 避免循环依赖）
async function logEmail(task) {
  try {
    const { default: prisma } = await import('../utils/prisma.js')
    await prisma.emailLog.create({
      data: { to: task.to, subject: task.subject || '', type: task._type || 'notification', status: 'sent', cid: task._cid || '' }
    })
  } catch {} // 日志写入失败不影响主流程
}


// 安全(2026-10-25 审计 P2-2): 邮件模板动态字段 HTML 转义 + 链接白名单, 防注入/钓鱼
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}
function safeUrl(u) {
  const s = String(u ?? '')
  return /^https:\/\/([a-z0-9-]+\.)?cwflysim\.cn(\/|$)/i.test(s) ? s : '#'
}

// ==================== HTML 模板构建 ====================
function buildHtml({ title, greeting = '您好', intro, body, action, actionUrl, code, note }) {
  return `
    <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',sans-serif;">
      <div style="background:#1a73e8;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:20px;">${FROM_NAME}</h1>
      </div>
      <div style="padding:30px;border:1px solid #e2e6ed;border-top:0;border-radius:0 0 10px 10px;">
        <p style="font-size:15px;color:#1f2a3a;">${escapeHtml(greeting)}，</p>
        ${intro ? `<p style="font-size:15px;color:#1f2a3a;">${escapeHtml(intro)}</p>` : ''}
        ${body ? `<p style="font-size:14px;color:#1f2a3a;line-height:1.7;">${escapeHtml(body)}</p>` : ''}
        ${code ? `
          <div style="text-align:center;margin:24px 0;">
            <span style="display:inline-block;padding:12px 32px;background:#e8f0fe;color:#1a73e8;font-size:32px;font-weight:700;letter-spacing:8px;border-radius:8px;">${code}</span>
          </div>
          <p style="font-size:13px;color:#8e96a4;">验证码有效期为 10 分钟，请勿泄露给他人。</p>
        ` : ''}
        ${action && actionUrl ? `
          <div style="text-align:center;margin:24px 0;">
            <a href="${safeUrl(actionUrl)}" style="display:inline-block;padding:12px 28px;background:#1a73e8;color:#fff;font-size:15px;font-weight:600;border-radius:8px;text-decoration:none;">${escapeHtml(action)}</a>
          </div>
          <p style="font-size:13px;color:#8e96a4;">如果按钮无法点击，请复制以下链接到浏览器：<br><span style="color:#1a73e8;">${safeUrl(actionUrl)}</span></p>
        ` : ''}
        ${note ? `<p style="font-size:13px;color:#8e96a4;">${escapeHtml(note)}</p>` : ''}
        <hr style="border:none;border-top:1px solid #f0f2f5;margin:24px 0;">
        <p style="font-size:12px;color:#8e96a4;text-align:center;">&copy; 2026 CW 模拟飞行连飞平台</p>
      </div>
    </div>
  `
}

function buildAtcHtml({ title, greeting = '您好', body, action, actionUrl }) {
  return `
    <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',sans-serif;">
      <div style="background:#0d47a1;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:20px;">ATC 管制员中心</h1>
      </div>
      <div style="padding:30px;border:1px solid #e2e6ed;border-top:0;border-radius:0 0 10px 10px;">
        <p style="font-size:15px;color:#1f2a3a;">${escapeHtml(greeting)}，</p>
        ${body ? `<p style="font-size:14px;color:#1f2a3a;line-height:1.7;">${escapeHtml(body)}</p>` : ''}
        ${action && actionUrl ? `
          <div style="text-align:center;margin:24px 0;">
            <a href="${safeUrl(actionUrl)}" style="display:inline-block;padding:12px 28px;background:#0d47a1;color:#fff;font-size:15px;font-weight:600;border-radius:8px;text-decoration:none;">${escapeHtml(action)}</a>
          </div>
        ` : ''}
        <hr style="border:none;border-top:1px solid #f0f2f5;margin:24px 0;">
        <p style="font-size:12px;color:#8e96a4;text-align:center;">&copy; 2026 CW 模拟飞行 ATC 管制员中心</p>
      </div>
    </div>
  `
}

// ==================== 底层发送函数 ====================
async function send(options) {
  const mailOptions = { from: `${FROM_NAME} <${FROM_EMAIL}>`, ...options }
  if (!transporter) {
    console.log('')
    console.log('╔═══════════════════════════════════════╗')
    console.log('║   [Mailer 开发模式]                   ║')
    console.log(`║   收件人: ${(options.to || '').padEnd(28)}║`)
    console.log(`║   主题:   ${(options.subject || '').padEnd(28)}║`)
    console.log('╚═══════════════════════════════════════╝')
    console.log('')
    // 开发模式也写入日志
    logEmail(mailOptions).catch(() => {})
    return { success: true, devMode: true }
  }
  enqueue(mailOptions)
  return { success: true, queued: true }
}

// ==================== 公开 API ====================

/** 发送验证码邮件 */
export async function sendVerifyCode(to, code, purpose = '验证') {
  return send({
    to,
    subject: `[CW 模拟飞行] ${purpose} - 验证码`,
    html: buildHtml({ title: purpose, intro: `您正在进行 <strong>${purpose}</strong>，请使用以下验证码：`, code }),
    _type: 'verify'
  })
}

/** 发送通知邮件 */
export async function sendNotification(to, { subject, greeting, intro, body, action, actionUrl, note }) {
  return send({
    to,
    subject: `[CW 模拟飞行] ${subject}`,
    html: buildHtml({ title: subject, greeting, intro, body, action, actionUrl, note }),
    _type: 'notification'
  })
}

/** 发送 ATC 站通知邮件 */
export async function sendAtcNotification(to, { subject, greeting = '您好', body, action, actionUrl }) {
  return send({
    to,
    subject: `[ATC 管制员中心] ${subject}`,
    html: buildAtcHtml({ title: subject, greeting, body, action, actionUrl })
  })
}

/** 发送安全通知（密码修改、异常登录等） */
export async function sendSecurityAlert(to, { action, detail, time, ip }) {
  return send({
    to,
    subject: `[CW 模拟飞行] 账号安全通知 - ${escapeHtml(action)}`,
    html: buildHtml({
      title: `账号安全通知 - ${escapeHtml(action)}`,
      intro: `您的账号发生以下安全事件：`,
      body: `
        <strong>操作：</strong>${escapeHtml(action)}<br>
        ${detail ? `<strong>详情：</strong>${detail}<br>` : ''}
        ${time ? `<strong>时间：</strong>${time}<br>` : ''}
        ${ip ? `<strong>IP 地址：</strong>${ip}<br>` : ''}
      `,
      note: '如非您本人操作，请立即修改密码并联系管理员。'
    }),
    _type: 'security'
  })
}

/** 发送审核结果通知 */
export async function sendReviewResult(to, { applicationType, result, reason, detail }) {
  return send({
    to,
    subject: `[CW 模拟飞行] ${applicationType} - ${result}`,
    html: buildHtml({
      title: `${applicationType} - ${result}`,
      intro: `您提交的 <strong>${applicationType}</strong> 申请已${result}。`,
      body: detail || '',
      note: reason ? `审核意见：${reason}` : ''
    }),
    _type: 'review'
  })
}

/** 发送面试邀请通知（申请通过初审，待安排面试） */
export async function sendInterviewInvite(to, { applicationType, reason, detail }) {
  return send({
    to,
    subject: `[CW 模拟飞行] ${applicationType} - 面试邀请`,
    html: buildHtml({
      title: `${applicationType} - 面试邀请`,
      intro: `您提交的 <strong>${applicationType}</strong> 申请已通过初审，请从以下面试时间中选择合适的时间参加面试。`,
      body: detail || '',
      note: reason ? `备注：${reason}` : '请提前做好面试准备。'
    }),
    _type: 'review'
  })
}
