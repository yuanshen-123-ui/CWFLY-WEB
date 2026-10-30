import prisma from './src/utils/prisma.js'
await prisma.eventRegistration.update({ where: { id: 5 }, data: { status: 'registered' } })
const r = await prisma.eventRegistration.findUnique({ where: { id: 5 } })
console.log('restored status:', r?.status)
process.exit(0)
