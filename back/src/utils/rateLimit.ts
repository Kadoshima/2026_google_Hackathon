import { AppError } from './errors.js'

export { createFixedWindowRateLimiter, createNoopRateLimiter }
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
