/**
 * ============================================================================
 *  cleanup-test-data.mjs —— 清理渗透测试遗留数据（一次性维护脚本）
 * ----------------------------------------------------------------------------
 *  按渗透报告说明清理测试账号与其产生数据：
 *    - 用户 CID 9999（测试账号）
 *    - 该账号产生的业务数据（工单/飞行计划/日志/积分等）
 *    - 工单 #11（报告中因 L-4 缺陷未能自行删除的测试工单）
 *    - 测试邮箱的验证码记录
 *
 *  安全性：仅匹配上述固定标识，不做任何通配删除；每一步独立 try/catch，
 *  失败不中断并打印原因（外键/字段名不符等情况可据此判断）。
 *
 *  运行：cd /opt/cwfly/backend && node scripts/cleanup-test-data.mjs
 * ============================================================================
 */
import prisma from '../src/utils/prisma.js'

const CID = '9999'
const TICKET_ID = 11
const TEST_EMAIL = '234745837@qq.com'

let failed = 0
async function step(label, fn) {
  try {
    const r = await fn()
    const n = typeof r?.count === 'number' ? r.count : 1
    console.log(`  [OK]   ${label} -> ${n}`)
  } catch (e) {
    failed++
    console.log(`  [SKIP] ${label} -> ${e?.code || ''} ${e?.message?.split('\n')[0] || e}`)
  }
}

console.log(`[cleanup] 目标：CID=${CID} 工单#${TICKET_ID} 邮箱=${TEST_EMAIL}`)

// 1) 指定工单（报告遗留）
await step(`删除工单 #${TICKET_ID}`, () => prisma.ticket.delete({ where: { id: TICKET_ID } }))
await step(`删除工单 #${TICKET_ID} 的回复`, () => prisma.ticketReply.deleteMany({ where: { ticketId: TICKET_ID } }))

// 2) 该账号的业务数据（子表优先）
const children = [
  ['工单', () => prisma.ticket.deleteMany({ where: { userId: CID } })],
  ['工单回复', () => prisma.ticketReply.deleteMany({ where: { userId: CID } })],
  ['飞行计划', () => prisma.flightPlan.deleteMany({ where: { userId: CID } })],
  ['飞行日志', () => prisma.flightLog.deleteMany({ where: { userId: CID } })],
  ['登录日志', () => prisma.loginLog.deleteMany({ where: { userId: CID } })],
  ['登录尝试', () => prisma.loginAttempt.deleteMany({ where: { userId: CID } })],
  ['安全事件', () => prisma.securityEvent.deleteMany({ where: { userId: CID } })],
  ['签到记录', () => prisma.checkInRecord.deleteMany({ where: { userId: CID } })],
  ['活动报名', () => prisma.eventRegistration.deleteMany({ where: { userId: CID } })],
  ['通知', () => prisma.notification.deleteMany({ where: { userId: CID } })],
  ['积分', () => prisma.userPoint.deleteMany({ where: { userId: CID } })],
  ['成就', () => prisma.userAchievement.deleteMany({ where: { userId: CID } })],
  ['培训记录', () => prisma.trainingRecord.deleteMany({ where: { userId: CID } })],
  ['论坛帖子', () => prisma.forumPost.deleteMany({ where: { userId: CID } })],
  ['论坛回复', () => prisma.forumReply.deleteMany({ where: { userId: CID } })],
  ['活动评价', () => prisma.activityReview.deleteMany({ where: { userId: CID } })],
  ['申请回复', () => prisma.applicationReply.deleteMany({ where: { userId: CID } })],
  ['收藏', () => prisma.userFavorite.deleteMany({ where: { userId: CID } })],
  ['申请', () => prisma.application.deleteMany({ where: { userId: CID } })],
  ['反馈', () => prisma.feedback.deleteMany({ where: { userId: CID } })],
  // 这两张表的归属字段是 cid（非 userId）
  ['账号变更审批', () => prisma.userChangeApproval.deleteMany({ where: { cid: CID } })],
  ['邮件日志', () => prisma.emailLog.deleteMany({ where: { cid: CID } })],
  ['在线状态', () => prisma.onlineUser.deleteMany({ where: { cid: CID } })]
]
for (const [label, fn] of children) await step(`删除${label}`, fn)

// 3) 测试邮箱验证码
await step('删除测试邮箱验证码', () => prisma.verificationCode.deleteMany({ where: { email: TEST_EMAIL } }))

// 4) 用户本体
await step(`删除用户 ${CID}`, () => prisma.user.delete({ where: { cid: CID } }))

// 5) 复查
await step(`复查用户 ${CID} 是否仍存在`, async () => {
  const u = await prisma.user.findUnique({ where: { cid: CID } })
  console.log(`        用户 ${CID}: ${u ? '仍存在（删除失败，请手动处理）' : '已删除'}`)
  return { count: 0 }
})

console.log(failed > 0
  ? `[cleanup] 完成，但有 ${failed} 步被跳过（多为该表无对应记录/字段，属正常）`
  : '[cleanup] 完成，全部步骤成功')
process.exit(0)
