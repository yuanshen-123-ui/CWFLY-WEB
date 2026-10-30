const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  await p.user.update({ where: { cid: '0000' }, data: { rating: 12 } })
  const u = await p.user.findUnique({ where: { cid: '0000' }, select: { cid: true, rating: true, fsdLevel: true } })
  console.log('管理员已更新:', JSON.stringify(u))
  await p.$disconnect()
})()
