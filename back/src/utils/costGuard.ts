/**
 * Per-scope LLM cost guard.
 *
 * Bounds how much a single session (or any caller-specified scope) can
 * spend on LLM calls. Enforced ahead of each call so that a runaway
 * analysis, a pathological retry loop, or a prompt-injection attack
 * cannot exhaust the project's Vertex quota.
 *
 * Limits are configurable via env:
 *   COST_GUARD_ENABLED=true|false                 (default true)
 *   COST_GUARD_MAX_CALLS_PER_SESSION=200
 *   COST_GUARD_MAX_INPUT_CHARS_PER_SESSION=2000000
 *   COST_GUARD_MAX_OUTPUT_CHARS_PER_SESSION=800000
 *   COST_GUARD_WINDOW_MS=3600000                  (rolling window, default 1h)
 *
 * The implementation is in-memory (fixed-window per scope). This is
 * sufficient for a single-replica Cloud Run instance because each
 * analysis runs inside one process. For multi-replica production,
 * swap the store for Redis.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { AppError } from './errors.js'
import { logger } from './logger.js'

/**
 * AsyncLocalStorage carrying the "current" cost scope for an async flow.
 * The analysis orchestrator wraps its pipeline in `withCostScope(sessionId)`
 * so that any nested LLM calls are charged to the right session without
 * having to plumb the ID through every function signature.
 */
const scopeStorage = new AsyncLocalStorage<string>()

export const withCostScope = <T>(scope: string, fn: () => Promise<T> | T): Promise<T> | T => {
  return scopeStorage.run(scope, fn)
}

/**
 * Set the cost scope for the remainder of the current async context.
 * Useful when the scope is only known after some setup has already run
 * (e.g. inside an orchestrator method that has to fetch the session ID
 * before it can wrap its pipeline).
 */
export const setCostScopeForAsyncFlow = (scope: string): void => {
  scopeStorage.enterWith(scope)
}

export const currentCostScope = (): string | undefined => scopeStorage.getStore()

export type CostGuardConfig = {
  enabled: boolean
  maxCalls: number
  maxInputChars: number
  maxOutputChars: number
  windowMs: number
}

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const bool = (v: string | undefined, fallback: boolean): boolean => {
  if (v === undefined || v === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

let configCache: CostGuardConfig | null = null
export const loadCostGuardConfig = (): CostGuardConfig => {
  if (configCache) return configCache
  configCache = {
    enabled: bool(process.env.COST_GUARD_ENABLED, true),
    maxCalls: num(process.env.COST_GUARD_MAX_CALLS_PER_SESSION, 200),
    maxInputChars: num(process.env.COST_GUARD_MAX_INPUT_CHARS_PER_SESSION, 2_000_000),
    maxOutputChars: num(process.env.COST_GUARD_MAX_OUTPUT_CHARS_PER_SESSION, 800_000),
    windowMs: num(process.env.COST_GUARD_WINDOW_MS, 60 * 60 * 1000)
  }
  return configCache
}

type Bucket = {
  calls: number
  inputChars: number
  outputChars: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()

const getBucket = (scope: string, now: number, windowMs: number): Bucket => {
  const current = buckets.get(scope)
  if (!current || now - current.windowStart >= windowMs) {
    const fresh: Bucket = {
      calls: 0,
      inputChars: 0,
      outputChars: 0,
      windowStart: now
    }
    buckets.set(scope, fresh)
    return fresh
  }
  return current
}

/**
 * Reserve budget for an upcoming LLM call.
 *
 * Call this BEFORE sending the request. If the reservation fits,
 * counters are incremented and the function returns. Otherwise it
 * throws `AppError('QUOTA_EXCEEDED', ..., 429)`.
 *
 * The `scope` is typically the session ID, but any opaque key works.
 * Pass `inputChars` so the guard can reject oversized prompts up-front;
 * call `recordUsage` afterwards to commit the actual output size.
 */
export const reserveBudget = (params: {
  scope: string
  inputChars: number
  expectedOutputChars?: number
}): void => {
  const cfg = loadCostGuardConfig()
  if (!cfg.enabled) return

  const now = Date.now()
  const bucket = getBucket(params.scope, now, cfg.windowMs)

  const nextCalls = bucket.calls + 1
  const nextInput = bucket.inputChars + params.inputChars
  const expectedOutput = params.expectedOutputChars ?? 0
  const nextOutputProjection = bucket.outputChars + expectedOutput

  const violations: Array<{ metric: string; limit: number; projected: number }> = []
  if (nextCalls > cfg.maxCalls) {
    violations.push({ metric: 'calls', limit: cfg.maxCalls, projected: nextCalls })
  }
  if (nextInput > cfg.maxInputChars) {
    violations.push({
      metric: 'inputChars',
      limit: cfg.maxInputChars,
      projected: nextInput
    })
  }
  if (nextOutputProjection > cfg.maxOutputChars) {
    violations.push({
      metric: 'outputChars',
      limit: cfg.maxOutputChars,
      projected: nextOutputProjection
    })
  }

  if (violations.length > 0) {
    logger.warn('cost_guard_blocked', {
      scope: params.scope,
      violations,
      windowMs: cfg.windowMs
    })
    throw new AppError(
      'QUOTA_EXCEEDED',
      'session LLM budget exceeded',
      429,
      {
        violations,
        windowMs: cfg.windowMs,
        retryAfterMs: cfg.windowMs - (now - bucket.windowStart)
      }
    )
  }

  bucket.calls = nextCalls
  bucket.inputChars = nextInput
  // outputChars is committed separately via recordUsage.
}

/**
 * Record the observed output size of an LLM call so future
 * reserveBudget() calls are aware of the updated totals.
 */
export const recordUsage = (params: {
  scope: string
  outputChars: number
}): void => {
  const cfg = loadCostGuardConfig()
  if (!cfg.enabled) return
  const bucket = getBucket(params.scope, Date.now(), cfg.windowMs)
  bucket.outputChars += params.outputChars
}

/**
 * Current per-scope usage snapshot. Useful for /v1/settings or admin UIs.
 */
export const peekUsage = (scope: string): {
  calls: number
  inputChars: number
  outputChars: number
  windowStart: number
} | null => {
  const bucket = buckets.get(scope)
  if (!bucket) return null
  return { ...bucket }
}

/**
 * Reset a scope. Used in tests and rarely as an operator escape hatch.
 */
export const resetScope = (scope: string): void => {
  buckets.delete(scope)
}

/**
 * Reset all counters. Tests only.
 */
export const __resetAllForTests = (): void => {
  buckets.clear()
  configCache = null
}

// Periodic GC so idle scopes don't live forever.
const gcTimer = setInterval(() => {
  const cfg = loadCostGuardConfig()
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= cfg.windowMs * 2) {
      buckets.delete(key)
    }
  }
}, 5 * 60 * 1000)
if (typeof gcTimer.unref === 'function') gcTimer.unref()
