export declare const InputType: {
    readonly LATEX_ZIP: "LATEX_ZIP";
    readonly PDF: "PDF";
};
export type InputType = (typeof InputType)[keyof typeof InputType];
export declare const AnalysisStatus: {
    readonly QUEUED: "QUEUED";
    readonly EXTRACTING: "EXTRACTING";
    readonly ANALYZING: "ANALYZING";
    readonly READY: "READY";
    readonly FAILED: "FAILED";
};
export type AnalysisStatus = (typeof AnalysisStatus)[keyof typeof AnalysisStatus];
export declare const RetentionMode: {
    readonly NO_SAVE: "NO_SAVE";
    readonly SAVE: "SAVE";
};
export type RetentionMode = (typeof RetentionMode)[keyof typeof RetentionMode];
export declare const AnalysisStep: {
    readonly EXTRACT: "extract";
    readonly LOGIC: "logic";
    readonly EVIDENCE: "evidence";
    readonly PRIOR_ART: "prior_art";
    readonly FINALIZE: "finalize";
};
export type AnalysisStep = (typeof AnalysisStep)[keyof typeof AnalysisStep];
//# sourceMappingURL=enums.d.ts.map