import 'dotenv/config'
try {
  await import('./server.js')
  console.log('SUCCESS')
} catch(e) {
  console.log('FAIL:', e.constructor.name, e.message)
}
process.exit(0)
