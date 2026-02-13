import { Firestore } from '@google-cloud/firestore'
import type {
  Analysis,
  RetentionPolicy,
  Session,
  AnalysisError,
  AnalysisPointers,
  AnalysisMetrics,
  ConversationTurn,
  ConversationRefs
} from '../domain/types.js'
import type { Submission } from '../domain/submissions.js'
import type { InputType, AnalysisStatus, AnalysisStep } from '../domain/enums.js'

type FirestoreDocSnapshot = { exists: boolean; data(): Record<string, unknown> | undefined }

type FirestoreSetOptions = { merge?: boolean }

type FirestoreDocRef = {
  set(value: Record<string, unknown>, options?: FirestoreSetOptions): Promise<void>
  update(patch: Record<string, unknown>): Promise<void>
  get(): Promise<FirestoreDocSnapshot>
  collection(name: string): FirestoreCollectionRef
}

type FirestoreCollectionRef = {
  doc(id: string): FirestoreDocRef
}

type FirestoreLike = {
  collection(name: string): FirestoreCollectionRef
}

class MemoryFirestore implements FirestoreLike {
  private readonly docs = new Map<string, Record<string, unknown>>()

  collection(name: string): FirestoreCollectionRef {
    return new MemoryCollectionRef(this.docs, [name])
  }
}

class MemoryCollectionRef implements FirestoreCollectionRef {
  constructor(
    private readonly docs: Map<string, Record<string, unknown>>,
    private readonly path: string[]
  ) {}

  doc(id: string): FirestoreDocRef {
    return new MemoryDocRef(this.docs, [...this.path, id])
  }
}

class MemoryDocRef implements FirestoreDocRef {
  constructor(
    private readonly docs: Map<string, Record<string, unknown>>,
    private readonly path: string[]
  ) {}

  async set(value: Record<string, unknown>, options?: FirestoreSetOptions): Promise<void> {
    const key = this.key()
    if (options?.merge) {
      const current = this.docs.get(key) ?? {}
      this.docs.set(key, { ...current, ...value })
      return
    }

    this.docs.set(key, { ...value })
  }

  async update(patch: Record<string, unknown>): Promise<void> {
    const key = this.key()
    const current = this.docs.get(key)
    if (!current) {
      throw new Error(`document not found: ${key}`)
    }
    this.docs.set(key, { ...current, ...patch })
  }

  async get(): Promise<FirestoreDocSnapshot> {
    const key = this.key()
    const current = this.docs.get(key)
    return {
      exists: Boolean(current),
      data: () => current
    }
  }

  collection(name: string): FirestoreCollectionRef {
    return new MemoryCollectionRef(this.docs, [...this.path, name])
  }

  private key(): string {
    return this.path.join('/')
  }
}

const isProduction = process.env.NODE_ENV === 'production'
const databaseId = process.env.FIRESTORE_DB
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
const projectId =
  process.env.GCP_PROJECT_ID?.trim() ||
  (emulatorHost ? 'local-emulator' : '')

const shouldUseMemory =
  process.env.FIRESTORE_MODE === 'memory' ||
  (!projectId && !emulatorHost && !isProduction)

export const firestore: FirestoreLike = shouldUseMemory
  ? (() => {
      console.warn(
        JSON.stringify({
          event: 'firestore_mode_memory',
          reason: 'GCP_PROJECT_ID not set (and no emulator); using in-memory Firestore stub'
        })
      )
      return new MemoryFirestore()
    })()
  : (() => {
      if (!projectId) {
        throw new Error('GCP_PROJECT_ID is required')
      }
      return new Firestore({
        projectId,
        ...(databaseId ? { databaseId } : {})
      }) as unknown as FirestoreLike
    })()

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
  inputType: InputType
  gcsPathRaw: string
}

export type CreateAnalysisInput = {
  analysisId: string
  sessionId: string
  submissionId: string
}

export type UpdateAnalysisStatusInput = {
  analysisId: string
  status?: AnalysisStatus
  progress?: number
  step?: AnalysisStep
  error?: AnalysisError
}

export type SetPointersInput = {
  analysisId: string
  gcsExtractJson?: string
  gcsAnalysisJson?: string
  gcsReportHtml?: string
}

export type SetMetricsInput = {
  analysisId: string
  noEvidenceClaimsCount?: number
  weakEvidenceClaimsCount?: number
  specificityLackCount?: number
}

export type SaveConversationTurnInput = {
  analysisId: string
  turnId: string
  role: ConversationTurn['role']
  type: ConversationTurn['type']
  content: string
  refs?: ConversationRefs
}

export type GetAnalysisInput = {
  analysisId: string
}

export type GetSessionInput = {
  sessionId: string
}

export const createSession = async (
  input: CreateSessionInput
): Promise<Session> => {
  const now = new Date().toISOString()

  const session: Session = {
    sessionId: input.sessionId,
    clientTokenHash: input.clientTokenHash,
    retentionPolicy: input.retentionPolicy,
    ...(input.language ? { language: input.language } : {}),
    ...(input.domainTag ? { domainTag: input.domainTag } : {}),
    createdAt: now,
    updatedAt: now
  }

  await firestore.collection('sessions').doc(input.sessionId).set(session)
  return session
}

export const createSubmission = async (
  input: CreateSubmissionInput
): Promise<Submission> => {
  const now = new Date().toISOString()

  const submission: Submission = {
    submissionId: input.submissionId,
    sessionId: input.sessionId,
    inputType: input.inputType,
    gcsPathRaw: input.gcsPathRaw,
    createdAt: now,
    status: 'UPLOADED'
  }

  await firestore.collection('submissions').doc(input.submissionId).set(submission)
  return submission
}

export const createAnalysis = async (
  input: CreateAnalysisInput
): Promise<Analysis> => {
  const analysis: Analysis = {
    analysisId: input.analysisId,
    sessionId: input.sessionId,
    submissionId: input.submissionId,
    status: 'QUEUED',
    progress: 0
  }

  await firestore.collection('analyses').doc(input.analysisId).set(analysis)
  return analysis
}

export const updateAnalysisStatus = async (
  input: UpdateAnalysisStatusInput
): Promise<void> => {
  const patch: Record<string, unknown> = {
    updatedAt: new Date().toISOString()
  }

  if (input.status !== undefined) patch.status = input.status
  if (input.progress !== undefined) patch.progress = input.progress
  if (input.step !== undefined) patch.step = input.step
  if (input.error !== undefined) patch.error = input.error

  await firestore.collection('analyses').doc(input.analysisId).update(patch)
}

export const setPointers = async (input: SetPointersInput): Promise<void> => {
  const analysisRef = firestore.collection('analyses').doc(input.analysisId)
  const snapshot = await analysisRef.get()

  const currentPointers: AnalysisPointers = snapshot.exists
    ? ((snapshot.data()?.pointers as AnalysisPointers | undefined) ?? {})
    : {}

  const pointers: AnalysisPointers = {
    ...currentPointers,
    ...(input.gcsExtractJson ? { gcsExtractJson: input.gcsExtractJson } : {}),
    ...(input.gcsAnalysisJson ? { gcsAnalysisJson: input.gcsAnalysisJson } : {}),
    ...(input.gcsReportHtml ? { gcsReportHtml: input.gcsReportHtml } : {})
  }

  await analysisRef.set(
    {
      pointers,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  )
}

export const setMetrics = async (input: SetMetricsInput): Promise<void> => {
  const analysisRef = firestore.collection('analyses').doc(input.analysisId)
  const snapshot = await analysisRef.get()

  const currentMetrics: AnalysisMetrics = snapshot.exists
    ? ((snapshot.data()?.metrics as AnalysisMetrics | undefined) ?? {})
    : {}

  const metrics: AnalysisMetrics = {
    ...currentMetrics,
    ...(input.noEvidenceClaimsCount !== undefined
      ? { noEvidenceClaimsCount: input.noEvidenceClaimsCount }
      : {}),
    ...(input.weakEvidenceClaimsCount !== undefined
      ? { weakEvidenceClaimsCount: input.weakEvidenceClaimsCount }
      : {}),
    ...(input.specificityLackCount !== undefined
      ? { specificityLackCount: input.specificityLackCount }
      : {})
  }

  await analysisRef.set(
    {
      metrics,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  )
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
    createdAt: new Date().toISOString()
  }

  await firestore
    .collection('analyses')
    .doc(input.analysisId)
    .collection('conversations')
    .doc(input.turnId)
    .set(turn)

  return turn
}

export const getAnalysis = async (
  input: GetAnalysisInput
): Promise<Analysis | null> => {
  const snap = await firestore.collection('analyses').doc(input.analysisId).get()

  if (!snap.exists) {
    return null
  }

  return snap.data() as Analysis
}

export const getSession = async (
  input: GetSessionInput
): Promise<Session | null> => {
  const snap = await firestore.collection('sessions').doc(input.sessionId).get()

  if (!snap.exists) {
    return null
  }

  return snap.data() as Session
}
