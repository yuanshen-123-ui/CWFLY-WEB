try {
  await import('file:///opt/cwfly/backend/server.js')
  console.log('SERVER OK')
} catch(e) {
  console.error('ERROR:', e.constructor.name)
  console.error(e.message)
  // Show stack that includes file paths
  const lines = (e.stack || '').split('\n')
  for (const l of lines) {
    if (l.includes('/opt/cwfly/') || l.includes('file://')) {
      console.error('  >>', l.trim())
    }
  }
}
process.exit(0)
