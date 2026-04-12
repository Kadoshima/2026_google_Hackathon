import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { registerV1Routes } from './routes/v1/index.js'
import { registerInternalRoutes } from './routes/internal/index.js'
import { registerHealthRoutes } from './routes/v1/health.js'
import { loadConfig } from './utils/config.js'
import {
  accessLogMiddleware,
  requestIdMiddleware,
  securityHeadersMiddleware
} from './utils/middleware.js'
import { logger } from './utils/logger.js'
import { isAppError, toErrorResponse } from './utils/errors.js'

export const createApp = () => {
  const app = new Hono()
  const config = loadConfig()

  // Order matters: requestId first so subsequent middleware can log with it.
  // Error handling is centralized in `app.onError` below — we no longer run
  // a dedicated error-handling middleware here.
  app.use('*', requestIdMiddleware())
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
        'X-Client-Token',
        'X-Request-Id',
        'Idempotency-Key'
      ],
      exposeHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600
    })
  )

  // Health endpoints MUST live at the root so orchestrator probes
  // (Cloud Run, Kubernetes, etc.) can reach /healthz and /readyz without
  // a version prefix. They are still available under /v1 for backward
  // compatibility via registerV1Routes().
  registerHealthRoutes(app)

  registerV1Routes(app)
  registerInternalRoutes(app)

  // Centralized fallback for any error that escapes per-route handling.
  // Must honour AppError's own status so that middleware-thrown 4xx
  // (body limit, idempotency key, rate limit) don't get flattened to 500.
  app.onError((err, c) => {
    const reqLogger = c.get('logger') ?? logger
    const requestId = c.get('requestId')
    const { status, payload } = toErrorResponse(err)

    if (payload.error.code && requestId) {
      payload.error.details = { ...(payload.error.details ?? {}), requestId }
    }

    if (isAppError(err) && status < 500) {
      reqLogger.warn('request_failed', {
        code: payload.error.code,
        status,
        message: payload.error.message
      })
    } else {
      reqLogger.error('unhandled_error', { error: err, code: payload.error.code })
    }

    return c.json(payload, status)
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
