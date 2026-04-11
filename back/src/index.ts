import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './server.js'
import { loadConfig } from './utils/config.js'
import { logger } from './utils/logger.js'
import { markShuttingDown } from './routes/v1/health.js'
import { shutdownTracing, startTracing } from './utils/tracing.js'

// Start OpenTelemetry before importing/creating the server so that
// auto-instrumentations can patch http/fetch before they are used.
await startTracing()

const config = loadConfig()

const server = serve(
  {
    fetch: createApp().fetch,
    port: config.port
  },
  (info) => {
    logger.info('server_started', {
      port: info.port,
      env: config.env,
      service: config.serviceName,
      version: config.serviceVersion
    })
  }
)

// --- Graceful shutdown -------------------------------------------------------
//
// On SIGTERM (Cloud Run, Kubernetes) and SIGINT (Ctrl-C), we:
//   1. Flip the readiness flag so /readyz starts returning 503.
//   2. Stop accepting new connections.
//   3. Wait up to drainTimeoutMs for in-flight requests to finish.
//   4. Force-exit if drain takes too long.
//
let shuttingDown = false

const shutdown = (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  markShuttingDown()
  logger.info('shutdown_initiated', { signal })

  const forceExit = setTimeout(() => {
    logger.error('shutdown_force_exit', {
      timeoutMs: config.shutdown.drainTimeoutMs
    })
    process.exit(1)
  }, config.shutdown.drainTimeoutMs)
  forceExit.unref()

  server.close(async (err) => {
    if (err) {
      logger.error('shutdown_close_error', { error: err })
      process.exit(1)
    }
    await shutdownTracing()
    logger.info('shutdown_complete')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Surface unhandled errors so we don't lose them in the void.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { error: reason })
})
process.on('uncaughtException', (err) => {
  logger.critical('uncaught_exception', { error: err })
  // Best practice: exit and let the orchestrator restart.
  shutdown('uncaughtException')
})
