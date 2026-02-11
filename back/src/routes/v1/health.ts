import type { Hono } from 'hono'

export const registerHealthRoutes = (app: Hono) => {
  app.get('/healthz', (c) => c.text('ok', 200))
  app.get('/health', (c) => c.text('ok', 200))
}
