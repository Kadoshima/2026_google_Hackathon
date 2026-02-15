export const InputType = {
  LATEX_ZIP: 'LATEX_ZIP',
  PDF: 'PDF',
  PR_TEXT: 'PR_TEXT',
  DOC_TEXT: 'DOC_TEXT',
  SHEET_TEXT: 'SHEET_TEXT'
} as const

export type InputType = (typeof InputType)[keyof typeof InputType]

export const ArtifactType = {
  PAPER: 'PAPER',
  PR: 'PR',
  DOC: 'DOC',
  SHEET: 'SHEET'
} as const

export type ArtifactType = (typeof ArtifactType)[keyof typeof ArtifactType]

export const AnalysisStatus = {
  QUEUED: 'QUEUED',
  EXTRACTING: 'EXTRACTING',
  ANALYZING: 'ANALYZING',
  READY: 'READY',
  FAILED: 'FAILED'
} as const

export type AnalysisStatus = (typeof AnalysisStatus)[keyof typeof AnalysisStatus]

export const RetentionMode = {
  NO_SAVE: 'NO_SAVE',
  SAVE: 'SAVE'
} as const

export type RetentionMode = (typeof RetentionMode)[keyof typeof RetentionMode]

export const AnalysisStep = {
  EXTRACT: 'extract',
  LOGIC: 'logic',
  EVIDENCE: 'evidence',
  PRIOR_ART: 'prior_art',
  FINALIZE: 'finalize'
} as const

export type AnalysisStep = (typeof AnalysisStep)[keyof typeof AnalysisStep]
