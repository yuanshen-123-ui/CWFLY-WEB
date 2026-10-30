/**
 * 基于 MySQL 的共享限流存储（express-rate-limit store）
 *
 * 背景：express-rate-limit 默认内存 store 在 PM2 cluster 下每个实例独立，
 *       CWFLY 后端跑 4 个实例时，限流阈值实际放大 4 倍（60/min → 240/min）。
 * 方案：用主站同一 MySQL 数据库做共享计数，跨实例一致。
 *
 * 安全：数据库故障时 fail-open（放行请求并记录），避免限流器故障拖垮整站；
 *       由 nginx 层 limit_req（共享内存 zone）兜底 CC 防护。
 */

import mysql from 'mariadb'

let pool = null
let tableReady = false

/** 从 DATABASE_URL 解析连接参数（与 Prisma 共用同一库） */
function parseDbUrl() {
  const url = process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/cwfly'
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)
  return m
    ? { host: m[3], port: Number(m[4]), user: m[1], password: m[2], database: m[5] }
    : { host: '127.0.0.1', port: 3306, user: 'root', password: '', database: 'cwfly' }
}

function getPool() {
  if (!pool) {
    const c = parseDbUrl()
    pool = mysql.createPool({
      ...c,
      connectionLimit: 4,
      charset: 'utf8mb4',
    })
  }
  return pool
}

/** 启动时建表（幂等；不依赖 Prisma 迁移，主站 schema 由主站维护） */
export async function ensureRateLimitTable() {
  if (tableReady) return
  try {
    const conn = await getPool().getConnection()
    try {
      await conn.query(
        `CREATE TABLE IF NOT EXISTS RateLimit (
          rateKey VARCHAR(191) NOT NULL,
          hits INT NOT NULL DEFAULT 0,
          resetAt DATETIME(3) NOT NULL,
          PRIMARY KEY (rateKey),
          INDEX idx_rate_reset (resetAt)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      )
      tableReady = true
    } finally {
      conn.release()
    }
  } catch (e) {
    console.error('[RateLimitStore] 建表失败（限流降级为内存/放行）:', e.message)
  }
}

/**
 * 创建共享限流 store（每个限流器一个实例，窗口独立）
 * @param {number} windowMs 窗口毫秒
 */
export function createMySqlStore(windowMs) {
  const seconds = Math.ceil(windowMs / 1000)
  return {
    async increment(key) {
      try {
        const conn = await getPool().getConnection()
        try {
          await conn.query(
            `INSERT INTO RateLimit (rateKey, hits, resetAt) VALUES (?, 1, DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE
               hits  = IF(resetAt <= NOW(), 1, hits + 1),
               resetAt = IF(resetAt <= NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND), resetAt)`,
            [key, seconds, seconds]
          )
          const rows = await conn.query('SELECT hits, resetAt FROM RateLimit WHERE rateKey = ?', [key])
          const r = rows[0]
          return { totalHits: r ? r.hits : 1, resetTime: r ? new Date(r.resetAt) : new Date(Date.now() + windowMs) }
        } finally {
          conn.release()
        }
      } catch (e) {
        console.error('[RateLimitStore] increment 失败（fail-open 放行）:', e.message)
        return { totalHits: 0, resetTime: new Date(Date.now() + windowMs) }
      }
    },
    async decrement(key) {
      try {
        const conn = await getPool().getConnection()
        try {
          await conn.query('UPDATE RateLimit SET hits = GREATEST(hits - 1, 0) WHERE rateKey = ?', [key])
        } finally {
          conn.release()
        }
      } catch { /* ignore */ }
    },
    async resetKey(key) {
      try {
        const conn = await getPool().getConnection()
        try {
          await conn.query('DELETE FROM RateLimit WHERE rateKey = ?', [key])
        } finally {
          conn.release()
        }
      } catch { /* ignore */ }
    },
  }
}
