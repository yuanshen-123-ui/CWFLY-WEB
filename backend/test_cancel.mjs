import { getSigningKey } from './src/config/index.js'
import jwt from 'jsonwebtoken'
import prisma from './src/utils/prisma.js'

const token = jwt.sign({ cid: '5966', username: 'yuanshen', role: 'user', rating: 0, fsdLevel: 5 }, getSigningKey(), { expiresIn: '1h' })

const res = await fetch('http://127.0.0.1:3000/api/events/registrations/5', {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'Mozilla/5.0' }
})
console.log('HTTP', res.status)
console.log(await res.text())

const reg = await prisma.eventRegistration.findUnique({ where: { id: 5 } })
console.log('Status after:', reg?.status)
process.exit(0)
