import type { Hono } from 'hono'

export const registerHealthRoutes = (app: Hono) => {
  app.get('/healthz', (c) => c.text('ok'))
}
