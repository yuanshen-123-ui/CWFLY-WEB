import 'dotenv/config'
import { initPromise } from './src/routes/auth.js'
await initPromise
console.log('OK')
