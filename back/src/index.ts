import { serve } from '@hono/node-server'
import { createApp } from './server.js'

const port = Number(process.env.PORT ?? 8080)

serve({ fetch: createApp().fetch, port })
