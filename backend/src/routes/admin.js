import { Router } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { hashPassword, sha256Hex } from './auth.js'
import multer from 'multer'
import { imageFileFilter, isImageBuffer } from '../utils/uploadSafety.js'
import fs2 from 'fs'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { authenticate, requirePermission, requireAdminAccess, requireRating } from '../middleware/auth.js'
import prisma from '../utils/prisma.js'
import { PERMISSIONS, permsToString } from '../config/permissions.js'
import { adminLimiter } from './security.js'
import { refreshBans, refreshIpList, normalizeIp } from '../services/ipBan.js'
import { refreshDeviceBans, banUserDevices, banDeviceFp } from '../services/deviceBan.js'
import { getPendingVisits } from '../middleware/ipTracker.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const posterDir = path.resolve(__dirname, '../../uploads/posters')
fs.mkdirSync(posterDir, { recursive: true })

// ===== 等级中文名映射（用于账号变更邮件）=====
/** rating 平台等级中文名：0=普通用户 8=协管员 9=高级协管员 11=管理员 12=超级管理员 */
function ratingName(r) {
  return { 0: '普通用户', 8: '协管员', 9: '高级协管员', 11: '管理员', 12: '超级管理员' }[Number(r)] ?? String(r ?? '')
}
/** fsdLevel 管制等级中文名：0=飞行员(无管制资格) 1=OBS 2=S1 ... 12=ADM */
function fsdName(f) {
  const map = { 0: '飞行员', 1: 'OBS', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'C1', 6: 'C2', 7: 'C3', 8: 'I1', 9: 'I2', 10: 'I3', 11: 'SUP', 12: 'ADM' }
  return map[Number(f)] ?? String(f ?? '')
}

const posterStorage = multer.diskStorage({
  destination: posterDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `event_${Date.now()}${ext}`)
  }
})
const uploadPoster = multer({ storage: posterStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter })

const router = Router()

// 生成随机强密码（12 位, 去除易混淆字符 0/O/1/l）
function generateRandomPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  let pwd = ''
  for (let i = 0; i < len; i++) pwd += chars[arr[i] % chars.length]
  return pwd
}

// HTML 转义（防止 XSS 注入）
function escapeHtml(str) {
  if (!str) return ''
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
  return String(str).replace(/[&<>"']/g, ch => map[ch])
}

async function writeAudit(action, detail, req) {
  try {
    await prisma.auditLog.create({
      data: { userId: req.user?.cid || 'system', action, target: detail.slice(0, 200), detail }
    })
  } catch { /* ignore */ }
}

const R = {
  STAFF: 8, CONTENT: 8, FLIGHTPLAN: 8, TICKET: 8,
  CONTROLLER: 9, NOTIFICATION: 9, LOG: 9, ONLINE: 9, VA: 9, ACHIEVEMENT: 9,
  USER: 11, PERMISSION: 11, CONFIG: 11,
}

router.use(authenticate)
router.use(adminLimiter)
router.use(requireAdminAccess)

router.get('/users', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, cid: true, username: true, rating: true, permissions: true, fsdLevel: true, createdAt: true, registerIp: true },
      orderBy: { id: 'asc' }
    })

    const loginLogs = await prisma.loginLog.findMany({
      orderBy: { createdAt: 'desc' },
      select: { userId: true, ip: true, deviceFp: true, createdAt: true }
    })
    const lastLoginMap = {}
    for (const log of loginLogs) {
      if (!lastLoginMap[log.userId]) {
        lastLoginMap[log.userId] = { ip: log.ip, time: log.createdAt, fp: log.deviceFp }
      }
    }
    const data = users.map(u => ({
      ...u,
      registerIp: u.registerIp || '',
      lastLoginIp: lastLoginMap[u.cid]?.ip || '',
      lastLoginFp: lastLoginMap[u.cid]?.fp || '',
      lastLoginAt: lastLoginMap[u.cid]?.time ? new Date(lastLoginMap[u.cid].time).toLocaleString('zh-CN') : ''
    }))
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/users/:cid', requirePermission(PERMISSIONS.USER), requireRating(11), async (req, res) => {
  try {
      const { username, rating, permissions, fsdLevel, password, passwordReason } = req.body
      const meRating = req.user?.rating ?? 0
      const oldUser = await prisma.user.findUnique({ where: { cid: req.params.cid } })
      if (!oldUser) return res.status(404).json({ success: false, message: 'not found' })
      // 非超管权限保护：不能将用户提升至管理员(11)及以上，也不能编辑管理员及以上等级的用户
      if (meRating < 12) {
        const targetRating = rating !== undefined ? Number(rating) : (oldUser.rating ?? 0)
        if (targetRating >= 11) {
          return res.status(403).json({ success: false, message: '您没有权限将用户提升至管理员或超级管理员' })
        }
        if ((oldUser.rating ?? 0) >= 11) {
          return res.status(403).json({ success: false, message: '您没有权限编辑管理员及以上等级的用户' })
        }
      }
      const data = {}
      if (username !== undefined) data.username = username
      if (rating !== undefined) data.rating = rating
      if (permissions !== undefined) data.permissions = permsToString(permissions)
      if (fsdLevel !== undefined) data.fsdLevel = fsdLevel
      // 重置密码：
      if (password !== undefined && password !== null && password !== '') {
        const pwd = String(password)
        if (pwd.length < 6) return res.status(400).json({ success: false, message: '密码长度不能少于 6 位' })
        data.password = await hashPassword(pwd)
        data.fsdPasswordHash = sha256Hex(pwd)
      }
    const user = await prisma.user.update({ where: { cid: req.params.cid }, data })
    if (oldUser?.email) {
      const changes = []
      // 角色 = rating（平台等级，中文名显示）
      if (rating !== undefined && oldUser.rating !== rating) {
        changes.push('角色：' + ratingName(oldUser.rating) + ' -> ' + ratingName(rating))
      }
      // 管制等级 = fsdLevel（中文名显示：飞行员/OBS/S1...）
      if (fsdLevel !== undefined && oldUser.fsdLevel !== fsdLevel) {
        changes.push('管制等级：' + fsdName(oldUser.fsdLevel) + ' -> ' + fsdName(fsdLevel))
      }
      // 细分权限（保留提示）
      if (permissions !== undefined && oldUser.permissions !== permsToString(permissions)) changes.push('权限已更新')
      // 角色/管制等级/权限 变更合并在同一条邮件发送（只变一个就只发一条）
      if (changes.length > 0) {
        const { sendNotification } = await import('../utils/mailer.js')
        sendNotification(oldUser.email, {
          subject: '账号权限变更',
          intro: '您的账号权限已被修改。',
          body: changes.join('<br>'),
          note: '如果您未预期此变更，请立即联系管理员。',
          _cid: req.params.cid
        }).catch(() => {})
      }
      // 密码被重置时发送安全提醒（邮件正文带原因）
      if (password !== undefined && password !== null && password !== '' && oldUser.email) {
        const { sendSecurityAlert } = await import('../utils/mailer.js')
        const reason = (passwordReason !== undefined && passwordReason !== null) ? String(passwordReason).trim() : ''
        const detail = reason
          ? '您的密码由于' + reason + '，已被管理员重置，请尽快登录并修改密码。'
          : '您的密码已被管理员重置，请尽快登录并修改密码。'
        sendSecurityAlert(oldUser.email, {
          action: '密码重置',
          detail,
          time: new Date().toLocaleString('zh-CN'),
          _cid: req.params.cid
        }).catch(() => {})
      }
    }
    if (password !== undefined && password !== null && password !== '') {
      const reason = (passwordReason !== undefined && passwordReason !== null) ? String(passwordReason).trim() : ''
      writeAudit('reset_password', 'User ' + req.params.cid + ' 密码被管理员重置' + (reason ? '（原因：' + reason + '）' : ''), req)
    }
    writeAudit('edit_user', 'User ' + req.params.cid + ' updated', req)
    res.json({ success: true, data: { cid: user.cid, username: user.username, rating: user.rating, permissions: user.permissions || '', fsdLevel: user.fsdLevel, fsdType: user.fsdType } })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.delete('/users/:cid', requirePermission(PERMISSIONS.USER), requireRating(11), async (req, res) => {
  try {
    // 仅超级管理员可直接删除用户；非超管必须走删除审批流程
    if ((req.user?.rating ?? 0) < 12) {
      return res.status(403).json({ success: false, message: '仅超级管理员可直接删除用户，非超管请提交删除审批' })
    }
    const banDevice = !!(req.body && req.body.banDevice)
    // 删除+加入黑名单：先封设备指纹（删除前还能读到注册指纹），再删用户
    let bannedFps = []
    if (banDevice) {
      bannedFps = await banUserDevices(req.params.cid, '删除用户并封禁设备', req.user?.cid || 'system')
      await refreshDeviceBans()
    }
    await prisma.user.delete({ where: { cid: req.params.cid } })
    writeAudit('delete_user', 'User ' + req.params.cid + ' deleted' + (banDevice ? '（同步封禁设备指纹 ' + bannedFps.length + ' 个）' : ''), req)
    res.json({ success: true, message: 'deleted', bannedFps })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 重置密码：管理员触发, 系统生成随机强密码并邮件发送给用户
router.post('/users/:cid/reset-password', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    if ((req.user?.rating ?? 0) < 12) {
      return res.status(403).json({ success: false, message: '仅超级管理员可重置密码' })
    }
    const oldUser = await prisma.user.findUnique({ where: { cid: req.params.cid } })
    if (!oldUser) return res.status(404).json({ success: false, message: 'not found' })
    const reason = (req.body && req.body.reason) !== undefined ? String(req.body.reason).trim() : ''
    const randomPassword = generateRandomPassword()
    await prisma.user.update({
      where: { cid: req.params.cid },
      data: { password: await hashPassword(randomPassword), fsdPasswordHash: sha256Hex(randomPassword) }
    })
    // 邮件：操作/详情(带原因)/时间 + 空行 + 随机密码
    if (oldUser.email) {
      const { sendSecurityAlert } = await import('../utils/mailer.js')
      const detail = (reason
        ? `您的密码由于${reason}，已被管理员重置，请尽快登录并修改密码。`
        : `您的密码已被管理员重置，请尽快登录并修改密码。`)
        + `<br><br>请以 <b>${randomPassword}</b> 该密码登录并重置您的密码。`
      sendSecurityAlert(oldUser.email, {
        action: '密码重置',
        detail,
        time: new Date().toLocaleString('zh-CN'),
        _cid: req.params.cid
      }).catch(() => {})
    }
    writeAudit('reset_password', 'User ' + req.params.cid + ' 密码被管理员重置（随机密码）' + (reason ? `（原因：${reason}）` : ''), req)
    res.json({ success: true, message: '密码已重置并发送给用户', password: randomPassword })
  } catch (e) {
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// ===== 设备指纹封禁管理（查看/解除，仅超管） =====
router.get('/device-bans', async (req, res) => {
  try {
    if ((req.user?.rating ?? 0) < 12) return res.status(403).json({ success: false, message: '仅超级管理员可查看设备封禁' })
    const list = await prisma.deviceBan.findMany({ orderBy: { id: 'desc' } })
    res.json({
      success: true,
      data: list.map(x => ({
        id: x.id, fp: x.fp, reason: x.reason, bannedBy: x.bannedBy,
        bannedAt: x.bannedAt.toLocaleString('zh-CN')
      }))
    })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 手动封禁某个设备指纹
router.post('/device-bans', async (req, res) => {
  try {
    if ((req.user?.rating ?? 0) < 12) return res.status(403).json({ success: false, message: '仅超级管理员可操作' })
    const { fp, reason } = req.body
    if (!fp) return res.status(400).json({ success: false, message: '缺少设备指纹' })
    await banDeviceFp(String(fp), String(reason || ''), req.user?.cid || 'system')
    await refreshDeviceBans()
    writeAudit('ban_device', '封禁设备指纹 ' + String(fp).slice(0, 40), req)
    res.json({ success: true, message: '已封禁该设备' })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 解除设备指纹封禁
router.delete('/device-bans/:id', async (req, res) => {
  try {
    if ((req.user?.rating ?? 0) < 12) return res.status(403).json({ success: false, message: '仅超级管理员可操作' })
    await prisma.deviceBan.delete({ where: { id: Number(req.params.id) } })
    await refreshDeviceBans()
    writeAudit('unban_device', '解除设备指纹封禁 #' + req.params.id, req)
    res.json({ success: true, message: '已解除' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// ===== 用户删除审批（非超管删除/删除+封禁 → 提交审批，超管批准后执行） =====

// 提交删除审批（能进用户管理的管理员及以上）
router.post('/user-deletion-requests', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { cid, username, action, ips, reason } = req.body
    if (!cid) return res.status(400).json({ success: false, message: '缺少目标用户 CID' })
    const kind = action === 'delete_ban' ? 'delete_ban' : 'delete'
    const rec = await prisma.userChangeApproval.create({
      data: {
        cid: String(cid),
        username: String(username || ''),
        action: kind,
        ips: Array.isArray(ips) ? ips.join(',') : String(ips || ''),
        reason: String(reason || ''),
        requestedBy: req.user?.cid || 'system',
        status: 'pending'
      }
    })
    writeAudit('request_delete_user', '提交删除审批: 用户 ' + cid + '（' + (kind === 'delete_ban' ? '删除+封禁' : '删除') + '）', req)
    res.json({ success: true, data: rec })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 审批列表（仅超管）
router.get('/user-deletion-requests', async (req, res) => {
  try {
    if ((req.user?.rating ?? 0) < 12) return res.status(403).json({ success: false, message: '仅超级管理员可查看删除审批' })
    const list = await prisma.userChangeApproval.findMany({ orderBy: { id: 'desc' } })
    const cids = [...new Set(list.map(x => x.requestedBy).filter(Boolean))]
    const users = await prisma.user.findMany({ where: { cid: { in: cids } }, select: { cid: true, username: true } })
    const nameMap = Object.fromEntries(users.map(u => [u.cid, u.username]))
    const formatted = list.map(x => ({
      id: x.id,
      cid: x.cid,
      username: x.username,
      action: x.action,
      ips: x.ips,
      reason: x.reason,
      requestedBy: x.requestedBy,
      requestedName: nameMap[x.requestedBy] || '',
      status: x.status,
      createdAt: x.createdAt.toLocaleString('zh-CN'),
      reviewedAt: x.reviewedAt ? x.reviewedAt.toLocaleString('zh-CN') : null,
      reviewedBy: x.reviewedBy
    }))
    res.json({ success: true, data: formatted })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 批准（仅超管）：执行删除 + 可选封禁
router.post('/user-deletion-requests/:id/approve', async (req, res) => {
  try {
    if ((req.user?.rating ?? 0) < 12) return res.status(403).json({ success: false, message: '仅超级管理员可审批' })
    const rec = await prisma.userChangeApproval.findUnique({ where: { id: Number(req.params.id) } })
    if (!rec || rec.status !== 'pending') return res.status(404).json({ success: false, message: '审批不存在或已处理' })
    // 删除+封禁：先封设备指纹（删除前还能读到注册指纹）
    let bannedFps = []
    if (rec.action === 'delete_ban') {
      bannedFps = await banUserDevices(rec.cid, rec.reason || ('删除用户 ' + rec.username + '(' + rec.cid + ')'), req.user?.cid || 'system')
      if (bannedFps.length) await refreshDeviceBans()
    }
    // 删除用户（用户可能已被删，忽略）
    await prisma.user.delete({ where: { cid: rec.cid } }).catch(e => { if (e.code !== 'P2025') throw e })
    // 删除+封禁：执行 IP 封禁
    if (rec.action === 'delete_ban' && rec.ips) {
      for (const ipRaw of rec.ips.split(',')) {
        const ip = ipRaw.trim()
        if (!ip) continue
        const exists = await prisma.ipBan.findUnique({ where: { ip } })
        if (exists) await prisma.ipBan.update({ where: { id: exists.id }, data: { active: true, bannedBy: req.user?.cid || 'system' } })
        else await prisma.ipBan.create({ data: { ip, reason: rec.reason || ('删除用户 ' + rec.username + '(' + rec.cid + ')'), bannedBy: req.user?.cid || 'system', active: true } })
      }
      await refreshBans()
    }
    await prisma.userChangeApproval.update({ where: { id: rec.id }, data: { status: 'approved', reviewedBy: req.user?.cid || 'system', reviewedAt: new Date() } })
    writeAudit('approve_delete_user', '批准删除用户 ' + rec.cid + '（' + rec.action + '）', req)
    res.json({ success: true, message: '已批准并执行' })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 拒绝（仅超管）
router.post('/user-deletion-requests/:id/reject', async (req, res) => {
  try {
    if ((req.user?.rating ?? 0) < 12) return res.status(403).json({ success: false, message: '仅超级管理员可审批' })
    const rec = await prisma.userChangeApproval.findUnique({ where: { id: Number(req.params.id) } })
    if (!rec || rec.status !== 'pending') return res.status(404).json({ success: false, message: '审批不存在或已处理' })
    await prisma.userChangeApproval.update({ where: { id: rec.id }, data: { status: 'rejected', reviewedBy: req.user?.cid || 'system', reviewedAt: new Date() } })
    writeAudit('reject_delete_user', '拒绝删除用户 ' + rec.cid, req)
    res.json({ success: true, message: '已拒绝' })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/announcements', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const data = await prisma.announcement.findMany({ orderBy: [{ pinned: 'desc' }, { id: 'desc' }] })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/announcements', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const { title, content, pinned } = req.body
    if (!title || !content) return res.status(400).json({ success: false, message: 'missing fields' })
    const ann = await prisma.announcement.create({
      data: { title, content, publisher: req.user.username, time: new Date().toISOString().slice(0, 10), pinned: !!pinned }
    })
    writeAudit('create_announcement', 'Announcement created: ' + title, req)
    // 为所有用户创建通知
    try {
      const { createNotification } = await import('./notifications.js')
      const allUsers = await prisma.user.findMany({ select: { cid: true } })
      for (const u of allUsers) {
        await createNotification(u.cid, 'announcement', title, content.slice(0, 200), '/announcements')
      }
    } catch {}
    res.json({ success: true, data: ann })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})
// DELETE /applications/staff/:id — 删除职员申请
router.delete('/applications/staff/:id', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.application.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ success: false, message: '申请不存在' })
    await prisma.application.delete({ where: { id } })
    res.json({ success: true, message: '已删除' })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})
router.put('/announcements/:id', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const { title, content, pinned } = req.body
    const ann = await prisma.announcement.update({
      where: { id: Number(req.params.id) },
      data: { ...(title !== undefined && { title }), ...(content !== undefined && { content }), ...(pinned !== undefined && { pinned }) }
    })
    writeAudit('edit_announcement', 'Announcement #' + req.params.id + ' updated', req)
    res.json({ success: true, data: ann })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.delete('/announcements/:id', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    await prisma.announcement.delete({ where: { id: Number(req.params.id) } })
    writeAudit('delete_announcement', 'Announcement #' + req.params.id + ' deleted', req)
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/permissions', requirePermission(PERMISSIONS.USER), (req, res) => {
  res.json({ success: true, data: {} })
})



router.get('/logs/login', requireRating(12), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const skip = (Number(page) - 1) * Number(pageSize)
    const take = Number(pageSize)
    const [items, total] = await Promise.all([
      prisma.loginLog.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.loginLog.count()
    ])
    // 联查真实用户名（区分无效/不存在用户）
    const cidList = items.map(l => l.userId).filter(Boolean)
    const users = await prisma.user.findMany({ where: { cid: { in: cidList } }, select: { cid: true, username: true } })
    const userMap = Object.fromEntries(users.map(u => [u.cid, u]))
    const formatted = items.map(log => {
      const uid = log.userId || ''
      const u = userMap[uid]
      return {
        id: log.id,
        cid: uid || 'unknown',
        username: u ? u.username : (uid ? uid : 'unknown'),
        ip: log.ip,
        loginLocation: log.loginLocation || '',
        deviceFp: log.deviceFp || '',
        type: log.type || 'login',
        failReason: log.failReason || '',
        userAgent: log.userAgent || '',
        time: log.createdAt.toLocaleString('zh-CN'),
        success: log.success
      }
    })
    res.json({ success: true, data: { items: formatted, total } })
  } catch { res.status(500).json({ success: false, message: 'query failed' }) }
})

// 注册日志（仅超级管理员 rating>=12 可见, 内容与登录日志一致）
router.get('/logs/register', requireRating(12), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const skip = (Number(page) - 1) * Number(pageSize)
    const take = Number(pageSize)
    const [items, total] = await Promise.all([
      prisma.user.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.user.count()
    ])
    const formatted = items.map(u => ({
      id: u.id,
      cid: u.cid || 'unknown',
      username: u.username || 'unknown',
      ip: u.registerIp || '',
      deviceFp: u.registerFp || '',
      userAgent: u.registerUserAgent || '',
      time: u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN') : '',
      success: true
    }))
    res.json({ success: true, data: { items: formatted, total } })
  } catch { res.status(500).json({ success: false, message: 'query failed' }) }
})

// 网络日志（仅超级管理员 rating>=12 可见; 每个 IP 每 10 分钟窗口一行, 平铺叠加到同一列表）
// 规则: 调用接口/首次访问都算; 同一 IP 同一 10 分钟窗口内次数累加, 超 10 分钟新窗口 → 新增一行
router.get('/logs/network', requireRating(12), async (req, res) => {
  try {
    const { page = 1, pageSize = 50 } = req.query
    const skip = (Number(page) - 1) * Number(pageSize)
    const take = Number(pageSize)
    const [items, total] = await Promise.all([
      prisma.ipVisit.findMany({ skip, take, orderBy: [{ windowStart: 'desc' }, { count: 'desc' }] }),
      prisma.ipVisit.count()
    ])
    // 合并 ipTracker 内存中未落库的实时访问(最近 60s), 让 1 分钟刷新即见最新
    const pendingList = getPendingVisits()
    const pendingMap = new Map(pendingList.map(v => [v.ip + '|' + v.windowStart.getTime(), v]))
    const seen = new Set(items.map(v => v.ip + '|' + v.windowStart.getTime()))
    const formatted = items.map(v => {
      const p = pendingMap.get(v.ip + '|' + v.windowStart.getTime())
      return {
        ip: v.ip,
        deviceFp: (p && p.fp) || v.deviceFp || '',
        count: v.count + (p ? p.count : 0),
        windowStart: v.windowStart.toLocaleString('zh-CN'),
        lastSeen: (p ? p.last : v.lastSeen).toLocaleString('zh-CN'),
      }
    })
    // 追加 pending 中尚未落库的新窗口/新 IP 行
    for (const p of pendingList) {
      const key = p.ip + '|' + p.windowStart.getTime()
      if (!seen.has(key)) {
        formatted.push({
          ip: p.ip,
          deviceFp: p.fp || '',
          count: p.count,
          windowStart: p.windowStart.toLocaleString('zh-CN'),
          lastSeen: p.last.toLocaleString('zh-CN'),
        })
      }
    }
    // ===== IP → CID 匹配：优先登录日志(LoginLog.userId)，未匹配再查注册日志(User.registerIp) =====
    const ips = [...new Set(formatted.map(v => v.ip).filter(Boolean))]
    const loginMap = {}
    const registerMap = {}
    if (ips.length) {
      // 1) 登录日志：只匹配成功登录(success=true)，按时间倒序取该 IP 关联的去重 CID
      const loginLogs = await prisma.loginLog.findMany({
        where: { ip: { in: ips }, success: true },
        orderBy: { createdAt: 'desc' },
        select: { ip: true, userId: true }
      })
      for (const l of loginLogs) {
        const uid = String(l.userId || '').trim()
        // 只保留纯数字 CID；过滤 SQL 注入 payload(如 1145' or '1'='1' --)等非数字垃圾
        if (!/^\d+$/.test(uid)) continue
        if (!loginMap[l.ip]) loginMap[l.ip] = []
        if (!loginMap[l.ip].includes(uid)) loginMap[l.ip].push(uid)
      }
      // 2) 登录日志未匹配到的 IP → 注册日志（User.registerIp）
      const unmatchedIps = ips.filter(ip => !loginMap[ip])
      if (unmatchedIps.length) {
        const users = await prisma.user.findMany({
          where: { registerIp: { in: unmatchedIps } },
          select: { cid: true, registerIp: true }
        })
        for (const u of users) {
          const rip = u.registerIp
          if (!rip) continue
          const uid = String(u.cid)
          if (!registerMap[rip]) registerMap[rip] = []
          if (!registerMap[rip].includes(uid)) registerMap[rip].push(uid)
        }
      }
    }
    for (const v of formatted) {
      // 行内去重(Set)：同一 IP 关联的 CID 只保留一次，不显示重复
      const list = [...new Set([...(loginMap[v.ip] || []), ...(registerMap[v.ip] || [])])]
      v.cid = list.join(', ')
    }
    res.json({ success: true, data: { items: formatted, total } })
  } catch { res.status(500).json({ success: false, message: 'query failed' }) }
})

router.get('/staff', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const data = await prisma.staff.findMany({ orderBy: { cid: 'asc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/staff', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const { name, department, position, rating, active, cid } = req.body
    if (!name || !department || !position) return res.status(400).json({ success: false, message: 'missing fields' })
    let newCid = cid ? Number(cid) : null
    if (!newCid) {
      const max = await prisma.staff.findFirst({ orderBy: { cid: 'desc' } })
      newCid = (max?.cid || 3000) + 1
    } else {
      const existing = await prisma.staff.findUnique({ where: { cid: newCid } })
      if (existing) return res.status(409).json({ success: false, message: 'CID ' + newCid + ' exists' })
    }
    const newStaff = await prisma.staff.create({
      data: { cid: newCid, name, department, position, rating: rating || '', active: active !== false }
    })
    writeAudit('add_staff', 'Staff ' + name + '(' + newCid + ') added', req)
    res.json({ success: true, data: newStaff })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/staff/:cid', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const { name, department, position, rating, active } = req.body
    const item = await prisma.staff.update({
      where: { cid: Number(req.params.cid) },
      data: { ...(name !== undefined && { name }), ...(department !== undefined && { department }), ...(position !== undefined && { position }), ...(rating !== undefined && { rating }), ...(active !== undefined && { active }) }
    })
    writeAudit('edit_staff', 'Staff CID ' + req.params.cid + ' updated', req)
    res.json({ success: true, data: item })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.delete('/staff/:cid', requirePermission(PERMISSIONS.STAFF), requireRating(11), async (req, res) => {
  try {
    await prisma.staff.delete({ where: { cid: Number(req.params.cid) } })
    writeAudit('delete_staff', 'Staff CID ' + req.params.cid + ' deleted', req)
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/logs/audit', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const skip = (Number(page) - 1) * Number(pageSize)
    const take = Number(pageSize)
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count()
    ])
    const formatted = items.map(log => ({
      id: log.id, action: log.action, operator: log.userId,
      detail: log.detail, time: log.createdAt.toLocaleString('zh-CN')
    }))
    res.json({ success: true, data: { items: formatted, total } })
  } catch { res.status(500).json({ success: false, message: 'query failed' }) }
})

// ──────────────────────────────────────────────
// IP 封禁管理
//   GET    /admin/ip-bans       列表
//   POST   /admin/ip-bans       新增封禁 { ip, reason?, hours? }（hours=0/缺省=永久）
//   PUT    /admin/ip-bans/:id   启用/禁用 或 续期 { active?, hours? }
//   DELETE /admin/ip-bans/:id   删除封禁
// ──────────────────────────────────────────────

router.get('/ip-bans', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const bans = await prisma.ipBan.findMany({ orderBy: [{ active: 'desc' }, { id: 'desc' }] })
    const now = Date.now()
    // 查询封禁人用户名（bannedBy 为 CID）
    const cids = [...new Set(bans.map(b => b.bannedBy).filter(Boolean))]
    const userRows = cids.length
      ? await prisma.user.findMany({ where: { cid: { in: cids } }, select: { cid: true, username: true } })
      : []
    const nameMap = Object.fromEntries(userRows.map(u => [u.cid, u.username]))
    // 被封禁 IP → 关联用户 CID（通过注册 IP 匹配，一个 IP 可能对应多个用户）
    const ipUsers = await prisma.user.findMany({
      where: { registerIp: { not: '' } },
      select: { cid: true, registerIp: true }
    })
    const ipToCids = {}
    ipUsers.forEach(u => {
      if (u.registerIp) {
        if (!ipToCids[u.registerIp]) ipToCids[u.registerIp] = []
        ipToCids[u.registerIp].push(u.cid)
      }
    })
    Object.keys(ipToCids).forEach(k => { ipToCids[k] = [...new Set(ipToCids[k])] })
    const formatted = bans.map(b => ({
      id: b.id,
      ip: b.ip,
      reason: b.reason,
      bannedBy: b.bannedBy,
      bannedName: nameMap[b.bannedBy] || '',
      bannedUser: b.bannedUser || '',
      bannedUserCids: ipToCids[b.ip] || [],
      active: b.active && (!b.expiresAt || new Date(b.expiresAt).getTime() > now),
      expired: !!b.expiresAt && new Date(b.expiresAt).getTime() < now,
      expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
      createdAt: b.createdAt.toLocaleString('zh-CN')
    }))
    res.json({ success: true, data: formatted })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/ip-bans', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { ip, reason, hours, bannedUser } = req.body
    const normalized = normalizeIp(ip)
    if (!normalized) return res.status(400).json({ success: false, message: '无效的 IP 地址' })
    const expiresAt = hours && Number(hours) > 0
      ? new Date(Date.now() + Number(hours) * 60 * 60 * 1000)
      : null
    // 相同 IP 已存在时直接重新激活/更新
    const exists = await prisma.ipBan.findUnique({ where: { ip: normalized } })
    let record
    if (exists) {
      record = await prisma.ipBan.update({
        where: { id: exists.id },
        data: { active: true, reason: reason || exists.reason, bannedBy: req.user?.cid || 'system', bannedUser: bannedUser || exists.bannedUser, expiresAt }
      })
    } else {
      record = await prisma.ipBan.create({
        data: { ip: normalized, reason: reason || '', bannedBy: req.user?.cid || 'system', bannedUser: bannedUser || '', active: true, expiresAt }
      })
    }
    writeAudit('ban_ip', 'IP ' + normalized + ' 被封禁' + (reason ? '（' + reason + '）' : '') + (expiresAt ? '，至 ' + expiresAt.toLocaleString('zh-CN') : '（永久）'), req)
    await refreshBans()
    res.json({ success: true, data: record })
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ success: false, message: '该 IP 已在封禁列表中' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.put('/ip-bans/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { active, hours, ip, reason, bannedUser } = req.body
    const data = {}
    if (ip !== undefined && String(ip).trim() !== '') {
      const normalized = normalizeIp(String(ip).trim())
      if (!normalized) return res.status(400).json({ success: false, message: '无效的 IP 地址' })
      // 新 IP 不能被其他封禁记录占用（ip 为唯一键）
      const dup = await prisma.ipBan.findFirst({ where: { ip: normalized, id: { not: Number(req.params.id) } } })
      if (dup) return res.status(409).json({ success: false, message: '该 IP 已在封禁列表中' })
      data.ip = normalized
    }
    if (reason !== undefined) data.reason = reason
    if (bannedUser !== undefined) data.bannedUser = String(bannedUser || '')
    if (active !== undefined) data.active = !!active
    if (hours !== undefined && Number(hours) > 0) data.expiresAt = new Date(Date.now() + Number(hours) * 60 * 60 * 1000)
    const record = await prisma.ipBan.update({ where: { id: Number(req.params.id) }, data })
    if (active !== undefined) {
      writeAudit(record.active ? 'unban_ip' : 'ban_ip', 'IP ' + record.ip + (record.active ? ' 已解封' : ' 已封禁'), req)
    } else {
      writeAudit('edit_ban', 'IP 封禁已编辑: ' + record.ip + (reason !== undefined ? '，原因=' + reason : ''), req)
    }
    await refreshBans()
    res.json({ success: true, data: record })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.delete('/ip-bans/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const rec = await prisma.ipBan.findUnique({ where: { id: Number(req.params.id) } })
    await prisma.ipBan.delete({ where: { id: Number(req.params.id) } })
    writeAudit('unban_ip', 'IP ' + (rec?.ip || '#' + req.params.id) + ' 已从封禁列表删除', req)
    await refreshBans()
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// ===== 网络管理（IP 白/黑名单） =====

router.get('/ip-list', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const list = await prisma.ipList.findMany({ orderBy: { id: 'desc' } })
    const cids = [...new Set(list.map(x => x.addedBy).filter(Boolean))]
    const users = await prisma.user.findMany({ where: { cid: { in: cids } }, select: { cid: true, username: true } })
    const nameMap = Object.fromEntries(users.map(u => [u.cid, u.username]))
    const formatted = list.map(x => ({
      id: x.id,
      ip: x.ip,
      type: x.type,
      reason: x.reason || '',
      addedBy: x.addedBy || '',
      addedName: nameMap[x.addedBy] || '',
      active: x.active,
      createdAt: x.createdAt.toLocaleString('zh-CN')
    }))
    res.json({ success: true, data: formatted })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/ip-list', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { ip, type, reason } = req.body
    const normalized = normalizeIp(ip)
    if (!normalized) return res.status(400).json({ success: false, message: '无效的 IP 地址' })
    const kind = type === 'white' ? 'white' : 'black'
    // 相同 IP 已存在时直接更新类型/激活
    const exists = await prisma.ipList.findUnique({ where: { ip: normalized } })
    let record
    if (exists) {
      record = await prisma.ipList.update({
        where: { id: exists.id },
        data: { type: kind, reason: reason || exists.reason, addedBy: req.user?.cid || 'system', active: true }
      })
    } else {
      record = await prisma.ipList.create({
        data: { ip: normalized, type: kind, reason: reason || '', addedBy: req.user?.cid || 'system', active: true }
      })
    }
    writeAudit('add_ip_list', 'IP ' + normalized + ' 加入' + (kind === 'white' ? '白名单' : '黑名单') + (reason ? '（' + reason + '）' : ''), req)
    await refreshIpList()
    res.json({ success: true, data: record })
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ success: false, message: '该 IP 已在名单中' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.put('/ip-list/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { ip, type, reason, active } = req.body
    const data = {}
    if (ip !== undefined && String(ip).trim() !== '') {
      const normalized = normalizeIp(String(ip).trim())
      if (!normalized) return res.status(400).json({ success: false, message: '无效的 IP 地址' })
      // 新 IP 不能被其他记录占用（ip 为唯一键）
      const dup = await prisma.ipList.findFirst({ where: { ip: normalized, id: { not: Number(req.params.id) } } })
      if (dup) return res.status(409).json({ success: false, message: '该 IP 已在名单中' })
      data.ip = normalized
    }
    if (type !== undefined) data.type = type === 'white' ? 'white' : 'black'
    if (reason !== undefined) data.reason = reason
    if (active !== undefined) data.active = !!active
    const record = await prisma.ipList.update({ where: { id: Number(req.params.id) }, data })
    writeAudit('edit_ip_list', 'IP ' + record.ip + ' 名单信息已更新', req)
    await refreshIpList()
    res.json({ success: true, data: record })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.delete('/ip-list/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const rec = await prisma.ipList.findUnique({ where: { id: Number(req.params.id) } })
    await prisma.ipList.delete({ where: { id: Number(req.params.id) } })
    writeAudit('delete_ip_list', 'IP ' + (rec?.ip || '#' + req.params.id) + ' 已从名单删除', req)
    await refreshIpList()
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.post('/ip-list/import', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { type, ips, reason } = req.body
    // ips: 元素为字符串 IP，或 { ip, reason } 对象（行内备注）
    if (!Array.isArray(ips) || ips.length === 0) {
      return res.status(400).json({ success: false, message: '未提供有效 IP 列表' })
    }
    if (ips.length > 5000) return res.status(400).json({ success: false, message: '单次最多导入 5000 条' })
    const kind = type === 'white' ? 'white' : 'black'
    const defaultReason = String(reason || '').trim() // 网页备注（可选），行内备注优先
    let added = 0
    let skipped = 0
    for (const item of ips) {
      const raw = typeof item === 'string' ? item : (item?.ip ?? '')
      const itemReason = (typeof item === 'object' && item ? String(item.reason || '') : '').trim()
      const normalized = normalizeIp(String(raw || '').trim())
      if (!normalized) { skipped++; continue }
      const finalReason = itemReason || defaultReason || '批量导入'
      const exists = await prisma.ipList.findUnique({ where: { ip: normalized } })
      if (exists) {
        await prisma.ipList.update({ where: { id: exists.id }, data: { type: kind, active: true, addedBy: req.user?.cid || 'system', ...(finalReason && { reason: finalReason }) } })
      } else {
        await prisma.ipList.create({ data: { ip: normalized, type: kind, reason: finalReason, addedBy: req.user?.cid || 'system', active: true } })
      }
      added++
    }
    writeAudit('import_ip_list', '批量导入' + (kind === 'white' ? '白名单' : '黑名单') + ' ' + added + ' 条，跳过 ' + skipped + ' 条', req)
    await refreshIpList()
    res.json({ success: true, data: { added, skipped } })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// ===== 网络管理（IP 集合：一组 IP 组成一个集合） =====

router.get('/ip-groups', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const groups = await prisma.ipGroup.findMany({
      orderBy: { id: 'desc' },
      include: { members: { select: { id: true, ip: true, createdAt: true } } }
    })
    const cids = [...new Set(groups.map(g => g.addedBy).filter(Boolean))]
    const users = await prisma.user.findMany({ where: { cid: { in: cids } }, select: { cid: true, username: true } })
    const nameMap = Object.fromEntries(users.map(u => [u.cid, u.username]))
    const formatted = groups.map(g => ({
      id: g.id,
      name: g.name,
      type: g.type,
      reason: g.reason || '',
      addedBy: g.addedBy || '',
      addedName: nameMap[g.addedBy] || '',
      active: g.active,
      createdAt: g.createdAt.toLocaleString('zh-CN'),
      members: g.members.map(m => ({ id: m.id, ip: m.ip }))
    }))
    res.json({ success: true, data: formatted })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 集合概览（不含成员明细，仅带成员计数，供主卡片轻量展示，减少带宽）
router.get('/ip-groups/summary', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const groups = await prisma.ipGroup.findMany({
      orderBy: { id: 'desc' },
      include: { _count: { select: { members: true } } }
    })
    const cids = [...new Set(groups.map(g => g.addedBy).filter(Boolean))]
    const users = await prisma.user.findMany({ where: { cid: { in: cids } }, select: { cid: true, username: true } })
    const nameMap = Object.fromEntries(users.map(u => [u.cid, u.username]))
    const formatted = groups.map(g => ({
      id: g.id,
      name: g.name,
      type: g.type,
      active: g.active,
      addedBy: g.addedBy || '',
      addedName: nameMap[g.addedBy] || '',
      memberCount: g._count.members,
      createdAt: g.createdAt.toLocaleString('zh-CN')
    }))
    res.json({ success: true, data: formatted })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/ip-groups', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { name, type, reason } = req.body
    const kind = type === 'white' ? 'white' : 'black'
    const record = await prisma.ipGroup.create({
      data: {
        name: String(name || '').trim().slice(0, 100) || (kind === 'white' ? '白名单集合' : '黑名单集合'),
        type: kind,
        reason: reason || '',
        addedBy: req.user?.cid || 'system',
        active: true
      }
    })
    writeAudit('add_ip_group', '创建' + (kind === 'white' ? '白名单' : '黑名单') + '集合 ' + record.name, req)
    await refreshIpList()
    res.json({ success: true, data: record })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/ip-groups/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { name, type, reason, active } = req.body
    const data = {}
    if (name !== undefined) data.name = String(name || '').trim().slice(0, 100)
    if (type !== undefined) data.type = type === 'white' ? 'white' : 'black'
    if (reason !== undefined) data.reason = reason
    if (active !== undefined) data.active = !!active
    const record = await prisma.ipGroup.update({ where: { id: Number(req.params.id) }, data })
    writeAudit('edit_ip_group', 'IP 集合 ' + record.name + ' 已更新', req)
    await refreshIpList()
    res.json({ success: true, data: record })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.delete('/ip-groups/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const rec = await prisma.ipGroup.findUnique({ where: { id: Number(req.params.id) } })
    await prisma.ipGroup.delete({ where: { id: Number(req.params.id) } })
    writeAudit('delete_ip_group', 'IP 集合 ' + (rec?.name || '#' + req.params.id) + ' 已删除（含其 IP）', req)
    await refreshIpList()
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.post('/ip-groups/:id/members', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const gid = Number(req.params.id)
    const { ip } = req.body
    const normalized = normalizeIp(ip)
    if (!normalized) return res.status(400).json({ success: false, message: '无效的 IP 地址' })
    const group = await prisma.ipGroup.findUnique({ where: { id: gid } })
    if (!group) return res.status(404).json({ success: false, message: '集合不存在' })
    const record = await prisma.ipGroupMember.create({ data: { groupId: gid, ip: normalized } })
    writeAudit('add_ip_group_member', 'IP ' + normalized + ' 加入集合 ' + group.name, req)
    await refreshIpList()
    res.json({ success: true, data: record })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.delete('/ip-groups/:id/members/:mid', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const rec = await prisma.ipGroupMember.findUnique({ where: { id: Number(req.params.mid) } })
    await prisma.ipGroupMember.delete({ where: { id: Number(req.params.mid) } })
    writeAudit('delete_ip_group_member', 'IP ' + (rec?.ip || '#' + req.params.mid) + ' 已从集合移除', req)
    await refreshIpList()
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.post('/ip-groups/import', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { groupId, ips } = req.body
    if (!groupId) return res.status(400).json({ success: false, message: '请选择目标集合' })
    if (!Array.isArray(ips) || ips.length === 0) return res.status(400).json({ success: false, message: '未提供有效 IP 列表' })
    if (ips.length > 5000) return res.status(400).json({ success: false, message: '单次最多导入 5000 条' })
    const gid = Number(groupId)
    const group = await prisma.ipGroup.findUnique({ where: { id: gid } })
    if (!group) return res.status(404).json({ success: false, message: '集合不存在' })
    // 去重：集合已有 IP + 本次列表内去重
    const exist = new Set((await prisma.ipGroupMember.findMany({ where: { groupId: gid }, select: { ip: true } })).map(m => m.ip))
    const seen = new Set()
    const toCreate = []
    for (const item of ips) {
      const raw = typeof item === 'string' ? item : (item?.ip ?? '')
      const normalized = normalizeIp(String(raw || '').trim())
      if (!normalized) continue
      if (exist.has(normalized) || seen.has(normalized)) continue
      seen.add(normalized)
      toCreate.push({ groupId: gid, ip: normalized })
    }
    // 批量插入（createMany 一次 SQL 多行，避免逐条慢导致前端超时）
    if (toCreate.length) {
      await prisma.ipGroupMember.createMany({ data: toCreate })
    }
    const skipped = ips.length - toCreate.length
    writeAudit('import_ip_group', '向集合 ' + group.name + ' 导入 ' + toCreate.length + ' 条，跳过 ' + skipped + ' 条', req)
    await refreshIpList()
    res.json({ success: true, data: { added: toCreate.length, skipped } })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/events', requirePermission(PERMISSIONS.EVENT), async (req, res) => {
  try {
    const { applyDynamicStatus } = await import('./events.js')
    const rows = await prisma.event.findMany({ orderBy: { id: 'desc' } })
    res.json({ success: true, data: applyDynamicStatus(rows) })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/events', requirePermission(PERMISSIONS.EVENT), async (req, res) => {
  try {
    const { title, date, time, dep, arr, route, distance, notams, atcPositions, desc, status, poster } = req.body
    if (!title || !date) return res.status(400).json({ success: false, message: 'missing fields' })
    const evt = await prisma.event.create({
      data: { title, date, time: time || '', dep: dep || '', arr: arr || '', route: route || '', publisher: req.user.cid, distance: distance || '', notams: notams || '', atcPositions: atcPositions || '', desc: desc || '', poster: poster || '', status: status || '筹备中' }
    })
    res.json({ success: true, data: evt })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/events/:id', requirePermission(PERMISSIONS.EVENT), async (req, res) => {
  try {
    const { title, date, time, dep, arr, route, distance, notams, atcPositions, desc, status, poster } = req.body
    const evt = await prisma.event.update({
      where: { id: Number(req.params.id) },
      data: { ...(title !== undefined && { title }), ...(date !== undefined && { date }), ...(time !== undefined && { time }), ...(dep !== undefined && { dep }), ...(arr !== undefined && { arr }), ...(route !== undefined && { route }), ...(distance !== undefined && { distance }), ...(notams !== undefined && { notams }), ...(atcPositions !== undefined && { atcPositions }), ...(desc !== undefined && { desc }), ...(poster !== undefined && { poster }), ...(status !== undefined && { status }) }
    })
    res.json({ success: true, data: evt })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 活动海报上传
router.post('/events/:id/poster', requirePermission(PERMISSIONS.EVENT), uploadPoster.single('poster'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '请选择图片' })
  // 魔数二次校验(2026-10-25 审计 P0-1, 复审修正: 校验必须在 POST 路由)
  if (!isImageBuffer(fs2.readFileSync(req.file.path).subarray(0, 16))) {
    fs2.unlinkSync(req.file.path)
    return res.status(400).json({ success: false, message: '文件内容不是有效图片' })
  }
  const posterPath = '/uploads/posters/' + req.file.filename
  await prisma.event.update({
    where: { id: Number(req.params.id) },
    data: { poster: posterPath }
  })
  res.json({ success: true, data: { poster: posterPath } })
})

// 获取活动报名列表（含用户信息）— 必须在 DELETE /events/:id 之前定义
router.get('/events/:id/registrations', requirePermission(PERMISSIONS.EVENT), async (req, res) => {
  try {
    const eventId = Number(req.params.id)
    const [pilots, controllers] = await Promise.all([
      prisma.eventRegistration.findMany({ where: { eventId, type: 'pilot', status: { not: 'cancelled' } }, orderBy: { createdAt: 'asc' } }),
      prisma.eventRegistration.findMany({ where: { eventId, type: 'controller', status: { not: 'cancelled' } }, orderBy: { createdAt: 'asc' } })
    ])
    const allIds = [...pilots.map(p => p.userId), ...controllers.map(c => c.userId)]
    const users = await prisma.user.findMany({ where: { cid: { in: allIds } }, select: { cid: true, username: true, rating: true, fsdLevel: true } })
    const userMap = Object.fromEntries(users.map(u => [u.cid, u]))
    const evt = await prisma.event.findUnique({ where: { id: eventId } })
    res.json({
      success: true, data: {
        ...evt,
        pilots: pilots.map(p => ({ ...p, user: userMap[p.userId] || null })),
        controllers: controllers.map(c => ({ ...c, user: userMap[c.userId] || null })),
        pilotCount: pilots.length,
        controllerCount: controllers.length
      }
    })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// 管理员取消任意报名 — 必须在 DELETE /events/:id 之前定义
router.delete('/events/registrations/:regId', requirePermission(PERMISSIONS.EVENT), async (req, res) => {
  try {
    const reg = await prisma.eventRegistration.findUnique({ where: { id: Number(req.params.regId) } })
    if (!reg) return res.status(404).json({ success: false, message: '报名记录不存在' })
    await prisma.eventRegistration.update({ where: { id: Number(req.params.regId) }, data: { status: 'cancelled' } })
    res.json({ success: true, message: '已取消报名' })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.delete('/events/:id', requirePermission(PERMISSIONS.EVENT), async (req, res) => {
  try {
    await prisma.event.delete({ where: { id: Number(req.params.id) } })
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// 机场地面数据提交（超管 + WEB_SECRET 密码双校验）：把网页机场编辑结果存为服务器文件
// 前端加载时优先 /uploads/airports/{icao}.json，不存在则回退静态 /airports/{icao}.json
// 物理存储：backend/src/data（URL 由 server.js 映射到 /uploads/airports）
const airportEditDir = path.resolve(__dirname, '../data')
fs.mkdirSync(airportEditDir, { recursive: true })
router.post('/airports/:icao', async (req, res) => {
  try {
    const icao = String(req.params.icao || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!icao) return res.status(400).json({ success: false, message: '无效 ICAO' })
    // 安全(2026-10-25 审计 P2-1): 超管专属 + WEB_SECRET 常量时间比较
    if (req.user?.rating !== 12) {
      return res.status(403).json({ success: false, message: '仅超级管理员可提交机场数据' })
    }
    const { secret, geojson } = req.body || {}
    // 提交密码必须与 .env 的 WEB_SECRET 一致(常量时间比较, 防时序侧信道)
    if (!process.env.WEB_SECRET || typeof secret !== 'string' ||
        !crypto.timingSafeEqual(crypto.createHash('sha256').update(String(secret)).digest(),
                                crypto.createHash('sha256').update(String(process.env.WEB_SECRET)).digest())) {
      return res.status(403).json({ success: false, message: '提交密码不正确' })
    }
    if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      return res.status(400).json({ success: false, message: '数据格式不正确' })
    }
    fs.writeFileSync(path.join(airportEditDir, `${icao}.json`), JSON.stringify(geojson))
    writeAudit('edit_map', `User ${req.user?.cid || 'unknown'} update MAP-${icao}`, req)
    res.json({ success: true, message: `${icao} 机场地面数据已提交，所有用户已生效` })
  } catch (e) { console.error('[admin.js] airports submit', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/applications/role', requirePermission(PERMISSIONS.CONTROLLER), (req, res) => {
  res.json({ success: true, data: [] })
})

router.get('/applications/staff', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const data = await prisma.application.findMany({ where: { type: 'staff' }, orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/applications/staff/:id', requirePermission(PERMISSIONS.STAFF), async (req, res) => {
  try {
    const { status, reviewComment, interviewTime1, interviewTime2 } = req.body
    const appId = Number(req.params.id)
    const current = await prisma.application.findUnique({ where: { id: appId } })
    if (!current) return res.status(404).json({ success: false, message: '申请不存在' })

    // 审批流程：待审核 → 待面试 → 已通过 / 已拒绝
    const isInterviewInvite = status === '待面试'
    const isApproved = status === '已通过' || status === 'Approved'
    const isRejected = status === '已拒绝' || status === 'Rejected'

    // 必须先安排面试，面试通过后才能通过申请
    if (isApproved && current.status !== '待面试') {
      return res.status(400).json({ success: false, message: '该申请尚未面试，请先邀请面试，面试通过后才能通过申请' })
    }

    const appData = { status }
    if (reviewComment !== undefined) appData.reviewComment = reviewComment
    if (interviewTime1 !== undefined) appData.interviewTime1 = interviewTime1
    if (interviewTime2 !== undefined) appData.interviewTime2 = interviewTime2
    const app = await prisma.application.update({ where: { id: appId }, data: appData })

    if (isApproved) {
      const cid = parseInt(app.userId)
      if (!isNaN(cid)) {
        const existing = await prisma.staff.findUnique({ where: { cid } })
        if (!existing) {
          await prisma.staff.create({
            data: { cid, name: app.name, department: app.department || 'General', position: 'Staff', active: true }
          })
        }
      }
    }
    // Send email for interview invite / approval / rejection
    if (isInterviewInvite || isApproved || isRejected) {
      try {
        const user = await prisma.user.findUnique({ where: { cid: app.userId } })
        if (user?.email) {
          const { sendReviewResult, sendInterviewInvite } = await import('../utils/mailer.js')
          if (isInterviewInvite) {
            const times = [interviewTime1, interviewTime2].filter(Boolean)
            const timeHtml = times.length
              ? `<br><br><strong>面试时间：</strong><br>` + times.map((t, i) => `${i + 1}. ${escapeHtml(t)}`).join('<br>')
              : ''
            sendInterviewInvite(user.email, {
              applicationType: '职员申请',
              reason: escapeHtml(reviewComment || ''),
              detail: '申请对象：' + escapeHtml(app.name || app.userId) + timeHtml
            }).catch(() => {})
          } else {
            sendReviewResult(user.email, {
              applicationType: '职员申请',
              result: isApproved ? '已通过' : '已拒绝',
              reason: escapeHtml(reviewComment || ''),
              detail: '申请对象：' + escapeHtml(app.name || app.userId)
            }).catch(() => {})
          }
        }
      } catch (mailErr) { console.error('[Email] Staff review send failed:', mailErr.message) }
    }
    res.json({ success: true, data: app })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/applications/controller', requirePermission(PERMISSIONS.CONTROLLER), async (req, res) => {
  try {
    const data = await prisma.application.findMany({ where: { type: 'controller' }, orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/applications/controller/:id', requirePermission(PERMISSIONS.CONTROLLER), async (req, res) => {
  try {
    const { status, reviewComment, interviewTime1, interviewTime2 } = req.body
    const appId = Number(req.params.id)
    const current = await prisma.application.findUnique({ where: { id: appId } })
    if (!current) return res.status(404).json({ success: false, message: '申请不存在' })

    // 审批流程：待审核 → 待面试 → 已通过 / 已拒绝
    const isInterviewInvite = status === '待面试'
    const isApproved = status === '已通过' || status === 'Approved'
    const isRejected = status === '已拒绝' || status === 'Rejected'

    // 必须先安排面试，面试通过后才能通过申请
    if (isApproved && current.status !== '待面试') {
      return res.status(400).json({ success: false, message: '该申请尚未面试，请先邀请面试，面试通过后才能通过申请' })
    }

    const appData = { status }
    if (reviewComment !== undefined) appData.reviewComment = reviewComment
    if (interviewTime1 !== undefined) appData.interviewTime1 = interviewTime1
    if (interviewTime2 !== undefined) appData.interviewTime2 = interviewTime2
    const app = await prisma.application.update({ where: { id: appId }, data: appData })

    if (isApproved) {
      const cid = parseInt(app.userId)
      if (!isNaN(cid)) {
        const existing = await prisma.staff.findUnique({ where: { cid } })
        if (!existing) {
          await prisma.staff.create({
            data: { cid, name: app.name, department: 'Control', position: 'Controller', active: true }
          })
        } else if (!existing.department.includes('Control')) {
          await prisma.staff.update({
            where: { cid },
            data: { department: 'Control', position: existing.position || 'Controller' }
          })
        }
      }
    }
    // Send email for interview invite / approval / rejection
    if (isInterviewInvite || isApproved || isRejected) {
      try {
        const user = await prisma.user.findUnique({ where: { cid: app.userId } })
        if (user?.email) {
          const { sendReviewResult, sendInterviewInvite } = await import('../utils/mailer.js')
          if (isInterviewInvite) {
            const times = [interviewTime1, interviewTime2].filter(Boolean)
            const timeHtml = times.length
              ? `<br><br><strong>面试时间：</strong><br>` + times.map((t, i) => `${i + 1}. ${escapeHtml(t)}`).join('<br>')
              : ''
            sendInterviewInvite(user.email, {
              applicationType: '管制员申请',
              reason: escapeHtml(reviewComment || ''),
              detail: '申请对象：' + escapeHtml(app.name || app.userId) + timeHtml
            }).catch(() => {})
          } else {
            sendReviewResult(user.email, {
              applicationType: '管制员申请',
              result: isApproved ? '已通过' : '已拒绝',
              reason: escapeHtml(reviewComment || ''),
              detail: '申请对象：' + escapeHtml(app.name || app.userId)
            }).catch(() => {})
          }
        }
      } catch (mailErr) { console.error('[Email] Controller review send failed:', mailErr.message) }
    }
    res.json({ success: true, data: app })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

// DELETE /applications/controller/:id — 删除管制申请
router.delete('/applications/controller/:id', requirePermission(PERMISSIONS.CONTROLLER), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.application.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ success: false, message: '申请不存在' })
    await prisma.application.delete({ where: { id } })
    res.json({ success: true, message: '已删除' })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/forum', requirePermission(PERMISSIONS.STAFF), (req, res) => {
  res.json({ success: true, data: [] })
})

router.get('/va', requirePermission(PERMISSIONS.USER), (req, res) => {
  res.json({ success: true, data: {} })
})

router.get('/flightplans', requirePermission(PERMISSIONS.FLIGHTPLAN), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, userId } = req.query
    const where = {}
    if (userId) where.userId = userId
    const total = await prisma.flightPlan.count({ where })
    const items = await prisma.flightPlan.findMany({
      where, orderBy: { id: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize), take: Number(pageSize)
    })
    res.json({ success: true, data: { items, total } })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.delete('/flightplans/:id', requirePermission(PERMISSIONS.FLIGHTPLAN), async (req, res) => {
  try {
    await prisma.flightPlan.delete({ where: { id: Number(req.params.id) } })
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/tickets', requirePermission(PERMISSIONS.TICKET), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const total = await prisma.ticket.count()
    const items = await prisma.ticket.findMany({
      orderBy: { id: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize), take: Number(pageSize)
    })
    res.json({ success: true, data: { items, total } })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/tickets/:id', requirePermission(PERMISSIONS.TICKET), async (req, res) => {
  try {
    const { status, reply } = req.body
    // 禁止职员处理自己的工单
    const existing = await prisma.ticket.findUnique({ where: { id: Number(req.params.id) } })
    if (!existing) return res.status(404).json({ success: false, message: '工单不存在' })
    if (existing.userId === req.user.cid) {
      return res.status(403).json({ success: false, message: '不能处理自己的工单' })
    }
    const data = {}
    if (status !== undefined) data.status = status
    if (reply !== undefined) data.reply = reply
    const ticket = await prisma.ticket.update({ where: { id: Number(req.params.id) }, data })
    // Send email notification when ticket is replied
    if (reply !== undefined && ticket.userId) {
      try {
        const ticketUser = await prisma.user.findUnique({ where: { cid: ticket.userId } })
        if (ticketUser?.email) {
          const { sendNotification } = await import('../utils/mailer.js')
          sendNotification(ticketUser.email, {
            subject: '工单 #' + ticket.id + ' 已回复',
            intro: '您的工单收到了一条新的回复。',
            body: '工单标题：' + (ticket.title || '') + '<br>回复内容：' + reply.slice(0, 500),
            action: '查看工单',
            actionUrl: (process.env.FRONTEND_URL || 'http://localhost:5173') + '/tickets',
            _cid: ticket.userId
          }).catch(() => {})
        }
      } catch (mailErr) { console.error('[Email] Ticket reply send failed:', mailErr.message) }
    }
    res.json({ success: true, data: ticket })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.delete('/tickets/:id', requirePermission(PERMISSIONS.TICKET), async (req, res) => {
  try {
    await prisma.ticket.delete({ where: { id: Number(req.params.id) } })
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/controllers', requirePermission(PERMISSIONS.CONTROLLER), async (req, res) => {
  try {
    const data = await prisma.staff.findMany({ where: { department: { contains: 'Control' } } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/controllers/:cid', requirePermission(PERMISSIONS.CONTROLLER), requireRating(11), async (req, res) => {
  try {
    const { name, position, rating } = req.body
    const item = await prisma.staff.update({
      where: { cid: Number(req.params.cid) },
      data: { ...(name !== undefined && { name }), ...(position !== undefined && { position }), ...(rating !== undefined && { rating }) }
    })
    res.json({ success: true, data: item })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/online', requirePermission(PERMISSIONS.ONLINE), async (req, res) => {
  try {
    // 获取 FSD 在线数据
    const whazzup = await prisma.whazzupData.findFirst({ orderBy: { id: 'desc' } })
    // 获取职员在线状态
    const staff = await prisma.staff.findMany({ orderBy: { cid: 'asc' } })
    res.json({
      success: true,
      data: {
        clients: whazzup ? JSON.parse(whazzup.data).clients || [] : [],
        servers: whazzup ? JSON.parse(whazzup.data).servers || [] : [],
        staff
      }
    })
  } catch { res.json({ success: true, data: { clients: [], servers: [], staff: [] } }) }
})

router.put('/online/staff/:cid', requirePermission(PERMISSIONS.ONLINE), async (req, res) => {
  try {
    const { active } = req.body
    const item = await prisma.staff.update({
      where: { cid: Number(req.params.cid) },
      data: { active: active !== false }
    })
    res.json({ success: true, data: item })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/notifications', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const data = await prisma.notification.findMany({ orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/notifications', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { title, content, targetUsers } = req.body
    if (!title || !content) return res.status(400).json({ success: false, message: 'missing fields' })
    const notif = await prisma.notification.create({
      data: { title, content, publisher: req.user.username, targetUsers: targetUsers || '' }
    })
    res.json({ success: true, data: notif, message: 'sent' })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.delete('/notifications/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    await prisma.notification.delete({ where: { id: Number(req.params.id) } })
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/training/courses', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const data = await prisma.trainingCourse.findMany({ orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/training/courses', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { title, content, type } = req.body
    if (!title || !content) return res.status(400).json({ success: false, message: 'missing fields' })
    const course = await prisma.trainingCourse.create({ data: { title, content, type: type || 'article', publisher: req.user.username } })
    res.json({ success: true, data: course })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.delete('/training/courses/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    await prisma.trainingCourse.delete({ where: { id: Number(req.params.id) } })
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/training/records', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const data = await prisma.trainingRecord.findMany({ orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.get('/achievements', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const data = await prisma.achievement.findMany({ orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.post('/achievements', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const { name, description, icon } = req.body
    if (!name) return res.status(400).json({ success: false, message: 'missing fields' })
    const ach = await prisma.achievement.create({ data: { name, description: description || '', icon: icon || '' } })
    res.json({ success: true, data: ach })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.delete('/achievements/:id', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    await prisma.achievement.delete({ where: { id: Number(req.params.id) } })
    res.json({ success: true, message: 'deleted' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'not found' })
    console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' })
  }
})

router.get('/config', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const data = await prisma.systemConfig.findMany()
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

router.put('/config/:key', requirePermission(PERMISSIONS.USER), async (req, res) => {
  try {
    const data = await prisma.systemConfig.upsert({ where: { key: req.params.key }, update: { value: req.body.value }, create: { key: req.params.key, value: req.body.value } })
    res.json({ success: true, data })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

// FSD Kick - notify user via email when kicked from FSD server
router.post('/kick-fsd', requirePermission(PERMISSIONS.ONLINE), async (req, res) => {
  try {
    const { cid, reason } = req.body
    if (!cid) return res.status(400).json({ success: false, message: 'missing cid' })
    const user = await prisma.user.findUnique({ where: { cid } })
    if (user?.email) {
      const { sendNotification } = await import('../utils/mailer.js')
      await sendNotification(user.email, {
        subject: '您已被移出 FSD 服务器',
        intro: '您已从 FSD 服务器断开连接。',
        body: 'CID：' + cid + '<br>原因：' + (reason || '未提供原因。') + '<br>如果您认为这是误操作，请联系管理员。',
        _cid: cid
      })
    }
    writeAudit('kick_fsd', 'User ' + cid + ' kicked from FSD: ' + (reason || ''), req)
    res.json({ success: true, message: 'kick notification sent' })
  } catch (e) { console.error('[admin.js]', e?.message); res.status(500).json({ success: false, message: '操作失败' }) }
})

export default router
