import type { AnalysisStatus, AnalysisStep, InputType, RetentionMode } from './enums.js';
export type RetentionPolicy = {
    mode: RetentionMode;
    ttlHours?: number;
};
export type Session = {
    sessionId: string;
    clientTokenHash: string;
    retentionPolicy: RetentionPolicy;
    language?: string;
    domainTag?: string;
    createdAt: Date | string;
    updatedAt: Date | string;
};
export type AnalysisError = {
    code: string;
    messagePublic: string;
    messageInternal?: string;
};
export type AnalysisPointers = {
    gcsExtractJson?: string;
    gcsAnalysisJson?: string;
    gcsReportHtml?: string;
};
export type AnalysisMetrics = {
    noEvidenceClaimsCount?: number;
    weakEvidenceClaimsCount?: number;
    specificityLackCount?: number;
};
export type Analysis = {
    analysisId: string;
    sessionId: string;
    submissionId: string;
    status: AnalysisStatus;
    progress: number;
    step?: AnalysisStep;
    error?: AnalysisError;
    pointers?: AnalysisPointers;
    metrics?: AnalysisMetrics;
    updatedAt?: Date | string;
};
export type ConversationRefs = {
    paragraphIds?: string[];
    claimIds?: string[];
    figureIds?: string[];
    citationKeys?: string[];
};
export type ConversationTurn = {
    turnId: string;
    role: 'AI' | 'USER';
    type: 'QUESTION' | 'ANSWER' | 'EVAL' | 'DRAFT';
    content: string;
    refs?: ConversationRefs;
    createdAt: Date | string;
};
export type ExtractSection = {
    id: string;
    title: string;
    level: number;
};
export type ExtractParagraph = {
    id: string;
    sectionId: string | null;
    text: string;
};
export type ExtractFigure = {
    id: string;
    label?: string;
    caption?: string;
    mentionedInParagraphIds: string[];
};
export type ExtractBibEntry = {
    key: string;
    raw?: string;
};
export type ExtractInTextCite = {
    paragraphId: string;
    keys: string[];
};
export type ExtractCitations = {
    bibEntries: ExtractBibEntry[];
    inTextCites: ExtractInTextCite[];
};
export type ExtractMeta = {
    extractor: string;
    warnings?: string[];
    createdAt: string;
};
export type ExtractJson = {
    schemaVersion: 'v1';
    analysisId: string;
    inputType: InputType;
    sections: ExtractSection[];
    paragraphs: ExtractParagraph[];
    figures: ExtractFigure[];
    citations: ExtractCitations;
    meta?: ExtractMeta;
};
export type PreflightFindingKind = 'MISSING_FIGURE_REFERENCE' | 'UNKNOWN_FIGURE_REFERENCE' | 'MISSING_BIB_ENTRY' | 'UNCITED_BIB_ENTRY';
export type PreflightFinding = {
    id: string;
    kind: PreflightFindingKind;
    severity: 'error' | 'warning';
    message: string;
    refs?: ConversationRefs;
};
export type PreflightResult = {
    findings: PreflightFinding[];
    summary: {
        errorCount: number;
        warningCount: number;
    };
};
export type AnalysisResultJson = {
    schemaVersion: 'v1';
    analysisId: string;
    preflight: PreflightResult;
    generatedAt: string;
    extractPath?: string;
    warnings?: string[];
};
//# sourceMappingURL=types.d.ts.map