// API Type Definitions
// フロントエンド要件定義書に基づく型定義

// ====================
// Upload
// ====================
export interface UploadRequest {
  file: File;
  metadata: UploadMetadata;
}

export interface UploadMetadata {
  title?: string;
  authors?: string[];
  language: 'ja' | 'en';
  field?: string;
  save_enabled: boolean;
}

export interface UploadResponse {
  session_id: string;
  submission_id: string;
  upload_id: string;
}

// ====================
// Analyze
// ====================
export interface AnalyzeRequest {
  session_id: string;
  submission_id: string;
  options?: AnalyzeOptions;
}

export interface AnalyzeOptions {
  checks: ('evidence' | 'logic' | 'preflight')[];
  strictness: 'gentle' | 'standard' | 'strict';
}

export interface AnalysisStatus {
  analysis_id: string;
  status: AnalysisState;
  progress?: number;
  message?: string;
  error?: string;
}

export type AnalysisState = 
  | 'UPLOADED' 
  | 'EXTRACTING' 
  | 'ANALYZING' 
  | 'READY' 
  | 'FAILED';

// ====================
// Analysis Results
// ====================
export interface AnalysisResult {
  analysis_id: string;
  session_id: string;
  summary: ResultSummary;
  evidence_audit: EvidenceAuditResult;
  logic_sentinel: LogicSentinelResult;
  preflight: PreflightResult;
  created_at: string;
}

export interface ResultSummary {
  top_risks: RiskItem[];
  metrics: Metrics;
}

export interface RiskItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'evidence' | 'logic' | 'preflight';
  title: string;
  description: string;
  location?: Location;
}

export interface Location {
  page?: number;
  paragraph?: number;
  line?: number;
  snippet?: string;
}

export interface Metrics {
  claims_without_evidence: number;
  vague_claims: number;
  missing_references: number;
  total_claims: number;
}

// Evidence Auditor
export interface EvidenceAuditResult {
  claims: ClaimEvidence[];
  overall_strength: 'strong' | 'moderate' | 'weak';
}

export interface ClaimEvidence {
  claim_id: string;
  claim_text: string;
  location: Location;
  evidence: Evidence[];
  strength: 'strong' | 'moderate' | 'weak' | 'none';
}

export interface Evidence {
  type: 'citation' | 'figure' | 'table' | 'calculation' | 'experiment';
  ref_id?: string;
  snippet?: string;
  location?: Location;
}

// Logic Sentinel
export interface LogicSentinelResult {
  vague_points: VaguePoint[];
  overall_score: number;
}

export interface VaguePoint {
  id: string;
  type: 'no_number' | 'no_comparison' | 'no_condition' | 'adjective_only';
  text: string;
  location: Location;
  suggestion?: string;
}

// Preflight
export interface PreflightResult {
  citation_issues: CitationIssue[];
  figure_issues: FigureIssue[];
  structure_issues: StructureIssue[];
  length_check: LengthCheck;
}

export interface CitationIssue {
  citation_id: string;
  status: 'missing_ref' | 'unreferenced' | 'ok';
  location?: Location;
}

export interface FigureIssue {
  figure_id: string;
  status: 'missing_ref' | 'unreferenced' | 'ok';
  location?: Location;
}

export interface StructureIssue {
  type: 'missing_section' | 'short_section' | 'order_issue';
  section: string;
  message: string;
}

export interface LengthCheck {
  word_count: number;
  page_count: number;
  warnings: string[];
}

// ====================
// Oral Defense (Chat)
// ====================
export interface OralAskRequest {
  session_id: string;
  context: OralContext;
  user_answer: string;
}

export interface OralContext {
  weak_points: string[];
  current_claim?: string;
}

export interface OralAskResponse {
  question: string;
  follow_up: boolean;
  draft_sentences: string[];
  todo_suggestion?: TodoSuggestion;
  severity?: 'critical' | 'warning' | 'info';
  linked_claim_id?: string;
}

export interface TodoSuggestion {
  title: string;
  impact: number; // 1-5
  effort: number; // 1-5
}

// Chat Message
export interface ChatMessage {
  id: string;
  type: 'ai_question' | 'user_answer' | 'ai_evaluation' | 'draft';
  content: string;
  timestamp: string;
  metadata?: {
    severity?: 'critical' | 'warning' | 'info';
    linked_claim_id?: string;
    draft_sentences?: string[];
    accepted?: boolean;
  };
}

// ====================
// Todo & Patch
// ====================
export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  impact: number; // 1-5
  effort: number; // 1-5
  status: 'pending' | 'accepted' | 'rejected' | 'done';
  source: 'evidence' | 'logic' | 'oral' | 'preflight';
  linked_claim_id?: string;
  suggested_diff?: string;
}

export interface PatchGenerateRequest {
  session_id: string;
  accepted_todos: string[];
  target_format: 'latex' | 'docx' | 'markdown';
}

export interface PatchGenerateResponse {
  diff: string;
  patched_content?: string;
}

// ====================
// Report
// ====================
export interface Report {
  report_id: string;
  session_id: string;
  title: string;
  created_at: string;
  format: 'pdf' | 'html';
  download_url?: string;
}

// ====================
// Session
// ====================
export interface Session {
  session_id: string;
  client_token: string;
  title?: string;
  status: 'active' | 'analyzing' | 'completed' | 'error';
  created_at: string;
  updated_at: string;
  submission?: SubmissionInfo;
  settings: SessionSettings;
}

export interface SubmissionInfo {
  submission_id: string;
  upload_id: string;
  filename: string;
  file_type: 'zip' | 'pdf';
}

export interface SessionSettings {
  save_enabled: boolean;
  retention_days: number;
  language: 'ja' | 'en';
}

// ====================
// User Settings
// ====================
export interface UserSettings {
  save_enabled: boolean;
  retention_days: number;
  default_language: 'ja' | 'en';
  default_field?: string;
  privacy_accepted: boolean;
}

// ====================
// Error Response
// ====================
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
