/**
 * Structured logger.
 *
 * Emits JSON lines so that Cloud Logging (and most log aggregators)
 * can index fields like severity, requestId, traceId, etc.
 *
 * Format follows Google Cloud Logging "structured JSON" payload:
 * https://cloud.google.com/logging/docs/structured-logging
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  NOTICE: 25,
  WARNING: 30,
  ERROR: 40,
  CRITICAL: 50
}

const parseLevel = (raw: string | undefined): LogLevel => {
  if (!raw) return 'INFO'
  const upper = raw.toUpperCase()
  if (upper in LEVEL_PRIORITY) return upper as LogLevel
  return 'INFO'
}

const minLevel = parseLevel(process.env.LOG_LEVEL)
const serviceName = process.env.SERVICE_NAME ?? 'reviewer-zero-back'
const serviceVersion = process.env.SERVICE_VERSION ?? process.env.K_REVISION ?? 'dev'

type LogContext = Record<string, unknown>

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ message: '[unserializable log payload]' })
  }
}

const serializeError = (err: unknown): Record<string, unknown> => {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(typeof (err as { code?: unknown }).code === 'string'
        ? { code: (err as { code?: string }).code }
        : {})
    }
  }
  return { message: String(err) }
}

const emit = (severity: LogLevel, message: string, context?: LogContext) => {
  if (LEVEL_PRIORITY[severity] < LEVEL_PRIORITY[minLevel]) return

  const entry: Record<string, unknown> = {
    severity,
    message,
    timestamp: new Date().toISOString(),
    service: serviceName,
    version: serviceVersion
  }

  if (context) {
    if (context.error !== undefined) {
      entry.error = serializeError(context.error)
    }
    for (const [key, value] of Object.entries(context)) {
      if (key === 'error') continue
      entry[key] = value
    }
  }

  const line = safeStringify(entry)
  // Cloud Logging picks up severity from the JSON payload itself.
  if (severity === 'ERROR' || severity === 'CRITICAL') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export type Logger = {
  debug: (message: string, context?: LogContext) => void
  info: (message: string, context?: LogContext) => void
  notice: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, context?: LogContext) => void
  critical: (message: string, context?: LogContext) => void
  child: (bindings: LogContext) => Logger
}

const make = (bindings: LogContext = {}): Logger => {
  const merge = (extra?: LogContext): LogContext | undefined => {
    if (!extra && Object.keys(bindings).length === 0) return undefined
    return { ...bindings, ...(extra ?? {}) }
  }

  return {
    debug: (message, ctx) => emit('DEBUG', message, merge(ctx)),
    info: (message, ctx) => emit('INFO', message, merge(ctx)),
    notice: (message, ctx) => emit('NOTICE', message, merge(ctx)),
    warn: (message, ctx) => emit('WARNING', message, merge(ctx)),
    error: (message, ctx) => emit('ERROR', message, merge(ctx)),
    critical: (message, ctx) => emit('CRITICAL', message, merge(ctx)),
    child: (extra) => make({ ...bindings, ...extra })
  }
}

export const logger = make()
