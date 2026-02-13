import type { Hono } from 'hono'
import { firestore } from '../../services/firestore.repo.js'
import { buildError } from '../../utils/errors.js'

type SettingsRequest = {
  save_enabled?: boolean
  retention_days?: number
  language?: 'ja' | 'en'
}

type SettingsResponse = SettingsRequest & {
  client_token: string
  updated_at: string
}

export const registerSettingsRoutes = (app: Hono) => {
  app.put('/settings', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(buildError('INVALID_INPUT', 'request body must be JSON'), 400)
    }

    const parsed = parseSettingsRequest(body)
    if (!parsed.ok) {
      return c.json(buildError('INVALID_INPUT', parsed.message), 400)
    }

    const clientToken =
      c.req.header('x-client-token-hash') ??
      c.req.header('x-client-token')

    if (!clientToken) {
      return c.json(buildError('INVALID_INPUT', 'X-Client-Token is required'), 400)
    }

    try {
      const updatedAt = new Date().toISOString()
      await firestore
        .collection('client_settings')
        .doc(clientToken)
        .set(
          {
            ...parsed.value,
            updated_at: updatedAt
          },
          { merge: true }
        )

      const response: SettingsResponse = {
        ...parsed.value,
        client_token: clientToken,
        updated_at: updatedAt
      }

      return c.json(response, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to update settings', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

const parseSettingsRequest = (
  value: unknown
): { ok: true; value: SettingsRequest } | { ok: false; message: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'request body must be an object' }
  }

  const record = value as Record<string, unknown>
  const saveEnabled = record.save_enabled
  const retentionDays = record.retention_days
  const language = record.language

  if (saveEnabled !== undefined && typeof saveEnabled !== 'boolean') {
    return { ok: false, message: 'save_enabled must be boolean' }
  }
  if (retentionDays !== undefined && typeof retentionDays !== 'number') {
    return { ok: false, message: 'retention_days must be number' }
  }
  if (language !== undefined && language !== 'ja' && language !== 'en') {
    return { ok: false, message: 'language must be ja or en' }
  }

  return {
    ok: true,
    value: {
      ...(saveEnabled !== undefined ? { save_enabled: saveEnabled } : {}),
      ...(retentionDays !== undefined ? { retention_days: retentionDays } : {}),
      ...(language !== undefined ? { language } : {})
    }
  }
}
