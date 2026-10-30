import { PrismaClient } from '@prisma/client'
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/cwfly' } } })
const users = await p.user.findMany({ where: { OR: [{ cid: '5966' }, { cid: '0000' }] }, select: { cid: true, username: true, role: true, rating: true } })
console.log(JSON.stringify(users, null, 2))
await p.$disconnect()
