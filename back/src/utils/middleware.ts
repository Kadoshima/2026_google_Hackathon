/**
 * Reusable Hono middleware: request id, structured access logging,
 * security headers, and a centralized error handler.
 */

import type { MiddlewareHandler } from 'hono'
import { randomUUID } from 'node:crypto'
import { logger, type Logger } from './logger.js'

const REQUEST_ID_HEADER = 'X-Request-Id'
// Allowed: alphanumerics, hyphen, underscore, dot, colon. This is a
// strict subset of RFC 4122 UUIDs and common trace-id formats, and
// rejects control characters / whitespace / unicode that could be
// abused for log injection.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:\-]{1,128}$/

/**
 * Hono context variable map. Other handlers can read these via c.get().
 */
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
    logger: Logger
    startTime: number
  }
}

/**
 * Assigns a request ID (from the inbound header or generated) and a child logger.
 * Echoes the request ID back on the response.
 */
export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const inbound = c.req.header(REQUEST_ID_HEADER)?.trim()
    // Only trust an inbound request id if it matches a conservative
    // character set. Otherwise the value flows into log lines and the
    // response header, which is a log-injection surface.
    const requestId =
      inbound && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID()
    c.set('requestId', requestId)
    c.set('startTime', Date.now())
    c.set(
      'logger',
      logger.child({
        requestId,
        method: c.req.method,
        path: new URL(c.req.url).pathname
      })
    )
    c.header(REQUEST_ID_HEADER, requestId)
    await next()
  }
}

/**
 * Structured request/response access log.
 */
export const accessLogMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const reqLogger = c.get('logger') ?? logger
    const start = c.get('startTime') ?? Date.now()

    try {
      await next()
    } finally {
      const durationMs = Date.now() - start
      const status = c.res.status
      const url = new URL(c.req.url)
      const fields = {
        status,
        durationMs,
        method: c.req.method,
        path: url.pathname,
        query: url.search.length > 0 ? url.search.slice(1) : undefined,
        userAgent: c.req.header('user-agent'),
        contentLength: c.res.headers.get('content-length') ?? undefined
      }

      if (status >= 500) {
        reqLogger.error('http_request', fields)
      } else if (status >= 400) {
        reqLogger.warn('http_request', fields)
      } else {
        reqLogger.info('http_request', fields)
      }
    }
  }
}

/**
 * Conservative security headers. These are safe defaults for an API server;
 * a public web frontend should set its own CSP separately.
 */
export const securityHeadersMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-DNS-Prefetch-Control', 'off')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  }
}

/**
 * NOTE: error handling lives in `app.onError` in server.ts. The previous
 * `errorHandlerMiddleware` shipped here was removed because it duplicated
 * that handler and used an unusual `c.res = c.json(...)` assignment that
 * could race with other middleware writing to the same response.
 */
