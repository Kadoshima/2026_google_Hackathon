import { FieldValue, Firestore } from '@google-cloud/firestore'
import { AnalysisStatus, ArtifactType } from '../domain/enums.js'
import type { InputType, AnalysisStep } from '../domain/enums.js'
import type {
  Analysis,
  AnalysisError,
  AnalysisMetrics,
  AnalysisPointers,
  AgentTraceEntry,
  ConversationTurn,
  ConversationRefs,
  RetentionPolicy,
  Session
} from '../domain/types.js'
import type { Submission } from '../domain/submissions.js'
import { AppError, ErrorCodes } from '../utils/errors.js'

const projectId = process.env.GCP_PROJECT_ID
const databaseId = process.env.FIRESTORE_DB

if (!projectId) {
  throw new Error('GCP_PROJECT_ID is required')
}

export const firestore = new Firestore({
  projectId,
  ...(databaseId ? { databaseId } : {})
})

const nowIso = (): string => new Date().toISOString()

const toStoredDate = (value?: Date | string): string => {
  if (!value) {
    return nowIso()
  }

  return value instanceof Date ? value.toISOString() : value
}

const parseIsoMillis = (value: string | undefined): number | null => {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

const toMillisOrZero = (value: Date | string | undefined): number => {
  if (!value) return 0
  const parsed = Date.parse(String(value))
  return Number.isNaN(parsed) ? 0 : parsed
}

type LockReason = 'already_finished' | 'locked'

export type LockResult = {
  acquired: boolean
  reason?: LockReason
}

const DEFAULT_LOCK_TTL_SEC = 300

type AnalysisLockFields = {
  lockOwner?: string
  lockExpiresAt?: string
  lockHeartbeatAt?: string
}

type StoredAnalysis = Analysis & AnalysisLockFields

const toPublicAnalysis = (analysis: StoredAnalysis): Analysis => {
  const { lockOwner: _lockOwner, lockExpiresAt: _lockExpiresAt, lockHeartbeatAt: _lockHeartbeatAt, ...rest } =
    analysis
  return rest
}

const isGrpcNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  return 'code' in error && (error as { code?: unknown }).code === 5
}

type CreateSessionRecordInput = Omit<Session, 'createdAt' | 'updatedAt'> &
  Partial<Pick<Session, 'createdAt' | 'updatedAt'>>

type CreateSubmissionRecordInput = Omit<Submission, 'createdAt' | 'status'> &
  Partial<Pick<Submission, 'createdAt' | 'status'>>

type CreateAnalysisRecordInput = Pick<Analysis, 'analysisId' | 'sessionId' | 'submissionId'> &
  Partial<
    Pick<
      Analysis,
      'status' | 'progress' | 'step' | 'error' | 'pointers' | 'metrics' | 'agentTrace' | 'updatedAt'
    >
  >

export class FirestoreRepo {
  private readonly client: Firestore

  constructor(client: Firestore = firestore) {
    this.client = client
  }

  async createSession(input: CreateSessionRecordInput): Promise<Session> {
    const createdAt = toStoredDate(input.createdAt)
    const updatedAt = toStoredDate(input.updatedAt ?? createdAt)

    const session: Session = {
      sessionId: input.sessionId,
      clientTokenHash: input.clientTokenHash,
      retentionPolicy: input.retentionPolicy,
      ...(input.language ? { language: input.language } : {}),
      ...(input.domainTag ? { domainTag: input.domainTag } : {}),
      createdAt,
      updatedAt
    }

    await this.client.collection('sessions').doc(session.sessionId).set(session)
    return session
  }

  async createSubmission(input: CreateSubmissionRecordInput): Promise<Submission> {
    const submission: Submission = {
      submissionId: input.submissionId,
      sessionId: input.sessionId,
      artifactType: input.artifactType ?? ArtifactType.PAPER,
      inputType: input.inputType,
      gcsPathRaw: input.gcsPathRaw,
      createdAt: toStoredDate(input.createdAt),
      status: input.status ?? 'UPLOADED'
    }

    await this.client.collection('submissions').doc(submission.submissionId).set(submission)
    return submission
  }

  async createAnalysis(input: CreateAnalysisRecordInput): Promise<Analysis> {
    const analysis: StoredAnalysis = {
      analysisId: input.analysisId,
      sessionId: input.sessionId,
      submissionId: input.submissionId,
      status: input.status ?? AnalysisStatus.QUEUED,
      progress: input.progress ?? 0,
      updatedAt: toStoredDate(input.updatedAt)
    }

    if (input.step) {
      analysis.step = input.step
    }
    if (input.error) {
      analysis.error = input.error
    }
    if (input.pointers) {
      analysis.pointers = input.pointers
    }
    if (input.metrics) {
      analysis.metrics = input.metrics
    }
    if (input.agentTrace) {
      analysis.agentTrace = input.agentTrace
    }

    await this.client.collection('analyses').doc(analysis.analysisId).set(analysis)
    return toPublicAnalysis(analysis)
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const snap = await this.client.collection('sessions').doc(sessionId).get()
    if (!snap.exists) return null
    return snap.data() as Session
  }

  async getSubmission(submissionId: string): Promise<Submission | null> {
    const snap = await this.client.collection('submissions').doc(submissionId).get()
    if (!snap.exists) return null
    return snap.data() as Submission
  }

  async getAnalysis(analysisId: string): Promise<Analysis | null> {
    const snap = await this.client.collection('analyses').doc(analysisId).get()
    if (!snap.exists) return null
    return toPublicAnalysis(snap.data() as StoredAnalysis)
  }

  async getLatestSubmissionBySession(sessionId: string): Promise<Submission | null> {
    const snap = await this.client
      .collection('submissions')
      .where('sessionId', '==', sessionId)
      .get()

    if (snap.empty) return null

    const submissions = snap.docs.map((doc) => doc.data() as Submission)
    submissions.sort((left, right) => toMillisOrZero(right.createdAt) - toMillisOrZero(left.createdAt))

    return submissions[0] ?? null
  }

  async getLatestAnalysisBySession(sessionId: string): Promise<Analysis | null> {
    const snap = await this.client
      .collection('analyses')
      .where('sessionId', '==', sessionId)
      .get()

    if (snap.empty) return null

    const analyses = snap.docs.map((doc) => toPublicAnalysis(doc.data() as StoredAnalysis))
    analyses.sort(
      (left, right) => toMillisOrZero(right.updatedAt) - toMillisOrZero(left.updatedAt)
    )

    return analyses[0] ?? null
  }

  async updateAnalysisStatus(
    analysisId: string,
    status: Analysis['status'],
    progress: number,
    step?: Analysis['step'],
    error?: AnalysisError
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      progress,
      updatedAt: nowIso()
    }

    if (step) {
      patch.step = step
    }

    if (error) {
      patch.error = error
    } else {
      patch.error = FieldValue.delete()
    }

    try {
      await this.client.collection('analyses').doc(analysisId).update(patch)
    } catch (err) {
      if (isGrpcNotFound(err)) {
        throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
      }
      throw err
    }
  }

  async setPointers(analysisId: string, patch: AnalysisPointers): Promise<void> {
    const analysisRef = this.client.collection('analyses').doc(analysisId)
    const snapshot = await analysisRef.get()
    if (!snapshot.exists) {
      throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
    }

    const currentPointers: AnalysisPointers =
      ((snapshot.data()?.pointers as AnalysisPointers | undefined) ?? {})

    const pointers: AnalysisPointers = {
      ...currentPointers,
      ...patch
    }

    await analysisRef.set(
      {
        pointers,
        updatedAt: nowIso()
      },
      { merge: true }
    )
  }

  async setMetrics(analysisId: string, patch: AnalysisMetrics): Promise<void> {
    const analysisRef = this.client.collection('analyses').doc(analysisId)
    const snapshot = await analysisRef.get()
    if (!snapshot.exists) {
      throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
    }

    const currentMetrics: AnalysisMetrics =
      ((snapshot.data()?.metrics as AnalysisMetrics | undefined) ?? {})

    const metrics: AnalysisMetrics = {
      ...currentMetrics,
      ...patch
    }

    await analysisRef.set(
      {
        metrics,
        updatedAt: nowIso()
      },
      { merge: true }
    )
  }

  async setAgentTrace(analysisId: string, trace: AgentTraceEntry[]): Promise<void> {
    const analysisRef = this.client.collection('analyses').doc(analysisId)
    const snapshot = await analysisRef.get()
    if (!snapshot.exists) {
      throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
    }

    await analysisRef.set(
      {
        agentTrace: trace,
        updatedAt: nowIso()
      },
      { merge: true }
    )
  }

  async saveConversationTurn(analysisId: string, turn: ConversationTurn): Promise<void> {
    const analysisSnap = await this.client.collection('analyses').doc(analysisId).get()
    if (!analysisSnap.exists) {
      throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
    }

    await this.client
      .collection('analyses')
      .doc(analysisId)
      .collection('conversations')
      .doc(turn.turnId)
      .set({
        ...turn,
        createdAt: toStoredDate(turn.createdAt)
      })
  }

  async acquireAnalysisLock(
    analysisId: string,
    lockOwner: string,
    ttlSec = DEFAULT_LOCK_TTL_SEC
  ): Promise<LockResult> {
    return this.client.runTransaction(async (tx): Promise<LockResult> => {
      const analysisRef = this.client.collection('analyses').doc(analysisId)
      const snap = await tx.get(analysisRef)
      if (!snap.exists) {
        throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
      }

      const current = snap.data() as StoredAnalysis

      if (current.status === AnalysisStatus.READY || current.status === AnalysisStatus.FAILED) {
        return { acquired: false, reason: 'already_finished' }
      }

      const now = Date.now()
      const lockExpiresAtMillis = parseIsoMillis(current.lockExpiresAt)
      const lockIsActive =
        Boolean(current.lockOwner) && lockExpiresAtMillis !== null && lockExpiresAtMillis > now

      if (lockIsActive) {
        return { acquired: false, reason: 'locked' }
      }

      tx.update(analysisRef, {
        lockOwner,
        lockHeartbeatAt: new Date(now).toISOString(),
        lockExpiresAt: new Date(now + ttlSec * 1000).toISOString(),
        updatedAt: new Date(now).toISOString()
      })

      return { acquired: true }
    })
  }

  async releaseAnalysisLock(analysisId: string, lockOwner: string): Promise<void> {
    await this.client.runTransaction(async (tx) => {
      const analysisRef = this.client.collection('analyses').doc(analysisId)
      const snap = await tx.get(analysisRef)
      if (!snap.exists) {
        return
      }

      const current = snap.data() as StoredAnalysis
      if (current.lockOwner !== lockOwner) {
        return
      }

      tx.update(analysisRef, {
        lockOwner: FieldValue.delete(),
        lockExpiresAt: FieldValue.delete(),
        lockHeartbeatAt: FieldValue.delete(),
        updatedAt: nowIso()
      })
    })
  }

  async refreshAnalysisLock(
    analysisId: string,
    lockOwner: string,
    ttlSec = DEFAULT_LOCK_TTL_SEC
  ): Promise<void> {
    await this.client.runTransaction(async (tx) => {
      const analysisRef = this.client.collection('analyses').doc(analysisId)
      const snap = await tx.get(analysisRef)
      if (!snap.exists) {
        throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
      }

      const current = snap.data() as StoredAnalysis
      if (current.lockOwner !== lockOwner) {
        throw new AppError(ErrorCodes.ALREADY_PROCESSED_OR_LOCKED, 'lock owner mismatch', 409, {
          analysisId,
          lockOwner
        })
      }

      const now = Date.now()
      tx.update(analysisRef, {
        lockHeartbeatAt: new Date(now).toISOString(),
        lockExpiresAt: new Date(now + ttlSec * 1000).toISOString(),
        updatedAt: new Date(now).toISOString()
      })
    })
  }
}

export type CreateSessionInput = {
  sessionId: string
  clientTokenHash: string
  retentionPolicy: RetentionPolicy
  language?: string
  domainTag?: string
}

export type CreateSubmissionInput = {
  submissionId: string
  sessionId: string
  artifactType?: ArtifactType
  inputType: InputType
  gcsPathRaw: string
}

export type CreateAnalysisInput = {
  analysisId: string
  sessionId: string
  submissionId: string
}

export type GetAnalysisInput = {
  analysisId: string
}

export type GetSessionInput = {
  sessionId: string
}

export type GetLatestSubmissionBySessionInput = {
  sessionId: string
}

export type GetLatestAnalysisBySessionInput = {
  sessionId: string
}

export type SetPointersInput = {
  analysisId: string
  gcsExtractJson?: string
  gcsAnalysisJson?: string
  gcsReportHtml?: string
}

export type SaveConversationTurnInput = {
  analysisId: string
  turnId: string
  role: ConversationTurn['role']
  type: ConversationTurn['type']
  content: string
  refs?: ConversationRefs
}

const defaultRepo = new FirestoreRepo()

export const createSession = async (input: CreateSessionInput): Promise<Session> => {
  const now = nowIso()
  return defaultRepo.createSession({
    ...input,
    createdAt: now,
    updatedAt: now
  })
}

export const createSubmission = async (input: CreateSubmissionInput): Promise<Submission> => {
  return defaultRepo.createSubmission({
    ...input,
    createdAt: nowIso(),
    status: 'UPLOADED'
  })
}

export const createAnalysis = async (input: CreateAnalysisInput): Promise<Analysis> => {
  return defaultRepo.createAnalysis(input)
}

export const getAnalysis = async (input: GetAnalysisInput): Promise<Analysis | null> => {
  return defaultRepo.getAnalysis(input.analysisId)
}

export const getSession = async (input: GetSessionInput): Promise<Session | null> => {
  return defaultRepo.getSession(input.sessionId)
}

export const getLatestSubmissionBySession = async (
  input: GetLatestSubmissionBySessionInput
): Promise<Submission | null> => {
  return defaultRepo.getLatestSubmissionBySession(input.sessionId)
}

export const getLatestAnalysisBySession = async (
  input: GetLatestAnalysisBySessionInput
): Promise<Analysis | null> => {
  return defaultRepo.getLatestAnalysisBySession(input.sessionId)
}

export const setPointers = async (input: SetPointersInput): Promise<void> => {
  const patch: AnalysisPointers = {
    ...(input.gcsExtractJson ? { gcsExtractJson: input.gcsExtractJson } : {}),
    ...(input.gcsAnalysisJson ? { gcsAnalysisJson: input.gcsAnalysisJson } : {}),
    ...(input.gcsReportHtml ? { gcsReportHtml: input.gcsReportHtml } : {})
  }
  await defaultRepo.setPointers(input.analysisId, patch)
}

export const saveConversationTurn = async (
  input: SaveConversationTurnInput
): Promise<ConversationTurn> => {
  const turn: ConversationTurn = {
    turnId: input.turnId,
    role: input.role,
    type: input.type,
    content: input.content,
    ...(input.refs ? { refs: input.refs } : {}),
    createdAt: nowIso()
  }

  await defaultRepo.saveConversationTurn(input.analysisId, turn)
  return turn
}
