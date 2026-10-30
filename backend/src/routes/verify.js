import { Router } from 'express'
import prisma from '../utils/prisma.js'
import { generateCode, sendVerifyCode, storeCode, verifyCode } from '../utils/mailer.js'
import { verifyLimiter, codeFpLimiter } from './security.js'
import { verifyTurnstile } from '../utils/turnstile.js'

/**
 * ============================================================================
 *  verify.js —— 邮箱验证码接口
 *  ----------------------------------------------------------------------------
 *  功能：
 *    - POST /send   发送邮箱验证码（Turnstile 人机验证门槛 + 服务器强制 60s 冷却）
 *    - POST /check  校验邮箱验证码是否正确（一次性，通过即失效）
 *  依赖：
 *    - mailer.js：generateCode / sendVerifyCode / storeCode / verifyCode
 *    - 数据库表：VerificationCode（验证码）、EmailCooldown（发送冷却）
 *  调用方：
 *    - 前端注册页 Register.vue（发送验证码、注册前校验邮箱验证码）
 * ============================================================================
 */

const router = Router()

// ===== 验证码发送冷却（服务器强制） =====
// 冷却数据源：复用 VerificationCode 表（跨实例共享、无需新表），其 createdAt 即最近发送时间。
// 内存 Map 仅作数据库故障时的兜底（单实例内有效）。
const SEND_COOLDOWN_MS = 60 * 1000
const emailCooldowns = new Map() // 内存兜底缓存：email -> lastSendTime

/**
 * getLastSend(email)
 * 作用：读取指定邮箱最近一次发送验证码的时间戳（毫秒）；无记录返回 0。
 * 调用时机：POST /send 处理时调用，用于计算该邮箱的冷却剩余秒数。
 * 说明：优先读数据库 VerificationCode 表的 createdAt（跨实例共享、准确）；
 *       数据库异常时降级读内存 Map。
 */
async function getLastSend(email) {
  try {
    const rec = await prisma.verificationCode.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' }
    })
    if (rec) return rec.createdAt.getTime()
  } catch {}
  return emailCooldowns.get(email) || 0
}

/**
 * setLastSend(email)
 * 作用：记录指定邮箱本次发送验证码的时间。
 * 调用时机：POST /send 验证码成功发送后调用，为该邮箱启动 60s 冷却。
 * 说明：DB 正常时 VerificationCode 已由 storeCode 写入（createdAt=now），跨实例共享；
 *       此处写入内存 Map 仅覆盖「DB 不可用 / 验证码被删除」的边界场景。
 */
async function setLastSend(email) {
  emailCooldowns.set(email, Date.now())
}

/**
 * pruneMemoryCache()
 * 作用：清理内存降级缓存中已过冷却期的记录，防止 Map 无限增长。
 * 调用时机：定时器每 60s 调用一次；POST /send 处理开头也会惰性触发一次。
 * 注意：数据库正常时该缓存为空，本函数仅作数据库故障时的兜底。
 */
function pruneMemoryCache() {
  const now = Date.now()
  for (const [email, t] of emailCooldowns) {
    if (now - t >= SEND_COOLDOWN_MS) emailCooldowns.delete(email)
  }
}
setInterval(pruneMemoryCache, SEND_COOLDOWN_MS).unref?.()

/**
 * POST /send —— 发送邮箱验证码
 * 作用：依次校验「冷却 → Turnstile token 非空 → 邮箱是否已注册」后，生成 6 位验证码发送到邮箱，并记录发送冷却。
 * 调用时机：用户在前端注册页点击「发送验证码」按钮时调用。
 * 守卫链：verifyLimiter(IP 限流) → codeFpLimiter(设备指纹限流) → 60s 冷却(数据库) → Turnstile → 邮箱占用检查 → 发送
 * 返回：
 *   200 成功(带 cooldown:60) / 400 缺邮箱或未完成人机验证 / 409 邮箱已注册
 *   429 冷却中(带 cooldown 剩余秒) / 502 邮件发送失败 / 500 服务器错误
 */
router.post('/send', verifyLimiter, codeFpLimiter, async (req, res) => {
  try {
    const { email, purpose, turnstileToken } = req.body
    if (!email) return res.status(400).json({ success: false, message: '缺少邮箱地址' })

    // ===== H-1 修复①：purpose 白名单 =====
    // 旧版对 purpose 不做校验：空串/乱串等任意值均绕过人机验证直接发信 → 换邮箱即可邮件轰炸。
    // 现仅允许已知用途（前端实际只用 register / login；bind 为绑定邮箱预留）。
    const PURPOSES = new Set(['register', 'bind', 'login'])
    const p = PURPOSES.has(purpose) ? purpose : ''
    if (!p) return res.status(400).json({ success: false, message: '参数错误' })

    pruneMemoryCache() // 惰性清理内存降级缓存
    // ===== 服务器强制冷却（数据库，跨实例生效） =====
    const lastSend = await getLastSend(email)
    const remain = Math.ceil((lastSend + SEND_COOLDOWN_MS - Date.now()) / 1000)
    if (remain > 0) {
      return res.status(429).json({ success: false, message: `发送过于频繁，请 ${remain} 秒后重试`, cooldown: remain })
    }

    // ===== H-1 修复②：Turnstile 门槛对所有用途生效 =====
    //  - register/bind：此处仅做「token 非空」预检；真正的 siteverify 在 /auth/register 注册提交时
    //    执行（token 一次性，不能在此提前消耗）。register 的 siteverify 现已强制（见 auth.js H-2 修复）。
    //  - login：前端登录二次验证框已接入 Turnstile，此处做真实 siteverify（登录流程后续无校验，
    //    token 一次性在此消耗），并保留「邮箱必须已绑定账号」，彻底关闭向任意邮箱发信/轰炸的路径。
    if (p === 'login') {
      const owner = await prisma.user.findFirst({ where: { email } })
      if (!owner) return res.status(404).json({ success: false, message: '该邮箱未绑定任何账号' })
      const ts = await verifyTurnstile(req, turnstileToken)
      if (!ts.ok) return res.status(ts.status).json({ success: false, message: ts.message })
    } else if (!turnstileToken) {
      return res.status(400).json({ success: false, message: '请完成人机验证' })
    }

    // 检查邮箱是否已被绑定
    if (p === 'register' || p === 'bind') {
      const exists = await prisma.user.findFirst({ where: { email } })
      if (exists && p === 'register') {
        return res.status(409).json({ success: false, message: '该邮箱已被注册' })
      }
    }

    const code = generateCode()
    try {
      await sendVerifyCode(email, code, p)
    } catch (mailErr) {
      console.error('[邮件发送失败]', mailErr.message)
      // 仍然存储验证码，方便开发调试
      storeCode(email, code)
      const isSmtpUnconfigured = mailErr.message === 'SMTP_NOT_CONFIGURED'
      const msg = isSmtpUnconfigured
        ? '邮件服务未配置，请联系管理员设置 SMTP 后使用'
        : '邮件发送失败，请检查邮箱地址或联系管理员'
      return res.status(502).json({ success: false, message: msg })
    }
    storeCode(email, code)
    await setLastSend(email)

    res.json({ success: true, message: '验证码已发送', cooldown: 60 })
  } catch (e) {
    console.error('[验证码发送接口错误]', e)
    res.status(500).json({ success: false, message: '服务器内部错误，请稍后重试' })
  }
})

/**
 * POST /check —— 校验邮箱验证码
 * 作用：校验用户输入的验证码是否与该邮箱匹配且未过期；校验通过即删除（一次性）。
 * 调用时机：前端注册页提交注册前调用，确认邮箱归属；后端 /auth/register 注册时还会再强校验一次。
 * 返回：200 验证通过 / 400 缺少参数或验证码错误/过期 / 500 服务器错误
 */
router.post('/check', verifyLimiter, async (req, res) => {
  try {
    const { email, code } = req.body
    if (!email || !code) return res.status(400).json({ success: false, message: '缺少参数' })

    const ok = await verifyCode(email, code)
    if (!ok) return res.status(400).json({ success: false, message: '验证码错误或已过期' })

    res.json({ success: true, message: '验证通过' })
  } catch (e) {
    console.error('[verify.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

export default router
