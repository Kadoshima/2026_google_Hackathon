/**
 * Request body size enforcement.
 *
 * For multipart uploads (PDF/ZIP), we rely on the route-specific size
 * checks (PDF_VERTEX_MAX_BYTES, ZIP_TOO_LARGE, etc.) because parsing
 * multipart streams up-front would defeat the purpose.
 *
 * For JSON bodies, we enforce a hard ceiling early so that attackers
 * cannot exhaust the process by streaming a giant JSON blob into
 * `c.req.json()`.
 */

import type { MiddlewareHandler } from 'hono'
import { AppError } from './errors.js'
import { loadConfig } from './config.js'

export const createBodyLimitMiddleware = (): MiddlewareHandler => {
  const config = loadConfig()
  const limit = config.body.maxJsonBytes

  return async (c, next) => {
    const contentType = (c.req.header('content-type') ?? '').toLowerCase()
    // Skip non-JSON requests; uploads go through the multipart guard.
    if (!contentType.includes('application/json')) {
      await next()
      return
    }

    const contentLengthHeader = c.req.header('content-length')
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader)
      if (Number.isFinite(contentLength) && contentLength > limit) {
        throw new AppError(
          'PAYLOAD_TOO_LARGE',
          `request body exceeds limit of ${limit} bytes`,
          413,
          { limit, received: contentLength }
        )
      }
    }

    await next()
  }
}
