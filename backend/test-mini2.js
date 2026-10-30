import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { PORT, CORS_ORIGIN, getVerifyingKeys } from './src/config/index.js'
import apiRoutes from './src/routes/index.js'
import { initPromise } from './src/routes/auth.js'
import { startWhazzupUpdater, getCachedWhazzup } from './src/services/whazzup.js'
import { startFsdTracker } from './src/services/fsdTracker.js'
import prisma from './src/utils/prisma.js'
import rateLimit from 'express-rate-limit'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: CORS_ORIGIN } })
app.set('trust proxy', 1)
app.use(cors({ origin: CORS_ORIGIN, credentials: true }))
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(morgan('short'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
const globalLimiter = rateLimit({ windowMs: 60000, max: 60 })
app.use(globalLimiter)
await initPromise
console.log('OK')
