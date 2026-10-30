import('./src/config/index.js').then(() => {
  console.log('OK')
  process.exit(0)
}).catch(e => {
  console.error('FAIL:', e.constructor.name, e.message)
  process.exit(1)
})
