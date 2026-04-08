/**
 * Retention cleanup CLI.
 *
 * Sweeps Firestore for sessions whose retention policy has expired and
 * deletes them along with all owned GCS objects. Intended to be run by
 * Cloud Scheduler via a Cloud Run job (see infra/cloudscheduler/).
 *
 * Usage:
 *   node dist/scripts/cleanup-expired.js            # real run
 *   node dist/scripts/cleanup-expired.js --dry-run  # report only, no writes
 *
 * Environment:
 *   GCP_PROJECT_ID, BUCKET_NAME, FIRESTORE_DB (optional)
 *   CLEANUP_NO_SAVE_DEFAULT_TTL_HOURS  (default: 24)
 *   CLEANUP_BATCH_SIZE                 (default: 500)
 */

import 'dotenv/config'
import {
  deleteSessionCascade,
  findExpiredSessions
} from '../services/firestore.repo.js'
import {
  deleteObject,
  deletePrefix
} from '../services/storage.service.js'
import { logger } from '../utils/logger.js'

const parseFlag = (name: string): boolean => process.argv.includes(name)

const main = async () => {
  const dryRun = parseFlag('--dry-run')
  const batchSize = Number(process.env.CLEANUP_BATCH_SIZE ?? 500)
  const defaultNoSaveHours = Number(
    process.env.CLEANUP_NO_SAVE_DEFAULT_TTL_HOURS ?? 24
  )

  const cleanupLogger = logger.child({
    job: 'cleanup-expired',
    dryRun,
    batchSize,
    defaultNoSaveHours
  })

  cleanupLogger.info('cleanup_started')

  const expired = await findExpiredSessions({
    defaultNoSaveTtlHours: defaultNoSaveHours,
    limit: batchSize
  })

  cleanupLogger.info('cleanup_candidates', { count: expired.length })

  let deletedSessions = 0
  let deletedObjects = 0
  let errors = 0

  for (const entry of expired) {
    const entryLogger = cleanupLogger.child({ sessionId: entry.sessionId })
    try {
      if (dryRun) {
        entryLogger.info('cleanup_would_delete', { policy: entry.policy })
        continue
      }

      const summary = await deleteSessionCascade(entry.sessionId)

      // Remove GCS objects captured in Firestore pointers.
      for (const ref of summary.gcsObjects) {
        try {
          await deleteObject(ref.gsPath)
          deletedObjects += 1
        } catch (err) {
          entryLogger.warn('cleanup_object_delete_failed', {
            gsPath: ref.gsPath,
            error: err
          })
        }
      }

      // Also sweep the raw/<sessionId>/ prefix in case anything is orphaned.
      try {
        const prefixDeleted = await deletePrefix(`raw/${entry.sessionId}/`)
        deletedObjects += prefixDeleted
      } catch (err) {
        entryLogger.warn('cleanup_prefix_delete_failed', { error: err })
      }

      deletedSessions += 1
      entryLogger.info('cleanup_session_deleted', {
        submissionCount: summary.submissionCount,
        analysisCount: summary.analysisCount,
        conversationTurnCount: summary.conversationTurnCount,
        gcsObjects: summary.gcsObjects.length
      })
    } catch (err) {
      errors += 1
      entryLogger.error('cleanup_session_failed', { error: err })
    }
  }

  cleanupLogger.info('cleanup_finished', {
    candidates: expired.length,
    deletedSessions,
    deletedObjects,
    errors
  })

  if (errors > 0 && !dryRun) {
    process.exit(1)
  }
}

main().catch((err) => {
  logger.critical('cleanup_fatal', { error: err })
  process.exit(1)
})
