import type { ArtifactType, InputType } from './enums.js'

export type SubmissionStatus = 'UPLOADED' | 'DELETED'

export type Submission = {
  submissionId: string
  sessionId: string
  artifactType?: ArtifactType
  inputType: InputType
  gcsPathRaw: string
  createdAt: Date | string
  status: SubmissionStatus
}
