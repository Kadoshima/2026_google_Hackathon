/**
 * Centralized configuration with validation.
 *
 * This is the single place where environment variables are read.
 * The rest of the codebase should import from here so that
 * misconfiguration fails fast at startup with a clear error.
 */

import { logger } from './logger.js'

export type AppConfig = {
  env: 'development' | 'production' | 'test'
  port: number
  serviceName: string
  serviceVersion: string

  cors: {
    allowedOrigins: string[]
    allowAll: boolean
  }

  rateLimit: {
    upload: { max: number; windowMs: number }
    artifacts: { max: number; windowMs: number }
    analyze: { max: number; windowMs: number }
    oral: { max: number; windowMs: number }
    patch: { max: number; windowMs: number }
    waitlist: { max: number; windowMs: number }
    enabled: boolean
  }

  body: {
    maxJsonBytes: number
  }

  shutdown: {
    drainTimeoutMs: number
  }

  privacy: {
    privacyPolicyUrl?: string
    termsUrl?: string
  }
}

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback
  const v = value.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return fallback
}

const parseList = (value: string | undefined): string[] => {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const parseEnv = (value: string | undefined): AppConfig['env'] => {
  const v = (value ?? 'development').toLowerCase()
  if (v === 'production' || v === 'prod') return 'production'
  if (v === 'test') return 'test'
  return 'development'
}

let cached: AppConfig | null = null

export const loadConfig = (): AppConfig => {
  if (cached) return cached

  const env = parseEnv(process.env.NODE_ENV)
  const allowedOrigins = parseList(process.env.ALLOWED_ORIGINS)
  const allowAll = parseBool(process.env.CORS_ALLOW_ALL, env !== 'production')

  const config: AppConfig = {
    env,
    port: parseNumber(process.env.PORT, 8080),
    serviceName: process.env.SERVICE_NAME ?? 'reviewer-zero-back',
    serviceVersion: process.env.SERVICE_VERSION ?? process.env.K_REVISION ?? 'dev',

    cors: {
      allowedOrigins,
      allowAll
    },

    rateLimit: {
      enabled: parseBool(process.env.RATE_LIMIT_ENABLED, true),
      upload: {
        max: parseNumber(process.env.UPLOAD_RATE_LIMIT_MAX, 20),
        windowMs: parseNumber(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS, 60_000)
      },
      artifacts: {
        max: parseNumber(process.env.ARTIFACTS_RATE_LIMIT_MAX, 30),
        windowMs: parseNumber(process.env.ARTIFACTS_RATE_LIMIT_WINDOW_MS, 60_000)
      },
      analyze: {
        max: parseNumber(process.env.ANALYZE_RATE_LIMIT_MAX, 30),
        windowMs: parseNumber(process.env.ANALYZE_RATE_LIMIT_WINDOW_MS, 60_000)
      },
      oral: {
        max: parseNumber(process.env.ORAL_RATE_LIMIT_MAX, 60),
        windowMs: parseNumber(process.env.ORAL_RATE_LIMIT_WINDOW_MS, 60_000)
      },
      patch: {
        max: parseNumber(process.env.PATCH_RATE_LIMIT_MAX, 30),
        windowMs: parseNumber(process.env.PATCH_RATE_LIMIT_WINDOW_MS, 60_000)
      },
      waitlist: {
        max: parseNumber(process.env.WAITLIST_RATE_LIMIT_MAX, 5),
        windowMs: parseNumber(process.env.WAITLIST_RATE_LIMIT_WINDOW_MS, 600_000)
      }
    },

    body: {
      maxJsonBytes: parseNumber(process.env.MAX_JSON_BYTES, 5 * 1024 * 1024)
    },

    shutdown: {
      drainTimeoutMs: parseNumber(process.env.SHUTDOWN_DRAIN_TIMEOUT_MS, 25_000)
    },

    privacy: {
      ...(process.env.PRIVACY_POLICY_URL
        ? { privacyPolicyUrl: process.env.PRIVACY_POLICY_URL }
        : {}),
      ...(process.env.TERMS_URL ? { termsUrl: process.env.TERMS_URL } : {})
    }
  }

  // Validation: in production, require an explicit allowlist unless explicitly allowed.
  if (config.env === 'production' && config.cors.allowAll && config.cors.allowedOrigins.length === 0) {
    logger.warn(
      'CORS is configured to allow all origins in production. Set ALLOWED_ORIGINS or disable CORS_ALLOW_ALL.',
      { allowedOrigins: config.cors.allowedOrigins, allowAll: config.cors.allowAll }
    )
  }

  cached = config
  return config
}

/**
 * Reset the cached config. Test-only helper.
 */
export const __resetConfigForTests = () => {
  cached = null
}
