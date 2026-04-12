/**
 * Request body size enforcement.
 *
 * For multipart uploads (PDF/ZIP), we rely on the route-specific size
 * checks (PDF_VERTEX_MAX_BYTES, ZIP_TOO_LARGE, etc.) because parsing
 * multipart streams up-front would defeat the purpose.
 *
 * For JSON bodies, we enforce a hard ceiling both via Content-Length
 * (fast-path) and by counting actual bytes consumed from the body
 * stream (catches chunked-encoding / missing Content-Length).
 */

import type { MiddlewareHandler } from 'hono'
import { AppError } from './errors.js'
import { loadConfig } from './config.js'

export const createBodyLimitMiddleware = (): MiddlewareHandler => {
  const config = loadConfig()
  const limit = config.body.maxJsonBytes

  return async (c, next) => {
    const contentType = (c.req.header('content-type') ?? '').toLowerCase()
    const method = c.req.method.toUpperCase()
    // Only enforce on methods that carry a body, but check ALL body-bearing
    // requests regardless of Content-Type — otherwise a client could set
    // `Content-Type: text/plain` and stream megabytes to bypass the check.
    // Uploads use multipart/form-data and are handled here by the size
    // check too (their own route also clamps the file size).
    const isBodyMethod =
      method === 'POST' ||
      method === 'PUT' ||
      method === 'PATCH' ||
      method === 'DELETE'
    if (!isBodyMethod) {
      await next()
      return
    }

    // Multipart uploads have their own per-route limits (larger ceilings
    // for PDFs / ZIPs). Skip the JSON-oriented global cap for them.
    if (contentType.startsWith('multipart/form-data')) {
      await next()
      return
    }

    // Fast-path: reject early when Content-Length is present and already
    // too large. This is not a substitute for measuring actual bytes — a
    // client can under-report Content-Length and stream more — but it
    // avoids buffering when the intent is obviously over the limit.
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

    // Slow-path: ALWAYS measure the actual bytes consumed from the stream,
    // regardless of whether Content-Length was present. This catches
    // chunked encoding and header forgery.
    const body = c.req.raw.body
    if (body) {
      const chunks: Uint8Array[] = []
      let totalBytes = 0
      const reader = body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          totalBytes += value.byteLength
          if (totalBytes > limit) {
            reader.cancel()
            throw new AppError(
              'PAYLOAD_TOO_LARGE',
              `request body exceeds limit of ${limit} bytes`,
              413,
              { limit, received: totalBytes }
            )
          }
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }

      // Reassemble the consumed body so downstream c.req.json() works.
      const merged = new Uint8Array(totalBytes)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
      }

      const originalRequest = c.req.raw
      const newRequest = new Request(originalRequest.url, {
        method: originalRequest.method,
        headers: originalRequest.headers,
        body: merged
      })
      // Hono exposes the raw Request; replace it in-place.
      ;(c.req as unknown as { raw: Request }).raw = newRequest
    }

    await next()
  }
}
