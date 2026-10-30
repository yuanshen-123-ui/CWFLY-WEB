/**
 * 设备指纹证据备份（2026-08-05 新增；2026-08-07 修复还原误删文件）
 *
 * 将 LoginLog / SecurityEvent / User 中的设备指纹证据导出为 TSV + SHA-256 固证，
 * 防止 SecurityEvent 自动清理（默认 30 天）导致设备指纹证据丢失。
 *
 * 每次备份在 backups/fingerprints/fp-<ISO时间>/ 下生成:
 *   - loginlog.tsv / security_events.tsv / users.tsv
 *   - SHA256SUMS（三个文件的校验和 + 行数摘要，作为不可篡改固证）
 *
 * 由 server.js 定时调用（每 6 小时 + 启动 60 秒后），出错仅记录日志不抛异常。
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'
import prisma from '../utils/prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FP_DIR = path.resolve(__dirname, '../../backups/fingerprints')
const FP_RETENTION_DAYS = 30 // 指纹备份保留天数（与数据库备份一致）

/** TSV 转义：字段内换行/制表符统一转成空格，避免破坏 TSV 列结构 */
function tsvSafe(v) {
  if (v === null || v === undefined) return ''
  return String(v).replace(/[\t\r\n]+/g, ' ')
}

/** 记录数组 → TSV 文本（含表头） */
function toTsv(columns, rows) {
  const header = columns.join('\t')
  const lines = rows.map(r => columns.map(c => tsvSafe(r[c])).join('\t'))
  return [header, ...lines].join('\n') + '\n'
}

/** SHA-256 摘要（固证用） */
function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * 执行一次设备指纹证据备份
 * 出错仅记录日志，绝不抛出（备份不应拖垮主服务）
 */
export async function backupDeviceFingerprints() {
  try {
    const [loginLogs, securityEvents, users] = await Promise.all([
      prisma.loginLog.findMany({
        orderBy: { id: 'desc' },
        take: 5000,
        select: { id: true, userId: true, ip: true, deviceFp: true, userAgent: true, type: true, success: true, createdAt: true },
      }),
      prisma.securityEvent.findMany({
        orderBy: { id: 'desc' },
        take: 10000,
        select: { id: true, ip: true, userId: true, deviceFp: true, network: true, path: true, referrer: true, userAgent: true, createdAt: true },
      }),
      prisma.user.findMany({
        take: 5000,
        select: { cid: true, username: true, registerIp: true, registerFp: true, registerUserAgent: true, createdAt: true },
      }),
    ])

    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = path.join(FP_DIR, `fp-${ts}`)
    fs.mkdirSync(dir, { recursive: true })

    const files = {
      'loginlog.tsv': toTsv(
        ['id', 'userId', 'ip', 'deviceFp', 'userAgent', 'type', 'success', 'createdAt'],
        loginLogs
      ),
      'security_events.tsv': toTsv(
        ['id', 'ip', 'userId', 'deviceFp', 'network', 'path', 'referrer', 'userAgent', 'createdAt'],
        securityEvents
      ),
      'users.tsv': toTsv(
        ['cid', 'username', 'registerIp', 'registerFp', 'registerUserAgent', 'createdAt'],
        users
      ),
    }

    const sums = []
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content)
      sums.push(`${sha256Hex(Buffer.from(content))}  ${name}`)
    }

    const summary = [
      '# CWFLY 设备指纹证据备份',
      `# exported: ${new Date().toISOString()}`,
      `# rows: loginlog=${loginLogs.length} security=${securityEvents.length} users=${users.length}`,
      '',
      ...sums,
      '',
    ].join('\n')
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), summary)

    cleanOldFingerprintBackups()

    console.log(`[deviceFpBackup] 备份完成: ${dir} (loginlog=${loginLogs.length} security=${securityEvents.length} users=${users.length})`)
  } catch (e) {
    console.error('[deviceFpBackup] 备份失败:', e?.message)
  }
}

/** 清理超过保留期的旧指纹备份目录 */
function cleanOldFingerprintBackups() {
  try {
    if (!fs.existsSync(FP_DIR)) return
    const cutoff = Date.now() - FP_RETENTION_DAYS * 24 * 3600 * 1000
    for (const name of fs.readdirSync(FP_DIR)) {
      if (!name.startsWith('fp-')) continue
      const p = path.join(FP_DIR, name)
      try {
        const stat = fs.statSync(p)
        if (stat.isDirectory() && stat.mtimeMs < cutoff) {
          fs.rmSync(p, { recursive: true, force: true })
        }
      } catch (err) {
        // 并发清理/文件刚被移除时 ENOENT：忽略，不让单个目录中断整轮清理
        if (err.code !== 'ENOENT') throw err
      }
    }
  } catch (e) {
    console.error('[deviceFpBackup] 清理旧备份失败:', e?.message)
  }
}
