import('file:///opt/cwfly/backend/server.js').then(() => {
  console.log('OK')
  process.exit(0)
}).catch(e => {
  console.error('NAME:', e.constructor.name)
  console.error('MESSAGE:', e.message)
  // Try to find which module caused the error
  if (e.stack) {
    const lines = e.stack.split('\n')
    for (const line of lines) {
      if (line.includes('/opt/cwfly/')) {
        console.error('FILE:', line.trim())
      }
    }
  }
  process.exit(1)
})
