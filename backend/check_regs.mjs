import prisma from './src/utils/prisma.js'
const user = await prisma.user.findUnique({ where: { cid: '5966' } })
console.log('User:', user?.cid, user?.username)
const regs = await prisma.eventRegistration.findMany({ where: { userId: '5966', status: { not: 'cancelled' } }, orderBy: { id: 'desc' } })
console.log('Regs:', JSON.stringify(regs.map(r => ({ id: r.id, eventId: r.eventId, type: r.type, position: r.position, status: r.status }))))
process.exit(0)
