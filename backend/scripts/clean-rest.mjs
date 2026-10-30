// 清理遗漏的表
const { default: prisma } = await import('../src/utils/prisma.js')

// 安全检查：直接用 $queryRaw 清空特定表
const tables = ['SecurityEvent', 'VerificationCode', 'LoginLog', 'EmailLog']

for (const t of tables) {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${t}\``)
    console.log(`  ${t}: 已清空`)
  } catch (e) {
    // 尝试小写表名
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM \`${t.toLowerCase()}\``)
      console.log(`  ${t.toLowerCase()}: 已清空`)
    } catch (e2) {
      console.log(`  ${t}: 跳过 (${e2.message.slice(0,40)})`)
    }
  }
}

// 确认只有 admin 用户
const users = await prisma.user.findMany({ select: { cid: true, username: true } })
console.log('剩余用户:', JSON.stringify(users))
await prisma.$disconnect()
