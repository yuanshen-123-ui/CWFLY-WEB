import 'dotenv/config'
try {
  await import('./server.js')
  console.log('SUCCESS')
} catch(e) {
  console.log('TYPE:', e.constructor.name)
  console.log('MSG:', e.message)
}
process.exit(0)
