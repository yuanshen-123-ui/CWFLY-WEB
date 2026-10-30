// 上传安全(2026-10-25 审计 P0-1): 扩展名白名单 + 魔数校验。
// mimetype 由客户端可控, 不能作为安全依据; SVG/HTML 可携带脚本导致同源存储型 XSS。
import path from 'path'

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

// 常见图片格式魔数(前 12 字节内匹配)
const MAGIC = [
  { ext: '.jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.png', test: (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.gif', test: (b) => b.length >= 3 && b.toString('ascii', 0, 3) === 'GIF' },
  { ext: '.webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
]

/** multer fileFilter: 扩展名白名单(mimetype 仅作参考, 不作为放行依据) */
export function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext)) return cb(new Error('仅支持 png/jpg/jpeg/webp/gif 图片'))
  cb(null, true)
}

/** 落盘前二次校验文件内容魔数; 返回 true 表示内容确实是图片 */
export function isImageBuffer(buf) {
  if (!buf || buf.length < 3) return false
  return MAGIC.some((m) => {
    try { return m.test(buf) } catch { return false }
  })
}

export { ALLOWED_EXT }
