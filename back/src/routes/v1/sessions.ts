import type { Hono } from 'hono'
import { ArtifactType, InputType } from '../../domain/enums.js'
import type { AnalysisResultJson } from '../../domain/types.js'
import {
  getLatestAnalysisBySession,
  getLatestSubmissionBySession,
  getSession
} from '../../services/firestore.repo.js'
import { StorageService } from '../../services/storage.service.js'
import { buildError } from '../../utils/errors.js'

type SessionStatusView = 'active' | 'analyzing' | 'completed' | 'error'

type SessionResponse = {
  session_id: string
  client_token: string
  title?: string
  analysis_id?: string
  status: SessionStatusView
  created_at: string
  updated_at: string
  submission?: {
    submission_id: string
    upload_id: string
    filename: string
    file_type: 'zip' | 'pdf' | 'artifact'
    artifact_type?: 'PAPER' | 'PR' | 'DOC' | 'SHEET'
  }
  settings: {
    save_enabled: boolean
    retention_days: number
    language: 'ja' | 'en'
  }
}

type TodoResponse = {
  items: Array<{
    id: string
    title: string
    description: string
    impact: number
    effort: number
    status: 'pending'
    source: 'preflight'
  }>
}

const storageService = new StorageService()

export const registerSessionRoutes = (app: Hono) => {
  app.get('/sessions/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId')
    if (!sessionId) {
      return c.json(buildError('INVALID_INPUT', 'sessionId is required'), 400)
    }

    try {
      const session = await getSession({ sessionId })
      if (!session) {
        return c.json(buildError('NOT_FOUND', 'session not found'), 404)
      }

      const [analysis, submission] = await Promise.all([
        getLatestAnalysisBySession({ sessionId }),
        getLatestSubmissionBySession({ sessionId })
      ])

      const settings = toSettings(session.retentionPolicy, session.language)
      const response: SessionResponse = {
        session_id: session.sessionId,
        client_token: session.clientTokenHash,
        ...(analysis ? { analysis_id: analysis.analysisId } : {}),
        ...(submission
          ? {
                submission: {
                  submission_id: submission.submissionId,
                  upload_id: `upl_${submission.submissionId}`,
                  filename: extractFilenameFromGsPath(submission.gcsPathRaw),
                  file_type:
                    (submission.artifactType ?? ArtifactType.PAPER) === ArtifactType.PAPER
                      ? submission.inputType === InputType.PDF
                        ? 'pdf'
                        : 'zip'
                      : 'artifact',
                  artifact_type: submission.artifactType ?? ArtifactType.PAPER
                },
              title: titleFromFilename(extractFilenameFromGsPath(submission.gcsPathRaw))
            }
          : {}),
        status: toSessionStatus(analysis?.status),
        created_at: toIsoString(session.createdAt),
        updated_at: toIsoString(session.updatedAt),
        settings
      }

      return c.json(response, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to fetch session', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })

  app.get('/sessions/:sessionId/todos', async (c) => {
    const sessionId = c.req.param('sessionId')
    if (!sessionId) {
      return c.json(buildError('INVALID_INPUT', 'sessionId is required'), 400)
    }

    try {
      const analysis = await getLatestAnalysisBySession({ sessionId })
      if (!analysis?.pointers?.gcsAnalysisJson) {
        const empty: TodoResponse = { items: [] }
        return c.json(empty, 200)
      }

      const result =
        await storageService.readJson<AnalysisResultJson>(analysis.pointers.gcsAnalysisJson)
      const findings = result.preflight?.findings ?? []

      const todos: TodoResponse = {
        items: findings.map((finding, index) => ({
          id: finding.id || `todo_pf_${index + 1}`,
          title: finding.kind,
          description: finding.message,
          impact: finding.severity === 'error' ? 5 : 3,
          effort: 2,
          status: 'pending',
          source: 'preflight'
        }))
      }

      return c.json(todos, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to fetch todos', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value

const toSessionStatus = (
  analysisStatus: 'QUEUED' | 'EXTRACTING' | 'ANALYZING' | 'READY' | 'FAILED' | undefined
): SessionStatusView => {
  if (!analysisStatus) return 'active'
  if (analysisStatus === 'READY') return 'completed'
  if (analysisStatus === 'FAILED') return 'error'
  return 'analyzing'
}

const toSettings = (
  retentionPolicy: { mode: 'NO_SAVE' | 'SAVE'; ttlHours?: number },
  language?: string
): SessionResponse['settings'] => {
  const saveEnabled = retentionPolicy.mode === 'SAVE'
  const retentionDays = retentionPolicy.ttlHours
    ? Math.max(1, Math.round(retentionPolicy.ttlHours / 24))
    : saveEnabled
      ? 30
      : 1

  return {
    save_enabled: saveEnabled,
    retention_days: retentionDays,
    language: language === 'en' ? 'en' : 'ja'
  }
}

const extractFilenameFromGsPath = (gsPath: string): string => {
  const objectPath = gsPath.replace(/^gs:\/\/[^/]+\//, '')
  const lastSegment = objectPath.split('/').pop() ?? ''
  if (!lastSegment) return 'uploaded-file'

  const firstUnderscore = lastSegment.indexOf('_')
  if (firstUnderscore < 0) return lastSegment
  return lastSegment.slice(firstUnderscore + 1)
}

const titleFromFilename = (filename: string): string =>
  filename.replace(/\.[^/.]+$/, '') || 'Untitled'
