export type RetentionMode = 'NO_SAVE' | 'SAVE'
export type ArtifactType = 'PAPER' | 'PR' | 'DOC' | 'SHEET'

export type RetentionPolicy = {
  mode: RetentionMode
  ttlHours?: number
}

export type ApiError = {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export type UploadMetadata = {
  artifactType?: ArtifactType
  language?: string
  domainTag?: string
  retentionPolicy?: RetentionPolicy
}

export type UploadResponse = {
  session_id: string
  submission_id: string
  upload_id: string
}

export type ArtifactContentFormat = 'plain' | 'markdown' | 'diff' | 'json'

export type ArtifactCreateRequest = {
  artifact_type: ArtifactType
  content: string
  title?: string
  content_format?: ArtifactContentFormat
  source_ref?: string
  language?: string
  domainTag?: string
  retentionPolicy?: RetentionPolicy
}

export type ArtifactAdapterStatus = 'ready' | 'beta' | 'planned'

export type CapabilitiesResponse = {
  concept: 'comprehension_assurance'
  explain_to_ship: true
  artifact_adapters: Array<{
    artifact_type: ArtifactType
    status: ArtifactAdapterStatus
    supported_inputs: string[]
    key_checks: string[]
  }>
}

export type AnalyzeRequest = {
  session_id: string
  submission_id: string
}

export type AnalyzeResponse = {
  analysis_id: string
}

export type AnalysisStatus = 'QUEUED' | 'EXTRACTING' | 'ANALYZING' | 'READY' | 'FAILED'

export type AnalysisProgressResponse = {
  analysis_id: string
  status: AnalysisStatus
  progress: number
  step?: string
  message?: string
}

export type AnalysisSummary = {
  top3_risks?: Array<{
    title: string
    refs?: {
      claim_ids?: string[]
      paragraph_ids?: string[]
      figure_ids?: string[]
      citation_keys?: string[]
    }
  }>
  top_risks?: Array<{
    title: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    reason: string
    refs?: {
      claim_ids?: string[]
      paragraph_ids?: string[]
      figure_ids?: string[]
      citation_keys?: string[]
    }
  }>
  claim_evidence?: Array<{
    claim_id: string
    claim_text: string
    paragraph_ids: string[]
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    reason: string
  }>
  logic_risks?: Array<{
    claim_id: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    reason: string
  }>
  preflight_summary?: {
    error_count: number
    warning_count: number
  }
  agents?: Array<{
    agent_id: string
    role:
      | 'PLANNER'
      | 'EXTRACTOR'
      | 'CLAIM_MINER'
      | 'PREFLIGHT_GUARDIAN'
      | 'EVIDENCE_AUDITOR'
      | 'LOGIC_SENTINEL'
      | 'PRIOR_ART_COACH'
      | 'SYNTHESIZER'
    status: 'DONE' | 'WARN' | 'SKIPPED'
    duration_ms: number
    summary: string
    highlights?: string[]
  }>
  metrics?: {
    no_evidence_claims?: number
    weak_evidence_claims?: number
    specificity_lack?: number
  }
}

export type AnalysisPointers = {
  analysis_json_signed_url?: string
  report_html_signed_url?: string
  extract_json_signed_url?: string
}

export type AnalysisReadyResponse = AnalysisProgressResponse & {
  summary?: AnalysisSummary
  pointers?: AnalysisPointers
}

export type AnalysisResponse = AnalysisProgressResponse | AnalysisReadyResponse

export type OralAskRequest = {
  analysis_id: string
  turn_id: string
  user_answer?: string
  context?: {
    focus_claim_id?: string
  }
}

export type OralAskResponse = {
  question: string
  follow_up: boolean
  evaluation?: {
    pass: boolean
    reason: string
  }
  draft_sentences?: string[]
  todo_candidate?: {
    title: string
    impact: number
    effort: number
  }
}

export type PatchGenerateRequest = {
  analysis_id: string
  accepted_todos: string[]
  format?: 'UNIFIED_DIFF'
}

export type PatchGenerateResponse = {
  diff_signed_url: string
  patch_summary?: {
    files: number
    hunks: number
  }
}

export type ReportGenerateResponse = {
  report_id: string
}

export type ReportGetResponse = {
  report_html_signed_url: string
}

export type HealthResponse = 'ok'
