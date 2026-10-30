import pkg from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const { PrismaClient } = pkg

const connectionString = (process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/cwfly') + '?allowPublicKeyRetrieval=true'

const adapter = new PrismaMariaDb(connectionString)

// 全局密码保护：所有查询自动排除 password 和 salt 字段
const prisma = new PrismaClient({
  adapter,
  omit: {
    user: {
      password: true,
      salt: true
    }
  }
})

// 用于认证的独立客户端（包含密码字段）
const prismaWithCreds = new PrismaClient({
  adapter,
  omit: {}
})

/**
 * 查询用户认证凭据（包含 password 和 salt）
 * 单独的方法避免 Prisma omit 覆盖问题
 */
export async function findUserWithCredentials(cid) {
  const rows = await prismaWithCreds.$queryRawUnsafe(
    'SELECT id, cid, username, `password`, salt, `role`, rating, permissions, fsdLevel, fsdType, email, qq, avatar, createdAt, fsdPasswordHash FROM `User` WHERE cid = ? LIMIT 1',
    cid
  )
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

export default prisma
