import type { InputType } from './enums.js'

export type SubmissionStatus = 'UPLOADED' | 'DELETED'

export type Submission = {
  submissionId: string
  sessionId: string
  inputType: InputType
  gcsPathRaw: string
  createdAt: Date | string
  status: SubmissionStatus
}
