import type { Hono } from 'hono'
import { loadConfig } from '../../utils/config.js'

/**
 * Health endpoints split into liveness and readiness so that orchestrators
 * (Cloud Run, Kubernetes, etc.) can probe them independently.
 *
 * - /healthz, /health      : liveness — process is up
 * - /readyz                : readiness — ready to serve traffic
 * - /version               : build/version metadata for ops dashboards
 */
export const registerHealthRoutes = (app: Hono) => {
  // Liveness — minimal, never blocks on dependencies.
  app.get('/healthz', (c) => c.json({ status: 'ok' }, 200))
  app.get('/health', (c) => c.json({ status: 'ok' }, 200))

  // Readiness — currently the same as liveness because external deps are
  // accessed lazily; if/when warm-up checks are added, do them here.
  app.get('/readyz', (c) => {
    if (isShuttingDown()) {
      return c.json({ status: 'shutting_down' }, 503)
    }
    return c.json({ status: 'ready' }, 200)
  })

  app.get('/version', (c) => {
    const config = loadConfig()
    return c.json(
      {
        service: config.serviceName,
        version: config.serviceVersion,
        env: config.env,
        node: process.version,
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()
      },
      200
    )
  })
}

let shuttingDown = false

export const markShuttingDown = () => {
  shuttingDown = true
}

export const isShuttingDown = () => shuttingDown
