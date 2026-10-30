await import('dotenv/config')
const modules = [
  './src/config/index.js', './src/routes/index.js', './src/routes/auth.js',
  './src/services/whazzup.js', './src/services/fsdTracker.js', './src/utils/prisma.js'
]
for (const mod of modules) {
  try {
    await import('/opt/cwfly/backend/' + mod)
    console.log('OK:', mod)
  } catch(e) {
    console.log('FAIL:', mod, '-', e.message.slice(0, 100))
  }
}
console.log('DONE')
process.exit(0)
