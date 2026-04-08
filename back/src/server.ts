import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { registerV1Routes } from './routes/v1/index.js'
import { registerInternalRoutes } from './routes/internal/index.js'
import { loadConfig } from './utils/config.js'
import {
  accessLogMiddleware,
  errorHandlerMiddleware,
  requestIdMiddleware,
  securityHeadersMiddleware
} from './utils/middleware.js'
import { logger } from './utils/logger.js'

export const createApp = () => {
  const app = new Hono()
  const config = loadConfig()

  // Order matters: requestId first so subsequent middleware can log with it.
  app.use('*', requestIdMiddleware())
  app.use('*', errorHandlerMiddleware())
  app.use('*', accessLogMiddleware())
  app.use('*', securityHeadersMiddleware())

  app.use(
    '*',
    cors({
      origin: (origin) => {
        // Same-origin or non-browser callers (no Origin header) — allow.
        if (!origin) return '*'

        // Always permit local dev hosts unless explicitly disabled.
        if (config.env !== 'production') {
          if (
            origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:') ||
            origin.startsWith('https://localhost:')
          ) {
            return origin
          }
        }

        // Explicit allowlist takes precedence.
        if (config.cors.allowedOrigins.includes(origin)) {
          return origin
        }

        // Wildcard escape hatch (non-production by default).
        if (config.cors.allowAll) {
          return origin
        }

        // Reject by returning an empty string — the browser will not see
        // an Access-Control-Allow-Origin matching its real origin.
        return ''
      },
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'X-Client-Token-Hash',
        'X-Client-Token',
        'X-Request-Id'
      ],
      exposeHeaders: ['X-Request-Id'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600
    })
  )

  registerV1Routes(app)
  registerInternalRoutes(app)

  // Centralized fallback for any error that escapes per-route handling.
  app.onError((err, c) => {
    const reqLogger = c.get('logger') ?? logger
    reqLogger.error('unhandled_error', { error: err })
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'internal error',
          details: { requestId: c.get('requestId') }
        }
      },
      500
    )
  })

  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'route not found',
          details: { requestId: c.get('requestId') }
        }
      },
      404
    )
  })

  return app
}
