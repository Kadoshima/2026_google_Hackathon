export const InputType = {
  LATEX_ZIP: 'LATEX_ZIP',
  PDF: 'PDF'
} as const

export type InputType = (typeof InputType)[keyof typeof InputType]

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
