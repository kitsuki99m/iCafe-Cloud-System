import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { apiLimiter } from './middleware/rateLimiter.js'
import { attachClientIdentity } from './middleware/clientIdentity.js'
import authRoutes from './routes/authRoutes.js'
import apiRoutes from './routes/apiRoutes.js'
import operationsRoutes from './routes/operationsRoutes.js'
import cloudRoutes from './routes/cloudRoutes.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'
import { emitDataChanged } from './realtime.js'
import { idempotency } from './middleware/idempotency.js'

export function createApp() {
  const app = express()
  if (env.trustProxy) app.set('trust proxy', 1)

  app.use(helmet())
  const allowedOrigins = env.corsOrigin.split(',').map((x) => x.trim()).filter(Boolean)
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error('CORS origin not allowed'))
    },
    credentials: false,
  }))
  app.use(express.json({ limit: '1mb' }))
  app.use(attachClientIdentity)
  app.use('/api', apiLimiter)
  app.use('/api', idempotency)
  // Broadcast successful mutating API calls. Clients use this as a lightweight
  // invalidation signal and re-fetch authoritative state from SQLite.
  app.use('/api', (req, res, next) => {
    const originalJson = res.json.bind(res)
    res.json = (body) => {
      if (req.method !== 'GET' && res.statusCode >= 200 && res.statusCode < 300) {
        emitDataChanged({ method: req.method, path: req.originalUrl })
      }
      return originalJson(body)
    }
    next()
  })
  app.use('/api/auth', authRoutes)
  app.use('/api', apiRoutes)
  app.use('/api', operationsRoutes)
  app.use('/api', cloudRoutes)
  app.use(notFound)
  app.use(errorHandler)
  return app
}
