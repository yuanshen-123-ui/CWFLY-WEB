import prisma from './src/utils/prisma.js'
const d = await prisma.whazzupData.findFirst({ orderBy: { id: 'desc' } })
if (d) {
  const w = JSON.parse(d.data)
  const controllers = (w.clients || []).filter(c => c.type === 'ATC')
  console.log('clients:', (w.clients || []).length, 'controllers:', controllers.length)
  controllers.slice(0, 5).forEach(c => console.log('  ctrl:', c.callsign, c.cid, c.realname, 'rating', c.rating))
} else {
  console.log('no whazzup data')
}
process.exit(0)
