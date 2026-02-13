import type { Hono } from 'hono'
import type { PatchGenerateRequest, PatchGenerateResponse } from 'shared'
import { getAnalysis } from '../../services/firestore.repo.js'
import { generateUnifiedDiff } from '../../services/patch/patch.service.js'
import { getSignedUrl, putText } from '../../services/storage.service.js'
import { buildError } from '../../utils/errors.js'
import { makeId } from '../../utils/ids.js'

export const registerPatchRoutes = (app: Hono) => {
  app.post('/patch/generate', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(buildError('INVALID_INPUT', 'request body must be JSON'), 400)
    }

    const parsed = parsePatchGenerateRequest(body)
    if (!parsed.ok) {
      return c.json(buildError('INVALID_INPUT', parsed.message), 400)
    }

    try {
      const analysis = await getAnalysis({ analysisId: parsed.value.analysis_id })
      if (!analysis) {
        return c.json(buildError('NOT_FOUND', 'analysis not found'), 404)
      }

      const generated = generateUnifiedDiff({
        analysisId: parsed.value.analysis_id,
        acceptedTodos: parsed.value.accepted_todos
      })

      const patchId = makeId('rep')
      const gcsPath = await putText({
        objectPath: `patches/${parsed.value.analysis_id}/${patchId}.diff`,
        text: generated.diffText,
        contentType: 'text/x-diff; charset=utf-8'
      })
      const diffSignedUrl = await getSignedUrl(gcsPath)

      const response: PatchGenerateResponse = {
        diff_signed_url: diffSignedUrl,
        patch_summary: generated.patchSummary
      }
      return c.json(response, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to generate patch', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

const parsePatchGenerateRequest = (
  value: unknown
): { ok: true; value: PatchGenerateRequest } | { ok: false; message: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'request body must be an object' }
  }

  const record = value as Record<string, unknown>
  const analysisId = record.analysis_id
  const acceptedTodos = record.accepted_todos
  const format = record.format

  if (typeof analysisId !== 'string' || analysisId.length === 0) {
    return { ok: false, message: 'analysis_id is required' }
  }
  if (!Array.isArray(acceptedTodos)) {
    return { ok: false, message: 'accepted_todos must be string[]' }
  }
  if (acceptedTodos.some((item) => typeof item !== 'string')) {
    return { ok: false, message: 'accepted_todos must be string[]' }
  }
  if (format !== undefined && format !== 'UNIFIED_DIFF') {
    return { ok: false, message: 'format must be UNIFIED_DIFF' }
  }

  return {
    ok: true,
    value: {
      analysis_id: analysisId,
      accepted_todos: acceptedTodos,
      ...(format ? { format } : {})
    }
  }
}
