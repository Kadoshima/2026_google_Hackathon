import { Firestore } from '@google-cloud/firestore'
import type { RetentionPolicy, Session } from '../domain/types.js'

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
