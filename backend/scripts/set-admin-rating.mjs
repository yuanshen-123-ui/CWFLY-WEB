import { PrismaClient } from '@prisma/client'
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/cwfly' } } })
const u = await p.user.update({ where: { cid: '0000' }, data: { rating: 12 } })
const user = await p.user.findUnique({ where: { cid: '0000' }, select: { cid: true, rating: true, fsdLevel: true } })
console.log('管理员已更新:', JSON.stringify(user))
await p.$disconnect()
