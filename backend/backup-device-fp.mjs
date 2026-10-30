#!/usr/bin/env node
/**
 * 手动触发设备指纹证据备份（固证）
 * 运行：node backup-device-fp.mjs
 * 输出：backend/backups/fingerprints/fp-<时间戳>/（loginlog.tsv / security_events.tsv / users.tsv + SHA256SUMS）
 */
import { backupDeviceFingerprints } from './src/services/deviceFpBackup.js'

const dir = await backupDeviceFingerprints()
if (dir) {
  console.log(`\n✅ 备份完成: ${dir}`)
  process.exit(0)
}
console.error('❌ 备份失败')
process.exit(1)
