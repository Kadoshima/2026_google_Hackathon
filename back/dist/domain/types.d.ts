import type { AnalysisStatus, AnalysisStep, RetentionMode } from './enums.js';
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
//# sourceMappingURL=types.d.ts.map