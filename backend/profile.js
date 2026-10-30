import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import prisma, { findUserWithCredentials } from '../utils/prisma.js'
import { hashPassword, verifyPassword, sha256Hex } from './auth.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(__dirname, '../../uploads/avatars')

// 确保上传目录存在
import fs from 'fs'
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, req.user.cid + '_' + Date.now() + ext)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('仅支持图片文件'))
    cb(null, true)
  }
})

const router = Router()

router.get('/', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    res.json({ success: true, data: { cid: user.cid, username: user.username, role: user.role, rating: user.rating ?? 0, fsdLevel: user.fsdLevel ?? 1, fsdType: user.fsdType ?? 'PILOT', email: user.email, qq: user.qq, avatar: user.avatar, createdAt: user.createdAt } })
})

router.put('/', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    
    // 使用原始 SQL 查询获取密码字段
    const userWithCreds = await findUserWithCredentials(req.user.cid)
    
    if (oldPassword) {
      const valid = await verifyPassword(oldPassword, userWithCreds.password)
      if (!valid) return res.status(400).json({ success: false, message: '当前密码错误' })
    }
    if (newPassword) {
      const hash = await hashPassword(newPassword)
      await prisma.user.update({
        where: { cid: req.user.cid },
        data: { password: hash, salt: '', fsdPasswordHash: sha256Hex(newPassword) }
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
    res.status(500).json({ success: false, message: e.message })
  }
})

// 上传头像
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请选择图片' })
    const avatarPath = '/uploads/avatars/' + req.file.filename
    await prisma.user.update({ where: { cid: req.user.cid }, data: { avatar: avatarPath } })
    res.json({ success: true, data: { avatar: avatarPath }, message: '头像已更新' })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
})

// 更新个人资料（QQ、邮箱等）
router.put('/info', authenticate, async (req, res) => {
  try {
    const { email, qq, avatar } = req.body
    const data = {}
    if (email !== undefined) data.email = email
    if (avatar !== undefined) data.avatar = avatar
    if (qq !== undefined) {
      data.qq = qq
      const current = await prisma.user.findUnique({ where: { cid: req.user.cid } })
      if (!current.avatar) {
        data.avatar = `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=100`
      }
    }
    // 邮箱变更时通知
    if (email !== undefined) {
      const oldUser = await prisma.user.findUnique({ where: { cid: req.user.cid } })
      const { sendSecurityAlert } = await import('../utils/mailer.js')
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
      // 通知旧邮箱
      if (oldUser?.email && oldUser.email !== email) {
        sendSecurityAlert(oldUser.email, {
          action: '邮箱变更',
          detail: `您的绑定邮箱已从 ${oldUser.email} 变更为 ${email}。`,
          time: new Date().toLocaleString('zh-CN'),
          ip,
          _cid: req.user.cid
        }).catch(() => {})
      }
      // 通知新邮箱
      if (email) {
        sendSecurityAlert(email, {
          action: '邮箱绑定',
          detail: `此邮箱已成功绑定到 CW 账号 (CID: ${req.user.cid})。`,
          time: new Date().toLocaleString('zh-CN'),
          ip,
          _cid: req.user.cid
        }).catch(() => {})
      }
    }
    await prisma.user.update({ where: { cid: req.user.cid }, data })
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    res.json({ success: true, message: '已更新', data: { cid: user.cid, username: user.username, role: user.role, rating: user.rating ?? 0, fsdLevel: user.fsdLevel ?? 1, fsdType: user.fsdType ?? 'PILOT', email: user.email, qq: user.qq, avatar: user.avatar } })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
})

// 发送邮箱验证码
router.post('/send-verify', authenticate, async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ success: false, message: '缺少邮箱' })
    
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    
    // 生成6位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = new Date(Date.now() + 10 * 60 * 1000) // 10分钟有效
    
    await prisma.user.update({
      where: { cid: req.user.cid },
      data: { resetCode: code, resetCodeExpires: expires }
    })
    
    // 发送邮件（统一使用 mailer.js）
    const { sendVerifyCode } = await import('../utils/mailer.js')
    await sendVerifyCode(email, code, '邮箱验证')
    res.json({ success: true, message: '验证码已发送' })
  } catch (e) {
    if (e.message === 'SMTP_NOT_CONFIGURED' && process.env.NODE_ENV !== 'production') {
      return res.json({ success: true, message: '验证码已发送', debug: code })
    }
    res.status(500).json({ success: false, message: '发送失败: ' + e.message })
  }
})

// 验证邮箱验证码
router.post('/verify-email', authenticate, async (req, res) => {
  try {
    const { email, code } = req.body
    if (!email || !code) return res.status(400).json({ success: false, message: '缺少参数' })
    
    const user = await prisma.user.findUnique({ where: { cid: req.user.cid } })
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' })
    
    if (user.resetCode !== code) return res.status(400).json({ success: false, message: '验证码错误' })
    if (user.resetCodeExpires && new Date() > user.resetCodeExpires) return res.status(400).json({ success: false, message: '验证码已过期' })
    
    await prisma.user.update({
      where: { cid: req.user.cid },
      data: { email, resetCode: '', resetCodeExpires: null }
    })
    
    res.json({ success: true, message: '邮箱验证成功' })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
})

export default router
