import { AnalysisStatus, AnalysisStep } from '../../domain/enums.js'
import { AnalysisOrchestrator } from '../analysis/orchestrator.js'
import { FirestoreRepo } from '../firestore.repo.js'
import { ErrorCodes } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

export type AnalysisTaskRunInput = {
  analysisId: string
  requestId: string
  lockOwner: string
}

export type AnalysisTaskRunResult =
  | {
      accepted: true
      analysisId: string
      requestId: string
      lockOwner: string
    }
  | {
      accepted: false
      reason: 'already_processed_or_locked'
      analysisId: string
      requestId: string
      lockOwner: string
    }

type AnalysisTaskRunnerDeps = {
  repo?: FirestoreRepo
  orchestrator?: AnalysisOrchestrator
}

export const runAnalysisTask = async (
  input: AnalysisTaskRunInput,
  deps: AnalysisTaskRunnerDeps = {}
): Promise<AnalysisTaskRunResult> => {
  const repo = deps.repo ?? new FirestoreRepo()
  const orchestrator = deps.orchestrator ?? new AnalysisOrchestrator({ repo })
  const { analysisId, requestId, lockOwner } = input

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
      return {
        accepted: false,
        reason: 'already_processed_or_locked',
        analysisId,
        requestId,
        lockOwner
      }
    }

    lockAcquired = true
    await repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.EXTRACTING,
      1,
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

    return {
      accepted: true,
      analysisId,
      requestId,
      lockOwner
    }
  } catch (error) {
    if (lockAcquired) {
      try {
        await repo.updateAnalysisStatus(
          analysisId,
          AnalysisStatus.FAILED,
          100,
          AnalysisStep.FINALIZE,
          {
            code: ErrorCodes.WORKER_FAILED,
            messagePublic: 'analysis failed',
            messageInternal: error instanceof Error ? error.message : 'unknown'
          }
        )
      } catch (nestedErr) {
        // CRITICAL: failing to write FAILED status means the analysis will
        // remain stuck in ANALYZING forever. Log loudly so an operator can
        // reconcile manually. We still proceed to release the lock below.
        logger.error('analysis_task_failed_status_update_error', {
          analysisId,
          requestId,
          originalError: error instanceof Error ? error.message : String(error),
          nestedError:
            nestedErr instanceof Error ? nestedErr.message : String(nestedErr)
        })
      }
    }

    throw error
  } finally {
    if (lockAcquired) {
      try {
        await repo.releaseAnalysisLock(analysisId, lockOwner)
      } catch (releaseErr) {
        logger.error('analysis_task_lock_release_failed', {
          analysisId,
          requestId,
          error:
            releaseErr instanceof Error ? releaseErr.message : String(releaseErr)
        })
      }
    }
  }
}
