import { Firestore } from '@google-cloud/firestore'
import type { Analysis, RetentionPolicy, Session } from '../domain/types.js'
import type { Submission } from '../domain/submissions.js'
import type { InputType } from '../domain/enums.js'

const projectId = process.env.GCP_PROJECT_ID
const databaseId = process.env.FIRESTORE_DB

if (!projectId) {
  throw new Error('GCP_PROJECT_ID is required')
}

export const firestore = new Firestore({
  projectId,
  ...(databaseId ? { databaseId } : {})
})

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