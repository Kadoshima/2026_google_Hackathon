/**
 * Reusable Hono middleware: request id, structured access logging,
 * security headers, and a centralized error handler.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { randomUUID } from 'node:crypto'
import { logger, type Logger } from './logger.js'
import { isAppError, toErrorResponse } from './errors.js'

const REQUEST_ID_HEADER = 'X-Request-Id'

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
    const requestId = inbound && inbound.length <= 128 ? inbound : randomUUID()
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
 * Catches any thrown error and converts it to a JSON response.
 * Wraps unknown errors as INTERNAL_ERROR and logs them with the request id.
 */
export const errorHandlerMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    try {
      await next()
    } catch (error) {
      handleError(c, error)
    }
  }
}

const handleError = (c: Context, error: unknown) => {
  const reqLogger = c.get('logger') ?? logger
  const { status, payload } = toErrorResponse(error)

  if (isAppError(error) && status < 500) {
    reqLogger.warn('request_failed', {
      code: payload.error.code,
      status,
      message: payload.error.message
    })
  } else {
    reqLogger.error('request_failed', {
      status,
      error,
      code: payload.error.code
    })
  }

  // Mirror requestId into the body so users can quote it in support tickets.
  const requestId = c.get('requestId')
  if (requestId) {
    payload.error.details = { ...(payload.error.details ?? {}), requestId }
  }

  c.res = c.json(payload, status)
}
