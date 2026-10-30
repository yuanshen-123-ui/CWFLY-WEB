const { default: prisma } = await import('../src/utils/prisma.js')
const keys = Object.keys(prisma).filter(k => k[0] === k[0].toLowerCase() && !k.startsWith('_') && !k.startsWith('$'))
console.log('可用模型:', keys.join(', '))
await prisma.$disconnect()
