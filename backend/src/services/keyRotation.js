/**
 * JWT 密钥轮换 + 数据库备份脚本
 *
 * JWT 密钥轮换：
 *   - 时间轮换：每 24 小时轮换一次密钥
 *   - HMAC 派生：从 BASE_SECRET + 时段编号派生时段密钥
 *   - 旧密钥保留 7 天验证窗口（不会导致已签发 token 立即失效）
 *
 * 数据库备份：
 *   - 使用 mysqldump 导出完整数据库
 *   - 保留最近 30 天的备份，自动清理旧备份
 *   - 备份文件存储在 /opt/cwfly/backend/backups/
 */

import { createHmac } from 'node:crypto'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

// mysqldump | gzip 可能耗时数分钟，改用异步 exec 避免阻塞事件循环
// （旧版 execSync 会冻结整个进程：心跳、限流、所有请求全部卡住）
const execAsync = promisify(exec)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKUP_DIR = path.resolve(__dirname, '../../backups')
const ROTATION_HOURS = 24           // 密钥轮换周期（小时）
const VERIFY_WINDOW = 7              // 保留旧密钥的验证窗口（周期数）
const BACKUP_RETENTION_DAYS = 30     // 备份保留天数

// 获取当前时段编号（从 2024-01-01 开始计算）
function getCurrentPeriod() {
  const start = new Date('2024-01-01T00:00:00Z').getTime()
  const now = Date.now()
  return Math.floor((now - start) / (ROTATION_HOURS * 3600 * 1000))
}

// 从 BASE_SECRET + 时段编号派生密钥
function derivePeriodKey(period) {
  return createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`jwt-period-${period}`)
    .digest('hex')
}

/**
 * 获取当前签名密钥（所有 PM2 进程同步）
 * 所有进程使用相同的 BASE_SECRET，同一时段派生出相同密钥
 */
export function getSigningKey() {
  return derivePeriodKey(getCurrentPeriod())
}

/**
 * 获取所有有效验证密钥（当前 + 过去 7 个周期的旧密钥）
 * 让旧 token 在轮换后仍能验证通过
 */
export function getVerifyingKeys() {
  const current = getCurrentPeriod()
  const keys = []
  for (let i = 0; i < VERIFY_WINDOW; i++) {
    keys.push(derivePeriodKey(current - i))
  }
  return keys
}

/**
 * 执行数据库备份（异步，不阻塞事件循环）
 * @returns {Promise<boolean>}
 */
export async function backupDatabase() {
  const dbUrl = process.env.DATABASE_URL || ''
  // 解析 DATABASE_URL: mysql://user:pass@host:port/db
  const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)
  if (!match) {
    console.error('[Backup] 无法解析 DATABASE_URL')
    return false
  }

  const [, user, password, host, port, db] = match
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `cwfly-${timestamp}.sql.gz`
  const filepath = path.join(BACKUP_DIR, filename)

  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    // 安全(2026-10-25 审计 P2-6): 不再拼 shell(密码含特殊字符即注入, 且 -p 暴露在 ps);
    // 数组参数 + MYSQL_PWD 环境变量, gzip 由 JS 侧完成
    const { spawn } = await import('child_process')
    const { pipeline } = await import('stream/promises')
    const { createGzip } = await import('zlib')
    await new Promise((resolve, reject) => {
      const dump = spawn('mysqldump', ['--single-transaction', '--quick', '-h', host, '-P', port, '-u', user, db], {
        env: { ...process.env, MYSQL_PWD: password }, timeout: 300000
      })
      const out = fs.createWriteStream(filepath)
      dump.on('error', reject)
      out.on('error', reject)
      out.on('finish', () => resolve())
      pipeline(dump.stdout, createGzip(), out).catch(reject)
      dump.stderr.on('data', () => {}) // 警告不视为失败
    })
    const size = fs.statSync(filepath).size
    console.log(`[Backup] 数据库已备份: ${filename} (${(size / 1024 / 1024).toFixed(1)} MB)`)
    return true
  } catch (err) {
    console.error('[Backup] 备份失败:', err.message)
    return false
  }
}

/**
 * 清理过期备份
 */
export function cleanOldBackups() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('cwfly-') && f.endsWith('.sql.gz'))
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 86400 * 1000
    let deleted = 0
    for (const file of files) {
      const filepath = path.join(BACKUP_DIR, file)
      const stat = fs.statSync(filepath)
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filepath)
        deleted++
      }
    }
    if (deleted > 0) console.log(`[Backup] 已清理 ${deleted} 个过期备份`)
  } catch (err) {
    console.error('[Backup] 清理失败:', err.message)
  }
}
