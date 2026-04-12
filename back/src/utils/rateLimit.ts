import type { Context, MiddlewareHandler } from 'hono'
import { createHash } from 'node:crypto'
import { AppError } from './errors.js'
import { resolveClientTokenHash } from './security.js'
import { loadConfig } from './config.js'

export {
  createFixedWindowRateLimiter,
  createNoopRateLimiter,
  createRateLimitMiddleware,
  resolveRateLimitKey
}
export type { RateLimiter, RateLimitConfig }

type RateLimitConfig = {
  maxRequests: number
  windowMs: number
}

type RateLimiter = {
  check: (key: string) => void
}

const createFixedWindowRateLimiter = (config: RateLimitConfig): RateLimiter => {
  const buckets = new Map<string, { count: number; windowStart: number }>()

  // Periodic GC to keep memory bounded for long-lived processes.
  // We don't keep a reference; this is a best-effort sweep.
  const gcIntervalMs = Math.max(config.windowMs * 4, 60_000)
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= config.windowMs * 2) {
        buckets.delete(key)
      }
    }
  }, gcIntervalMs)
  if (typeof timer.unref === 'function') timer.unref()

  return {
    check: (key: string) => {
      const now = Date.now()
      const current = buckets.get(key)

      if (!current || now - current.windowStart >= config.windowMs) {
        buckets.set(key, { count: 1, windowStart: now })
        return
      }

      if (current.count >= config.maxRequests) {
        throw new AppError(
          'RATE_LIMITED',
          'too many requests',
          429,
          { retryAfterMs: config.windowMs - (now - current.windowStart) }
        )
      }

      current.count += 1
      buckets.set(key, current)
    }
  }
}

const createNoopRateLimiter = (): RateLimiter => ({
  check: () => {}
})

/**
 * Resolve a rate-limit key for a request. Prefers the client-token hash
 * (so authenticated/known clients are isolated from each other) and
 * falls back to a best-effort IP from common proxy headers.
 */
const resolveRateLimitKey = (c: Context, scope: string): string => {
  const tokenHash = resolveClientTokenHash(c.req)
  if (tokenHash && tokenHash !== hashOfAnonymous) {
    return `${scope}:tk:${tokenHash}`
  }

  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip')?.trim() ||
    c.req.header('cf-connecting-ip')?.trim() ||
    'unknown'
  return `${scope}:ip:${ip}`
}

// Pre-compute the SHA256 of "anonymous" so we can detect un-tokened requests.
const hashOfAnonymous = createHash('sha256').update('anonymous').digest('hex')

/**
 * Hono middleware factory. Applies a fixed-window rate limit per
 * (scope, client) pair. On 429 the standard `Retry-After` header is set
 * (RFC 6585 §4) so well-behaved clients can back off.
 */
const createRateLimitMiddleware = (
  scope: string,
  config: RateLimitConfig
): MiddlewareHandler => {
  const cfg = loadConfig()
  if (!cfg.rateLimit.enabled) {
    return async (_c, next) => {
      await next()
    }
  }
  const limiter = createFixedWindowRateLimiter(config)
  return async (c, next) => {
    const key = resolveRateLimitKey(c, scope)
    try {
      limiter.check(key)
    } catch (err) {
      if (err instanceof AppError && err.code === 'RATE_LIMITED') {
        const retryAfterMs = (err.details as { retryAfterMs?: number })?.retryAfterMs ?? config.windowMs
        const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000))
        c.header('Retry-After', String(retryAfterSec))
      }
      throw err
    }
    await next()
  }
}
