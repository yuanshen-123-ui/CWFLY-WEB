import 'dotenv/config'
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET (' + process.env.JWT_SECRET.length + ' chars)' : 'NOT SET')
console.log('DOTENV_CONFIG_PATH:', process.env.DOTENV_CONFIG_PATH || 'NOT SET')
process.exit(0)
