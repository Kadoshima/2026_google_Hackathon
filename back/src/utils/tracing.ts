/**
 * OpenTelemetry bootstrap.
 *
 * This module is imported as the very first thing in `index.ts` so that
 * instrumentations can patch modules (http, fetch, express-like frameworks)
 * before they are loaded.
 *
 * Enable by setting OTEL_ENABLED=true in the environment. The exporter
 * defaults to OTLP/HTTP. In Google Cloud, set OTEL_EXPORTER_OTLP_ENDPOINT
 * to the Cloud Trace collector or any OTLP-compatible sink.
 *
 * Relevant env vars:
 *   OTEL_ENABLED=true
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
 *   OTEL_SERVICE_NAME=reviewer-zero-back
 */

import { trace, context, type Span } from '@opentelemetry/api'

let started = false
let sdkRef: unknown = null

export const startTracing = async (): Promise<void> => {
  if (started) return
  if ((process.env.OTEL_ENABLED ?? 'false').toLowerCase() !== 'true') {
    return
  }

  try {
    // Dynamically import so that test / local runs that don't enable OTel
    // don't pay the startup cost (SDK pulls in lots of transitive code).
    const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }] =
      await Promise.all([
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/auto-instrumentations-node'),
        import('@opentelemetry/exporter-trace-otlp-http')
      ])

    const serviceName =
      process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? 'reviewer-zero-back'

    const sdk = new NodeSDK({
      serviceName,
      traceExporter: new OTLPTraceExporter({
        ...(process.env.OTEL_EXPORTER_OTLP_ENDPOINT
          ? { url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }
          : {})
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false }
        })
      ]
    })

    sdk.start()
    sdkRef = sdk
    started = true

    // Publish a tiny hook so logger.ts can pick up trace context without
    // a hard import (avoids a cycle).
    ;(globalThis as unknown as {
      __otelHook?: { currentTraceContext: typeof currentTraceContext }
    }).__otelHook = { currentTraceContext }
    // eslint-disable-next-line no-console
    process.stdout.write(
      JSON.stringify({
        severity: 'INFO',
        message: 'otel_started',
        service: serviceName,
        endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '(default)'
      }) + '\n'
    )
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        severity: 'WARNING',
        message: 'otel_start_failed',
        error: err instanceof Error ? err.message : String(err)
      }) + '\n'
    )
  }
}

export const shutdownTracing = async (): Promise<void> => {
  if (!sdkRef) return
  try {
    const sdk = sdkRef as { shutdown?: () => Promise<void> }
    if (typeof sdk.shutdown === 'function') {
      await sdk.shutdown()
    }
  } catch {
    // best effort
  }
}

/**
 * Read the current trace + span ID from the active context.
 * Returns undefined fields if no span is active, letting the logger
 * simply omit the keys.
 */
export const currentTraceContext = (): {
  traceId?: string
  spanId?: string
  traceFlags?: number
} => {
  const span: Span | undefined = trace.getActiveSpan()
  if (!span) return {}
  const sc = span.spanContext()
  if (!sc || !sc.traceId) return {}
  return {
    traceId: sc.traceId,
    spanId: sc.spanId,
    traceFlags: sc.traceFlags
  }
}

/**
 * Run a function inside a manually-created span. Returns the result of fn.
 * Useful for wrapping LLM calls, storage operations, etc.
 */
export const withSpan = async <T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: () => Promise<T>
): Promise<T> => {
  const tracer = trace.getTracer('reviewer-zero')
  const cleanAttrs: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(attributes)) {
    if (v !== undefined) cleanAttrs[k] = v
  }
  return tracer.startActiveSpan(name, { attributes: cleanAttrs }, async (span) => {
    try {
      const result = await fn()
      span.setStatus({ code: 1 }) // OK
      return result
    } catch (err) {
      span.setStatus({
        code: 2, // ERROR
        message: err instanceof Error ? err.message : 'unknown error'
      })
      if (err instanceof Error) {
        span.recordException(err)
      }
      throw err
    } finally {
      span.end()
    }
  })
}

export { context }
