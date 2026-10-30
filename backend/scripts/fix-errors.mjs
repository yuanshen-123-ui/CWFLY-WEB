/**
 * 批量修复后端路由文件中的错误消息泄露
 * 将所有 `res.status(500).json({ success: false, message: e.message })`
 * 替换为安全的通用错误消息
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const routesDir = path.resolve(__dirname, '../src/routes')

const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'))
let total = 0

for (const file of files) {
  const filePath = path.join(routesDir, file)
  let content = fs.readFileSync(filePath, 'utf-8')
  const original = content

  // Pattern 1: res.status(500).json({ success: false, message: e.message })
  content = content.replace(
    /res\.status\(500\)\.json\(\{\s*success:\s*false,\s*message:\s*e\.message\s*\}\)/g,
    `console.error('[${file}]', e?.message); res.status(500).json({ success: false, message: '操作失败' })`
  )

  // Pattern 2: res.status(500).json({ success: false, message: 'xxx' + e.message })
  content = content.replace(
    /res\.status\(500\)\.json\(\{\s*success:\s*false,\s*message:\s*['"][^'"]*['"]\s*\+\s*e\.message\s*\}\)/g,
    `console.error('[${file}]', e?.message); res.status(500).json({ success: false, message: '操作失败' })`
  )

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8')
    const count = (content.match(/操作失败/g) || []).length - (original.match(/操作失败/g) || []).length
    console.log(`  ${file}: ${count} replacements`)
    total += count
  }
}

console.log(`\nTotal: ${total} replacements across ${files.length} files`)
