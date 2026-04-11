/**
 * Idempotency-Key support.
 *
 * Clients retrying a mutating request with the same `Idempotency-Key`
 * header should get the exact same response they got the first time,
 * instead of a duplicate side effect (a duplicate analysis, a duplicate
 * patch generation, etc.).
 *
 * This implementation is in-memory for simplicity and is suitable for
 * single-replica deployments. For multi-replica production, swap
 * `InMemoryIdempotencyStore` for a Redis- or Firestore-backed store.
 */

import type { MiddlewareHandler } from 'hono'
import { AppError } from './errors.js'
import { loadConfig } from './config.js'
import { logger } from './logger.js'

export type StoredResponse = {
  status: number
  body: string
  contentType: string
  createdAt: number
}

export type IdempotencyStore = {
  /** Reserve a key. Returns the stored response if one already exists. */
  reserve: (key: string) => { existing: StoredResponse | null }
  /** Persist the response for a key. */
  save: (key: string, response: StoredResponse) => void
  /** Remove a reservation when the request fails before a response is saved. */
  release: (key: string) => void
}

const DEFAULT_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ENTRIES = 10_000

export const createInMemoryIdempotencyStore = (
  ttlMs: number = DEFAULT_TTL_MS
): IdempotencyStore => {
  type Entry =
    | { state: 'pending'; createdAt: number }
    | { state: 'done'; response: StoredResponse }

  const entries = new Map<string, Entry>()

  const gc = () => {
    const now = Date.now()
    for (const [key, entry] of entries) {
      const createdAt = entry.state === 'pending' ? entry.createdAt : entry.response.createdAt
      if (now - createdAt > ttlMs) {
        entries.delete(key)
      }
    }
    // Evict oldest if we blow the cap (simple LRU-ish by insertion order).
    while (entries.size > MAX_ENTRIES) {
      const firstKey = entries.keys().next().value
      if (firstKey === undefined) break
      entries.delete(firstKey)
    }
  }

  const timer = setInterval(gc, Math.max(ttlMs / 4, 30_000))
  if (typeof timer.unref === 'function') timer.unref()

  return {
    reserve: (key) => {
      gc()
      const existing = entries.get(key)
      if (existing && existing.state === 'done') {
        return { existing: existing.response }
      }
      if (existing && existing.state === 'pending') {
        // Another concurrent request is already in flight with this key.
        throw new AppError(
          'IDEMPOTENCY_IN_PROGRESS',
          'a request with this idempotency key is still in progress',
          409
        )
      }
      entries.set(key, { state: 'pending', createdAt: Date.now() })
      return { existing: null }
    },
    save: (key, response) => {
      entries.set(key, { state: 'done', response })
    },
    release: (key) => {
      const existing = entries.get(key)
      if (existing && existing.state === 'pending') {
        entries.delete(key)
      }
    }
  }
}

const defaultStore = createInMemoryIdempotencyStore()

const HEADER = 'Idempotency-Key'
const MAX_KEY_LENGTH = 255
// Permissive character set; rejects control characters / whitespace.
const KEY_PATTERN = /^[A-Za-z0-9._:~+-]{8,255}$/

export const validateIdempotencyKey = (raw: string | undefined | null): string | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_KEY_LENGTH) {
    throw new AppError(
      'INVALID_INPUT',
      `${HEADER} must be at most ${MAX_KEY_LENGTH} characters`,
      400
    )
  }
  if (!KEY_PATTERN.test(trimmed)) {
    throw new AppError(
      'INVALID_INPUT',
      `${HEADER} contains invalid characters (allowed: [A-Za-z0-9._:~+-], 8..255 chars)`,
      400
    )
  }
  return trimmed
}

/**
 * Hono middleware. Wraps mutating endpoints so that repeat requests with
 * the same Idempotency-Key return the cached response.
 *
 * Attach on a per-route basis; the `scope` is used to namespace keys so
 * that two different endpoints can share a key without colliding.
 */
export const createIdempotencyMiddleware = (
  scope: string,
  store: IdempotencyStore = defaultStore
): MiddlewareHandler => {
  return async (c, next) => {
    const rawKey = c.req.header(HEADER)
    const clean = validateIdempotencyKey(rawKey)
    if (!clean) {
      // Idempotency is opt-in; if the client didn't send a key, pass through.
      await next()
      return
    }

    // Only act on mutating methods.
    const method = c.req.method.toUpperCase()
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
      await next()
      return
    }

    const cfg = loadConfig()
    if (cfg.env === 'test') {
      // Still useful in tests; no-op special casing needed.
    }

    const namespacedKey = `${scope}:${clean}`
    const { existing } = store.reserve(namespacedKey)
    if (existing) {
      logger.info('idempotency_replay', { scope, key: clean })
      c.header('Idempotent-Replayed', 'true')
      c.header('Content-Type', existing.contentType)
      return c.body(existing.body, existing.status as 200)
    }

    try {
      await next()

      const res = c.res
      const status = res.status

      // Only cache successful (2xx) responses. Caching 4xx client errors
      // is acceptable (the same bad input will always fail), but 5xx
      // server errors should NOT be cached — they are often transient
      // (dependency outage, timeout) and the client should be able to
      // recover on retry once the backend is healthy again.
      if (status >= 500) {
        store.release(namespacedKey)
        return
      }

      const contentType = res.headers.get('content-type') ?? 'application/json; charset=UTF-8'
      const body = await res.clone().text()
      store.save(namespacedKey, {
        status,
        body,
        contentType,
        createdAt: Date.now()
      })
    } catch (err) {
      store.release(namespacedKey)
      throw err
    }
  }
}
