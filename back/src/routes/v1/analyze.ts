import type { Hono } from 'hono'
import type { AnalyzeRequest, AnalyzeResponse } from 'shared'
import {
  createAnalysis,
  getSession,
  getLatestSubmissionBySession
} from '../../services/firestore.repo.js'
import {
  enqueueAnalysisTask,
  getTasksDispatchMode
} from '../../services/tasks.service.js'
import { buildError } from '../../utils/errors.js'
import { makeId } from '../../utils/ids.js'
import { createFixedWindowRateLimiter } from '../../utils/rateLimit.js'
import { resolveClientTokenHash, isSessionOwner } from '../../utils/security.js'

const analyzeRateLimiter = createFixedWindowRateLimiter({
  maxRequests: Number(process.env.ANALYZE_RATE_LIMIT_MAX ?? 60),
  windowMs: Number(process.env.ANALYZE_RATE_LIMIT_WINDOW_MS ?? 60_000)
})

export const registerAnalyzeRoutes = (app: Hono) => {
  app.post('/analyze', async (c) => {
    const clientTokenHash = resolveClientTokenHash(c.req)
    try {
      analyzeRateLimiter.check(`analyze:${clientTokenHash}`)
    } catch (error) {
      return c.json(
        buildError('RATE_LIMITED', 'too many analyze requests', {
          message: error instanceof Error ? error.message : 'rate limit exceeded'
        }),
        429
      )
    }

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

    // Authorization: the caller must own the target session before we
    // spin up a new analysis against it. Without this, any client could
    // trigger compute on somebody else's session and burn their quota.
    try {
      const session = await getSession({ sessionId: parsed.value.session_id })
      if (!isSessionOwner(session, clientTokenHash)) {
        return c.json(buildError('NOT_FOUND', 'session not found'), 404)
      }

      // Ensure the submission belongs to the session as claimed.
      const submission = await getLatestSubmissionBySession({
        sessionId: parsed.value.session_id
      })
      if (
        !submission ||
        submission.submissionId !== parsed.value.submission_id
      ) {
        return c.json(
          buildError('INVALID_INPUT', 'submission does not belong to session'),
          400
        )
      }
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to verify ownership', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
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
          dispatch_mode: getTasksDispatchMode(),
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
