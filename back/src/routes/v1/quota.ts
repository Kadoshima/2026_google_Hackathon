import type { Hono } from 'hono'
import { getFreeQuotaStatus } from '../../services/quota.service.js'
import { resolveClientTokenHash } from '../../utils/security.js'
import { buildError } from '../../utils/errors.js'

export const registerQuotaRoutes = (app: Hono) => {
  app.get('/quota', async (c) => {
    try {
      const clientTokenHash = resolveClientTokenHash(c.req)
      const status = await getFreeQuotaStatus(clientTokenHash)
      return c.json(
        {
          plan: status.plan,
          used: status.used,
          limit: status.limit,
          remaining: status.remaining,
          window_ends_at: status.windowEndsAtIso
        },
        200
      )
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to read quota', {
          message: error instanceof Error ? error.message : 'unknown'
        }),
        500
      )
    }
  })
}
