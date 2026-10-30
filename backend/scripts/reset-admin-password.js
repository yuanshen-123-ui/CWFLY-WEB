/**
 * 重置管理员密码（使用新的直接 bcrypt 格式）
 * 用法: node reset-admin-password.js <新密码>
 */
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const newPassword = process.argv[2]
if (!newPassword) {
  console.error('用法: node reset-admin-password.js <新密码>')
  process.exit(1)
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { cid: '0000' },
      data: { password: hash, salt: '' }
    })
    console.log('管理员密码已更新为新格式')
  } catch (e) {
    console.error('失败:', e.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()
