import type { Hono } from 'hono'
import type { AnalyzeRequest, AnalyzeResponse } from 'shared'
import { createAnalysis } from '../../services/firestore.repo.js'
import { enqueueAnalysisTask } from '../../services/tasks.service.js'
import { buildError } from '../../utils/errors.js'
import { makeId } from '../../utils/ids.js'

export const registerAnalyzeRoutes = (app: Hono) => {
  app.post('/analyze', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(buildError('INVALID_INPUT', 'request body must be JSON'), 400)
    }

    const parsed = parseAnalyzeRequest(body)
    if (!parsed.ok) {
      return c.json(buildError('INVALID_INPUT', parsed.message), 400)
    }

    const analysisId = makeId('ana')

    try {
      await createAnalysis({
        analysisId,
        sessionId: parsed.value.session_id,
        submissionId: parsed.value.submission_id
      })

      await enqueueAnalysisTask({ analysisId })

      const response: AnalyzeResponse = { analysis_id: analysisId }
      return c.json(response, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to enqueue analysis', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

const parseAnalyzeRequest = (
  value: unknown
): { ok: true; value: AnalyzeRequest } | { ok: false; message: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'request body must be an object' }
  }

  const record = value as Record<string, unknown>
  const sessionId = record.session_id
  const submissionId = record.submission_id

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { ok: false, message: 'session_id is required' }
  }

  if (typeof submissionId !== 'string' || submissionId.length === 0) {
    return { ok: false, message: 'submission_id is required' }
  }

  return {
    ok: true,
    value: {
      session_id: sessionId,
      submission_id: submissionId
    }
  }
}
