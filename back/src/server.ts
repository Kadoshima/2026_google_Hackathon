import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { registerV1Routes } from './routes/v1/index.js'
import { registerInternalRoutes } from './routes/internal/index.js'

export const createApp = () => {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return '*'
        if (origin.startsWith('http://localhost:')) return origin
        return origin
      },
      allowHeaders: ['Content-Type', 'Authorization', 'X-Client-Token-Hash'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600
    })
  )

  registerV1Routes(app)
  registerInternalRoutes(app)

  return app
}
