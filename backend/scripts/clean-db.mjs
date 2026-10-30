/**
 * 清空数据库，仅保留管理员 0000
 * 用法: node scripts/clean-db.mjs
 */
const { default: prisma } = await import('../src/utils/prisma.js')

const tables = [
  'securityEvent', 'verificationCode', 'userFavorite', 'loginLog', 'auditLog',
  'trainingRecord', 'trainingExam', 'trainingCourse',
  'userAchievement', 'achievement',
  'controllerSchedule', 'activityReview',
  'forumReply', 'forumPost', 'forumBoard',
  'knowledgeBase', 'ticketReply', 'ticket',
  'flightLog', 'flightPlan',
  'notification', 'eventRegistration',
  'applicationReply', 'application',
  'checkInRecord', 'emailLog', 'feedback', 'meeting',
  'staff', 'announcement', 'userPoint'
]

for (const t of tables) {
  try {
    const { count } = await prisma[t].deleteMany()
    console.log(`  ${t}: ${count} 条`)
  } catch (e) {
    console.log(`  ${t}: 跳过 (${e.message.slice(0, 40)})`)
  }
}

// 删除非管理员的普通用户
const { count } = await prisma.user.deleteMany({ where: { cid: { not: '0000' } } })
console.log(`  user(非admin): ${count} 条`)
console.log('数据库清理完成')
await prisma.$disconnect()
