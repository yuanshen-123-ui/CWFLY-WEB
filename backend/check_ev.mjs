import prisma from './src/utils/prisma.js'
const ev = await prisma.event.findUnique({ where: { id: 1 } })
console.log('Event status:', ev?.status)
const reg = await prisma.eventRegistration.findUnique({ where: { id: 5 } })
console.log('Reg userId:', JSON.stringify(reg?.userId), 'type:', typeof reg?.userId)
console.log('Reg id type:', typeof reg?.id)
process.exit(0)
