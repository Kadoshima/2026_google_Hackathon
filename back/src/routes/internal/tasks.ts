import type { Hono } from 'hono'
import { AnalysisStatus, AnalysisStep } from '../../domain/enums.js'
import { AnalysisOrchestrator } from '../../services/analysis/orchestrator.js'
import { FirestoreRepo } from '../../services/firestore.repo.js'
import { buildError, ErrorCodes, toErrorResponse } from '../../utils/errors.js'

type AnalyzeTaskBody = {
  analysis_id: string
}

const ANALYSIS_ID_PATTERN = /^ana_[A-Za-z0-9_-]+$/

const parseBody = (value: unknown): AnalyzeTaskBody => {
  if (!value || typeof value !== 'object') {
    throw new Error('request body must be an object')
  }

  const body = value as Partial<AnalyzeTaskBody>
  if (typeof body.analysis_id !== 'string' || body.analysis_id.trim().length === 0) {
    throw new Error('analysis_id is required')
  }
  if (!ANALYSIS_ID_PATTERN.test(body.analysis_id)) {
    throw new Error('analysis_id format is invalid')
  }

  return { analysis_id: body.analysis_id.trim() }
}

const getRequestId = (headerValue: string | undefined, fallback: string): string =>
  headerValue?.trim() || fallback

export const registerTaskRoutes = (app: Hono) => {
  const repo = new FirestoreRepo()
  const orchestrator = new AnalysisOrchestrator({ repo })

  app.post('/tasks/analysis', async (c) => {
    const bodyPayload = await c.req.json().catch(() => null)
    let body: AnalyzeTaskBody
    try {
      body = parseBody(bodyPayload)
    } catch (error) {
      return c.json(
        buildError(
          ErrorCodes.INVALID_INPUT,
          error instanceof Error ? error.message : 'invalid request body'
        ),
        400
      )
    }

    const analysisId = body.analysis_id
    const lockOwner = `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const requestId = getRequestId(c.req.header('x-cloud-tasks-taskname'), lockOwner)
    let lockAcquired = false

    console.info(
      JSON.stringify({
        event: 'analysis_task_received',
        analysisId,
        requestId,
        lockOwner
      })
    )

    try {
      const lock = await repo.acquireAnalysisLock(analysisId, lockOwner)
      if (!lock.acquired) {
        return c.json(
          {
            accepted: false,
            analysis_id: analysisId,
            reason: 'already_processed_or_locked'
          },
          200
        )
      }

      lockAcquired = true
      await repo.updateAnalysisStatus(
        analysisId,
        AnalysisStatus.EXTRACTING,
        0.01,
        AnalysisStep.EXTRACT
      )
      await orchestrator.run(analysisId, { lockOwner })

      console.info(
        JSON.stringify({
          event: 'analysis_task_accepted',
          analysisId,
          requestId,
          lockOwner
        })
      )

      return c.json(
        {
          accepted: true,
          analysis_id: analysisId
        },
        202
      )
    } catch (error) {
      if (lockAcquired) {
        await repo
          .updateAnalysisStatus(analysisId, AnalysisStatus.FAILED, 1, AnalysisStep.FINALIZE, {
            code: ErrorCodes.WORKER_FAILED,
            messagePublic: 'analysis failed',
            messageInternal: error instanceof Error ? error.message : 'unknown'
          })
          .catch(() => {})
      }

      const response = toErrorResponse(error, 'analysis failed')
      console.error(
        JSON.stringify({
          event: 'analysis_task_failed',
          analysisId,
          requestId,
          lockOwner,
          status: response.status,
          code: response.payload.error.code,
          message: response.payload.error.message
        })
      )
      return c.json(response.payload, response.status)
    } finally {
      if (lockAcquired) {
        await repo.releaseAnalysisLock(analysisId, lockOwner).catch(() => {})
      }
    }
  })
}
