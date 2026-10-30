import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma, { findUserWithCredentials } from '../utils/prisma.js'
import { hashPassword, verifyPassword, sha256Hex } from './auth.js'
import { imageFileFilter, isImageBuffer } from '../utils/uploadSafety.js'
import multer from 'multer'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(__dirname, '../../uploads/avatars')

// 确保上传目录存在
import fs from 'fs'
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const safeName = req.user.cid + '_' + Date.now() + (ext || '.jpg')
    cb(null, safeName)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter
})

const router = Router()

router.get('/', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    res.json({ success: true, data: { cid: user.cid, username: user.username, rating: user.rating ?? 0, permissions: user.permissions || '', fsdLevel: user.fsdLevel ?? 0, email: user.email, qq: user.qq, avatar: user.avatar, bgImage: user.bgImage || '', createdAt: user.createdAt } })
})

router.put('/', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    
    // 使用原始 SQL 查询获取密码字段
    const userWithCreds = await findUserWithCredentials(req.user.cid)

    // 安全(2026-10-25 审计 P1-1): 修改密码必须校验原密码。
    // 此前 oldPassword 缺省即跳过校验, 持任意有效 JWT 可永久接管账号。
    if (newPassword) {
      if (!oldPassword) return res.status(400).json({ success: false, message: '修改密码需要提供当前密码' })
      const valid = await verifyPassword(oldPassword, userWithCreds.password)
      if (!valid) return res.status(400).json({ success: false, message: '当前密码错误' })
    }
    if (newPassword) {
      const hash = await hashPassword(newPassword)
      await prisma.user.update({
        where: { cid: req.user.cid },
        data: { password: hash, fsdPasswordHash: sha256Hex(newPassword) }
      })
      // 发送密码修改安全通知
      if (user.email) {
        const { sendSecurityAlert } = await import('../utils/mailer.js')
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
        sendSecurityAlert(user.email, {
          action: '密码修改',
          detail: '您在个人中心修改了登录密码。',
          time: new Date().toLocaleString('zh-CN'),
          ip,
          _cid: req.user.cid
        }).catch(() => {})
      }
    }
    res.json({ success: true, message: '更新成功' })
  } catch (e) {
    console.error('[profile.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 上传头像
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请选择图片' })
    // 魔数二次校验(2026-10-25 审计 P0-1): 扩展名/mimetype 均可伪造, 内容必须是真实图片
    const head = fs.readFileSync(req.file.path).subarray(0, 16)
    if (!isImageBuffer(head)) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ success: false, message: '文件内容不是有效图片' })
    }
    const avatarPath = '/uploads/avatars/' + req.file.filename
    await prisma.user.update({ where: { cid: req.user.cid }, data: { avatar: avatarPath } })
    res.json({ success: true, data: { avatar: avatarPath }, message: '头像已更新' })
  } catch (e) {
    console.error('[profile.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 更新个人资料（QQ、邮箱等）
router.put('/info', authenticate, async (req, res) => {
  try {
    const { email, qq, avatar } = req.body
    const data = {}
    // 安全(2026-08-07): 禁止通过 /info 直接改邮箱(原无验证码校验, 可被利用接管账号)
    // 改邮箱必须走 /send-email-code + /verify-email(带验证码) 流程
    if (email !== undefined) {
      return res.status(400).json({ success: false, message: '邮箱修改请使用「邮箱验证」流程' })
    }
    if (avatar !== undefined) data.avatar = avatar
    if (qq !== undefined) {
      data.qq = qq
      const current = await prisma.user.findUnique({ where: { cid: req.user.cid } })
      if (!current.avatar) {
        data.avatar = `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=100`
      }
    }
    await prisma.user.update({ where: { cid: req.user.cid }, data })
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    res.json({ success: true, message: '已更新', data: { cid: user.cid, username: user.username, rating: user.rating ?? 0, fsdLevel: user.fsdLevel ?? 0, fsdType: user.fsdType ?? 'PILOT', email: user.email, qq: user.qq, avatar: user.avatar } })
  } catch (e) {
    console.error('[profile.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 背景图目录
const bgDir = path.join(__dirname, '../../uploads/backgrounds')
if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true })

const bgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, bgDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const safeName = 'bg_' + req.user.cid + '_' + Date.now() + (ext || '.jpg')
    cb(null, safeName)
  }
})
const bgUpload = multer({
  storage: bgStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter
})

// 上传自定义背景图
router.post('/bg-image', authenticate, bgUpload.single('bgImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请选择图片' })
    // 魔数二次校验(2026-10-25 审计 P0-1)
    const head = fs.readFileSync(req.file.path).subarray(0, 16)
    if (!isImageBuffer(head)) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ success: false, message: '文件内容不是有效图片' })
    }
    // 每日限制 5 次（统计当天已上传的文件数）
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const prefix = `bg_${req.user.cid}_${dateStr}`
    let todayCount = 0
    try {
      const files = fs.readdirSync(bgDir)
      todayCount = files.filter(f => f.startsWith(prefix)).length
    } catch {}
    if (todayCount >= 5) {
      // 删除刚上传的文件
      fs.unlinkSync(req.file.path)
      return res.status(429).json({ success: false, message: '每日最多更换 5 次背景图，请明天再试' })
    }
    const bgPath = '/uploads/backgrounds/' + req.file.filename
    // 删除旧背景图文件（仅保留一个最新）
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    if (user?.bgImage) {
      const oldFile = path.join(__dirname, '../..', user.bgImage)
      if (oldFile !== req.file.path && fs.existsSync(oldFile)) {
        fs.unlinkSync(oldFile)
      }
    }
    await prisma.user.update({
      where: { cid: req.user.cid },
      data: { bgImage: bgPath }
    })
    res.json({ success: true, data: { bgImage: bgPath }, message: '背景图已更新' })
  } catch (e) {
    console.error('[profile.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 清除自定义背景图
router.delete('/bg-image', authenticate, async (req, res) => {
  try {
    await prisma.user.update({
      where: { cid: req.user.cid },
      data: { bgImage: '' }
    })
    res.json({ success: true, message: '已恢复默认背景' })
  } catch (e) {
    console.error('[profile.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 发送邮箱验证码
router.post('/send-verify', authenticate, async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ success: false, message: '缺少邮箱' })
    
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    
    // 生成6位随机验证码(crypto, 2026-10-25 审计 P2-4: Math.random 可预测)
    const code = crypto.randomInt(100000, 1000000).toString()
    const expires = new Date(Date.now() + 10 * 60 * 1000) // 10分钟有效

    // 安全(2026-10-25 审计 P2-3): 验证码与目标邮箱绑定存储,
    // 防止「给 A 邮箱发的码被用来绑定 B 邮箱」
    await prisma.user.update({
      where: { cid: req.user.cid },
      data: { resetCode: `${email.toLowerCase()}|${code}`, resetCodeExpires: expires }
    })
    
    // 发送邮件（统一使用 mailer.js）
    const { sendVerifyCode } = await import('../utils/mailer.js')
    await sendVerifyCode(email, code, '邮箱验证')
    res.json({ success: true, message: '验证码已发送' })
  } catch (e) {
    if (e.message === 'SMTP_NOT_CONFIGURED' && process.env.NODE_ENV !== 'production') {
      return res.json({ success: true, message: '验证码已发送', debug: code })
    }
    console.error('[profile.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 验证邮箱验证码
router.post('/verify-email', authenticate, async (req, res) => {
  try {
    const { email, code } = req.body
    if (!email || !code) return res.status(400).json({ success: false, message: '缺少参数' })
    
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    
    // 安全(2026-10-25 审计 P2-3): 验证码与目标邮箱绑定 + 邮箱唯一性校验
    const expected = user.resetCode || ''
    const [boundEmail, boundCode] = expected.split('|')
    if (boundCode !== code || boundEmail !== email.toLowerCase()) {
      return res.status(400).json({ success: false, message: '验证码错误' })
    }
    if (user.resetCodeExpires && new Date() > user.resetCodeExpires) return res.status(400).json({ success: false, message: '验证码已过期' })
    const emailTaken = await prisma.user.findFirst({ where: { email }, select: { cid: true } })
    if (emailTaken && emailTaken.cid !== req.user.cid) {
      return res.status(400).json({ success: false, message: '该邮箱已被其他账号使用' })
    }
    
    await prisma.user.update({
      where: { cid: req.user.cid },
      data: { email, resetCode: '', resetCodeExpires: null }
    })
    
    res.json({ success: true, message: '邮箱验证成功' })
  } catch (e) {
    console.error('[profile.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

export default router
