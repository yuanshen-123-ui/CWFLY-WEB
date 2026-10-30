// Test loading individual dependencies
async function test() {
  const modules = [
    'express', 'http', 'socket.io', 'jsonwebtoken', 'cors', 'helmet', 'morgan',
    './src/config/index.js', './src/routes/index.js', './src/routes/auth.js',
    './src/services/whazzup.js', './src/services/fsdTracker.js', './src/utils/prisma.js'
  ]
  for (const mod of modules) {
    try {
      if (mod.startsWith('./')) {
        await import('/opt/cwfly/backend/' + mod)
      } else {
        await import(mod)
      }
      console.log('OK:', mod)
    } catch(e) {
      console.log('FAIL:', mod, '-', e.message)
    }
  }
}
test().then(() => process.exit(0))
