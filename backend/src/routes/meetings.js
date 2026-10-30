import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import mammoth from 'mammoth'
import { fileURLToPath } from 'url'
import prisma from '../utils/prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.resolve(__dirname, '../../uploads/meetings')
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    // multer/busboy 默认按 latin1 解码文件名，先还原为 UTF-8
    const name = fixFileName(file.originalname)
    // 防止路径遍历：只保留文件名中的安全字符
    const safeName = path.basename(name).replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

// multer/busboy 默认按 latin1 解码 multipart 文件名，中文会变乱码；这里还原为 UTF-8
function fixFileName(s) {
  try { return Buffer.from(s, 'latin1').toString('utf8') } catch { return s }
}

import { authenticate, requireRating } from '../middleware/auth.js'

const router = Router()

// 演示数据已清除，上线后由管理员创建

// --- Routes ---

// GET / — 获取会议列表
router.get('/', async (req, res) => {
  try {
    const data = await prisma.meeting.findMany({ orderBy: { id: 'desc' } })
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: '查询失败' })
  }
})

// 添加公共的 HTML 转义函数
function escapeHtml(str) {
  if (!str) return ''
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
  return String(str).replace(/[&<>"']/g, ch => map[ch])
}

// 解析文档为 HTML（在后台任务中执行，不阻塞上传响应）
async function parseDocument(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase()
  let html = ''
  if (ext === '.docx') {
    const options = {
      path: filePath,
      styleMap: ["p[style-name='Normal'] => p:fresh", "r[style-name='Strong'] => strong"],
      convertImage: mammoth.images.imgElement(function(image) {
        return image.read("base64").then(function(imageBuffer) {
          return { src: "data:" + image.contentType + ";base64," + imageBuffer }
        })
      })
    }
    const result = await mammoth.convertToHtml(options)
    html = result.value || '<p>文档内容为空</p>'
  } else if (ext === '.pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default
      const pdfBuffer = fs.readFileSync(filePath)
      const pdfData = await pdfParse(pdfBuffer)
      const text = (pdfData.text || '').replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch])
      html = text.split('\n').filter(line => line.trim()).map(line => `<p>${line}</p>`).join('') || '<p>PDF 文件内容为空</p>'
    } catch (pdfErr) {
      html = `<p>PDF 文件已上传，但解析失败: ${escapeHtml(pdfErr.message)}</p>`
    }
  } else {
    html = '<p>文件已上传。</p>'
  }
  return html
}

// 上传会议文件（需要管理员权限）—— 先立即返回，文档解析在后台完成
router.post('/upload', authenticate, requireRating(11), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '请选择文件' })

  // 标题使用原始文件名（去扩展名），multer 文件名先还原 UTF-8，保证中文正确显示
  const originalName = fixFileName(req.file.originalname)
  const safeTitle = path.basename(originalName, path.extname(originalName))

  // 先创建「处理中」记录并立即返回
  const meeting = await prisma.meeting.create({
    data: {
      title: safeTitle,
      date: new Date().toISOString().slice(0, 10),
      size: `${(req.file.size / 1024).toFixed(1)} KB`,
      content: '',
      status: 'processing'
    }
  })

  // 后台解析，完成后更新记录（不阻塞上传响应）
  setImmediate(async () => {
    try {
      const html = await parseDocument(req.file.path, req.file.originalname)
      await prisma.meeting.update({ where: { id: meeting.id }, data: { content: html, status: 'ready' } })
    } catch (e) {
      console.error('[Meeting] 解析失败 id=' + meeting.id, e)
      await prisma.meeting.update({ where: { id: meeting.id }, data: { content: `<p>解析失败: ${escapeHtml(String(e.message))}</p>`, status: 'failed' } }).catch(() => {})
    }
  })

  const fileUrl = `/uploads/meetings/${path.basename(req.file.path)}`
  res.json({ success: true, data: { ...meeting, fileUrl, status: 'processing' } })
})

export default router
