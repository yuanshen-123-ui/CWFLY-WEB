import pkg from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const { PrismaClient } = pkg

// 数据库连接串：追加驱动参数 + 限制连接池上限（DB_CONNECTION_LIMIT，默认 5/池）
// 背景：@prisma/adapter-mariadb 的 connect() 每次都会新建一个连接池且不复用旧池，
//       MySQL 短暂不可用触发 Prisma 重连时会不断新建池 → 连接堆积打满 max_connections（pool timeout）。
//       用 connectionLimit 把每个池都限小（配合 MySQL wait_timeout 回收空闲连接），避免连接失控。
const baseUrl = process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/cwfly'
const connLimit = Number(process.env.DB_CONNECTION_LIMIT || 5)
const sep = baseUrl.includes('?') ? '&' : '?'
const connectionString = `${baseUrl}${sep}allowPublicKeyRetrieval=true&connectionLimit=${connLimit}`

const adapter = new PrismaMariaDb(connectionString)

// 全局密码保护：所有查询自动排除 password 字段
const prisma = new PrismaClient({
  adapter,
  omit: {
    user: {
      password: true
    }
  }
})

// 用于认证的独立客户端（包含密码字段）
const prismaWithCreds = new PrismaClient({
  adapter,
  omit: {}
})

/**
 * 查询用户认证凭据（包含 password）
 * 单独的方法避免 Prisma omit 覆盖问题
 */
export async function findUserWithCredentials(cid) {
  const rows = await prismaWithCreds.$queryRawUnsafe(
    'SELECT id, cid, username, `password`, rating, permissions, fsdLevel, email, qq, avatar, createdAt, fsdPasswordHash FROM `User` WHERE cid = ? LIMIT 1',
    cid
  )
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

export default prisma
