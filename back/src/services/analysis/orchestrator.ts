import { AnalysisStatus, AnalysisStep, ArtifactType } from '../../domain/enums.js'
import type {
  AgentRole,
  AgentStatus,
  AgentTraceEntry,
  AnalysisResultJson,
  ExtractJson,
  PreflightResult
} from '../../domain/types.js'
import { FirestoreRepo } from '../firestore.repo.js'
import { StorageService } from '../storage.service.js'
import { LatexExtractor } from '../extract/latex.extractor.js'
import { PdfExtractor } from '../extract/pdf.extractor.js'
import type { Submission } from '../../domain/submissions.js'
import { PaperArtifactAdapter } from '../artifact/paper.adapter.js'
import { PrArtifactAdapter } from '../artifact/pr.adapter.js'
import { TextArtifactAdapter } from '../artifact/text.adapter.js'
import { runPreflight } from './preflight.js'
import { auditEvidence } from './evidenceAuditor.js'
import { inspectLogic } from './logicSentinel.js'
import { proposePriorArtQueries } from './priorArtCoach.js'
import { computeMetrics } from './scoring.js'
import { runPrompt } from '../llm/vertex.client.js'
import { buildClaimPrompt } from '../llm/prompts.js'
import { claimOutputSchema } from '../llm/jsonSchemas.js'
import { AppError, ErrorCodes } from '../../utils/errors.js'

type OrchestratorDependencies = {
  repo?: FirestoreRepo
  storage?: StorageService
  latexExtractor?: LatexExtractor
  pdfExtractor?: PdfExtractor
}

type RunOptions = {
  lockOwner?: string
}

type TopRisk = NonNullable<AnalysisResultJson['summary']>['topRisks'][number]
type AnalysisClaim = {
  claimId: string
  text: string
  paragraphIds: string[]
}
type ClaimCandidate = {
  text: string
  paragraphIds: string[]
  score: number
}
type ClaimLoopStats = {
  iterations: number
  replacements: number
  finalWeakClaims: number
}
type AgentStart = {
  startedAtMs: number
  startedAtIso: string
}

const ANALYSIS_DEBUG_LOG = (process.env.ANALYSIS_DEBUG_LOG ?? '1') !== '0'
const ANALYSIS_MIN_PARAGRAPHS_PAPER = sanitizeInt(
  process.env.ANALYSIS_MIN_PARAGRAPHS_PAPER ?? process.env.ANALYSIS_MIN_PARAGRAPHS,
  8
)
const ANALYSIS_MIN_TOTAL_CHARS_PAPER = sanitizeInt(
  process.env.ANALYSIS_MIN_TOTAL_CHARS_PAPER ?? process.env.ANALYSIS_MIN_TOTAL_CHARS,
  2500
)
const ANALYSIS_MIN_PARAGRAPHS_PR = sanitizeInt(process.env.ANALYSIS_MIN_PARAGRAPHS_PR, 6)
const ANALYSIS_MIN_TOTAL_CHARS_PR = sanitizeInt(process.env.ANALYSIS_MIN_TOTAL_CHARS_PR, 900)
const ANALYSIS_MIN_PARAGRAPHS_DOC = sanitizeInt(process.env.ANALYSIS_MIN_PARAGRAPHS_DOC, 6)
const ANALYSIS_MIN_TOTAL_CHARS_DOC = sanitizeInt(process.env.ANALYSIS_MIN_TOTAL_CHARS_DOC, 1200)
const ANALYSIS_MIN_PARAGRAPHS_SHEET = sanitizeInt(process.env.ANALYSIS_MIN_PARAGRAPHS_SHEET, 6)
const ANALYSIS_MIN_TOTAL_CHARS_SHEET = sanitizeInt(process.env.ANALYSIS_MIN_TOTAL_CHARS_SHEET, 700)
const ANALYSIS_MAX_CLAIMS = sanitizeInt(process.env.ANALYSIS_MAX_CLAIMS, 36)
const ANALYSIS_FALLBACK_MIN_CLAIMS = sanitizeInt(process.env.ANALYSIS_FALLBACK_MIN_CLAIMS, 12)
const ANALYSIS_LLM_SEGMENT_MAX_PARAGRAPHS = sanitizeInt(
  process.env.ANALYSIS_LLM_SEGMENT_MAX_PARAGRAPHS,
  120
)
const ANALYSIS_LLM_SEGMENT_OVERLAP = sanitizeInt(process.env.ANALYSIS_LLM_SEGMENT_OVERLAP, 24)
const ANALYSIS_LLM_MAX_SEGMENTS = sanitizeInt(process.env.ANALYSIS_LLM_MAX_SEGMENTS, 6)
const ANALYSIS_TOP_RISKS_MAX = sanitizeInt(process.env.ANALYSIS_TOP_RISKS_MAX, 50)
const ANALYSIS_CLAIM_REFINER_MAX_ITER = sanitizeInt(process.env.ANALYSIS_CLAIM_REFINER_MAX_ITER, 2)
const ANALYSIS_CLAIM_PROMPT_PARAGRAPH_MAX_CHARS = sanitizeInt(
  process.env.ANALYSIS_CLAIM_PROMPT_PARAGRAPH_MAX_CHARS,
  1200
)
const CLAIM_TEXT_MAX_CHARS = 280
const CLAIM_MIN_TEXT_CHARS = 12
const DEFAULT_CLAIM_MODEL = process.env.VERTEX_CLAIM_MODEL ?? process.env.VERTEX_MODEL

const logAnalysisDebug = (event: string, fields: Record<string, unknown>): void => {
  if (!ANALYSIS_DEBUG_LOG) return
  console.info(
    JSON.stringify({
      event,
      ...fields
    })
  )
}

const startAgent = (): AgentStart => {
  const startedAtMs = Date.now()
  return {
    startedAtMs,
    startedAtIso: new Date(startedAtMs).toISOString()
  }
}

const finishAgent = (input: {
  trace: AgentTraceEntry[]
  agentId: string
  role: AgentRole
  start: AgentStart
  status?: AgentStatus
  summary: string
  highlights?: string[]
}): void => {
  const endedAtMs = Date.now()
  const entry: AgentTraceEntry = {
    agentId: input.agentId,
    role: input.role,
    status: input.status ?? 'DONE',
    startedAt: input.start.startedAtIso,
    endedAt: new Date(endedAtMs).toISOString(),
    durationMs: Math.max(1, endedAtMs - input.start.startedAtMs),
    summary: input.summary,
    ...(input.highlights && input.highlights.length > 0
      ? { highlights: input.highlights.slice(0, 6) }
      : {})
  }
  input.trace.push(entry)

  logAnalysisDebug('analysis_agent_done', {
    agentId: entry.agentId,
    role: entry.role,
    status: entry.status,
    durationMs: entry.durationMs,
    summary: entry.summary
  })
}

export class AnalysisOrchestrator {
  private readonly repo: FirestoreRepo
  private readonly storage: StorageService
  private readonly paperAdapter: PaperArtifactAdapter
  private readonly prAdapter: PrArtifactAdapter
  private readonly docAdapter: TextArtifactAdapter
  private readonly sheetAdapter: TextArtifactAdapter

  constructor(dependencies: OrchestratorDependencies = {}) {
    this.repo = dependencies.repo ?? new FirestoreRepo()
    this.storage = dependencies.storage ?? new StorageService()
    this.paperAdapter = new PaperArtifactAdapter({
      ...(dependencies.latexExtractor ? { latexExtractor: dependencies.latexExtractor } : {}),
      ...(dependencies.pdfExtractor ? { pdfExtractor: dependencies.pdfExtractor } : {})
    })
    this.prAdapter = new PrArtifactAdapter()
    this.docAdapter = new TextArtifactAdapter({ artifactType: ArtifactType.DOC })
    this.sheetAdapter = new TextArtifactAdapter({ artifactType: ArtifactType.SHEET })
  }

  async run(analysisId: string, _options: RunOptions = {}): Promise<AnalysisResultJson> {
    const agentTrace: AgentTraceEntry[] = []
    const syncAgentTrace = async () => {
      await this.repo.setAgentTrace(analysisId, agentTrace)
    }

    const analysis = await this.repo.getAnalysis(analysisId)
    if (!analysis) {
      throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
    }

    const submission = await this.repo.getSubmission(analysis.submissionId)
    if (!submission) {
      throw new AppError(ErrorCodes.SUBMISSION_NOT_FOUND, 'submission not found', 404, {
        analysisId,
        submissionId: analysis.submissionId
      })
    }
    const session = await this.repo.getSession(analysis.sessionId)
    const artifactType = resolveArtifactType(submission.artifactType)
    await syncAgentTrace()
    const plannerStart = startAgent()
    const thresholds = resolveExtractQualityThreshold(artifactType)
    finishAgent({
      trace: agentTrace,
      agentId: 'planner',
      role: 'PLANNER',
      summary: `artifact=${artifactType}, inputType=${submission.inputType}, thresholds=${thresholds.minParagraphs}/${thresholds.minTotalChars}`,
      highlights: [
        `session=${analysis.sessionId}`,
        `submission=${analysis.submissionId}`,
        `analysis=${analysisId}`
      ],
      start: plannerStart
    })
    await syncAgentTrace()

    logAnalysisDebug('analysis_pipeline_start', {
      analysisId,
      sessionId: analysis.sessionId,
      submissionId: analysis.submissionId,
      artifactType,
      inputType: submission.inputType
    })

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.EXTRACTING,
      10,
      AnalysisStep.EXTRACT
    )

    const extractorStart = startAgent()
    const rawBuffer = await this.storage.readAsBuffer(submission.gcsPathRaw)
    logAnalysisDebug('analysis_raw_loaded', {
      analysisId,
      rawBytes: rawBuffer.length
    })
    const extract = await this.runExtractor(submission, rawBuffer, analysisId)
    this.assertExtractQuality(extract, artifactType)
    logAnalysisDebug('analysis_extract_built', {
      analysisId,
      sections: extract.sections.length,
      paragraphs: extract.paragraphs.length,
      figures: extract.figures.length,
      bibEntries: extract.citations.bibEntries.length,
      inTextCites: extract.citations.inTextCites.length,
      extractor: extract.meta?.extractor ?? 'unknown',
      extractWarnings: extract.meta?.warnings?.length ?? 0,
      extractWarningPreview: extract.meta?.warnings?.slice(0, 3) ?? []
    })
    finishAgent({
      trace: agentTrace,
      agentId: 'extractor',
      role: 'EXTRACTOR',
      start: extractorStart,
      status: (extract.meta?.warnings?.length ?? 0) > 0 ? 'WARN' : 'DONE',
      summary: `extractor=${extract.meta?.extractor ?? 'unknown'}, paragraphs=${extract.paragraphs.length}, sections=${extract.sections.length}`,
      highlights: [
        `rawBytes=${rawBuffer.length}`,
        `figures=${extract.figures.length}`,
        `citations=${extract.citations.inTextCites.length}/${extract.citations.bibEntries.length}`
      ]
    })
    await syncAgentTrace()

    const extractObjectPath = `extract/${analysisId}/extract.json`
    const extractGsPath = await this.storage.putJson(extractObjectPath, extract)
    await this.repo.setPointers(analysisId, { gcsExtractJson: extractGsPath })

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      55,
      AnalysisStep.LOGIC
    )

    const claimMinerStart = startAgent()
    const { claims, warnings: claimWarnings, loopStats } = await this.buildClaimsWithLlmFallback(extract)
    finishAgent({
      trace: agentTrace,
      agentId: 'claim_miner',
      role: 'CLAIM_MINER',
      start: claimMinerStart,
      status: claimWarnings.length > 0 ? 'WARN' : 'DONE',
      summary: `claims=${claims.length}, llmWarnings=${claimWarnings.length}, refineIter=${loopStats.iterations}`,
      highlights:
        claimWarnings.length > 0
          ? claimWarnings.slice(0, 3)
          : [
              `maxClaims=${ANALYSIS_MAX_CLAIMS}`,
              `refinedReplacements=${loopStats.replacements}`,
              `weakAfterRefine=${loopStats.finalWeakClaims}`
            ]
    })
    await syncAgentTrace()

    const preflightStart = startAgent()
    const { preflight, warnings: preflightWarnings } = this.runPreflightSafely(extract)
    finishAgent({
      trace: agentTrace,
      agentId: 'preflight_guardian',
      role: 'PREFLIGHT_GUARDIAN',
      start: preflightStart,
      status:
        preflightWarnings.length > 0 || preflight.summary.errorCount > 0 ? 'WARN' : 'DONE',
      summary: `errors=${preflight.summary.errorCount}, warnings=${preflight.summary.warningCount}`,
      ...(preflightWarnings.length > 0
        ? { highlights: preflightWarnings.slice(0, 3) }
        : {})
    })
    await syncAgentTrace()
    const warnings = [...claimWarnings, ...preflightWarnings]
    logAnalysisDebug('analysis_claims_preflight_ready', {
      analysisId,
      claims: claims.length,
      preflightErrors: preflight.summary.errorCount,
      preflightWarnings: preflight.summary.warningCount,
      pipelineWarnings: warnings.length
    })

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      68,
      AnalysisStep.EVIDENCE
    )
    const evidenceStart = startAgent()
    const evidenceResult = await auditEvidence({
      analysisId,
      claims,
      paragraphs: extract.paragraphs.map((paragraph) => ({
        paragraphId: paragraph.id,
        text: paragraph.text
      }))
    })
    logAnalysisDebug('analysis_evidence_done', {
      analysisId,
      risks: evidenceResult.risks.length,
      high: evidenceResult.risks.filter((risk) => risk.severity === 'HIGH').length,
      medium: evidenceResult.risks.filter((risk) => risk.severity === 'MEDIUM').length,
      low: evidenceResult.risks.filter((risk) => risk.severity === 'LOW').length
    })
    finishAgent({
      trace: agentTrace,
      agentId: 'evidence_auditor',
      role: 'EVIDENCE_AUDITOR',
      start: evidenceStart,
      status: evidenceResult.risks.some((risk) => risk.severity === 'HIGH') ? 'WARN' : 'DONE',
      summary: `risks=${evidenceResult.risks.length}, high=${evidenceResult.risks.filter((risk) => risk.severity === 'HIGH').length}`,
      highlights: evidenceResult.risks.slice(0, 3).map((risk) => `${risk.claimId}:${risk.severity}`)
    })
    await syncAgentTrace()

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      78,
      AnalysisStep.LOGIC
    )
    const logicStart = startAgent()
    const logicResult = await inspectLogic({ analysisId, claims })
    logAnalysisDebug('analysis_logic_done', {
      analysisId,
      risks: logicResult.risks.length,
      high: logicResult.risks.filter((risk) => risk.severity === 'HIGH').length,
      medium: logicResult.risks.filter((risk) => risk.severity === 'MEDIUM').length,
      low: logicResult.risks.filter((risk) => risk.severity === 'LOW').length
    })
    finishAgent({
      trace: agentTrace,
      agentId: 'logic_sentinel',
      role: 'LOGIC_SENTINEL',
      start: logicStart,
      status: logicResult.risks.some((risk) => risk.severity === 'HIGH') ? 'WARN' : 'DONE',
      summary: `logicRisks=${logicResult.risks.length}, high=${logicResult.risks.filter((risk) => risk.severity === 'HIGH').length}`,
      highlights: logicResult.risks.slice(0, 3).map((risk) => `${risk.claimId}:${risk.severity}`)
    })
    await syncAgentTrace()

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      86,
      AnalysisStep.PRIOR_ART
    )
    const priorArtStart = startAgent()
    const priorArtResult = await proposePriorArtQueries({
      analysisId,
      claims,
      ...(session?.domainTag ? { domainTag: session.domainTag } : {})
    })
    logAnalysisDebug('analysis_prior_art_done', {
      analysisId,
      queryCount: priorArtResult.queries.length
    })
    finishAgent({
      trace: agentTrace,
      agentId: 'prior_art_coach',
      role: 'PRIOR_ART_COACH',
      start: priorArtStart,
      status: priorArtResult.queries.length === 0 ? 'WARN' : 'DONE',
      summary: `queries=${priorArtResult.queries.length}, domainTag=${session?.domainTag ?? 'none'}`,
      highlights: priorArtResult.queries.slice(0, 3).map((item) => item.query)
    })
    await syncAgentTrace()

    const synthesizerStart = startAgent()
    const metrics = computeMetrics({
      evidenceSignals: evidenceResult.risks.map((risk) => ({
        claimId: risk.claimId,
        kind: risk.paragraphIds.length === 0 ? 'NO_EVIDENCE' : 'WEAK_EVIDENCE'
      })),
      logicSignals: logicResult.risks.map((risk) => ({
        claimId: risk.claimId,
        kind: risk.severity === 'HIGH' || risk.severity === 'MEDIUM'
          ? 'SPECIFICITY_LACK'
          : 'WEAK_EVIDENCE'
      }))
    })
    await this.repo.setMetrics(analysisId, metrics)
    logAnalysisDebug('analysis_metrics_done', {
      analysisId,
      metrics
    })

    const topRisks = this.buildTopRisks({
      claims,
      evidenceRisks: evidenceResult.risks,
      logicRisks: logicResult.risks,
      preflight
    })

    finishAgent({
      trace: agentTrace,
      agentId: 'synthesizer',
      role: 'SYNTHESIZER',
      start: synthesizerStart,
      status: warnings.length > 0 ? 'WARN' : 'DONE',
      summary: `topRisks=${topRisks.length}, warnings=${warnings.length}`,
      highlights: [
        `noEvidence=${metrics.noEvidenceClaimsCount ?? 0}`,
        `weakEvidence=${metrics.weakEvidenceClaimsCount ?? 0}`,
        `specificityLack=${metrics.specificityLackCount ?? 0}`
      ]
    })
    await syncAgentTrace()

    const result: AnalysisResultJson = {
      schemaVersion: 'v1',
      analysisId,
      claims,
      evidenceRisks: evidenceResult.risks,
      logicRisks: logicResult.risks,
      priorArtQueries: priorArtResult.queries,
      summary: { topRisks },
      metrics,
      preflight,
      generatedAt: new Date().toISOString(),
      extractPath: extractGsPath,
      agentTrace
    }
    if (warnings.length > 0) {
      result.warnings = warnings
    }

    const resultObjectPath = `analysis/${analysisId}/result.json`
    const resultGsPath = await this.storage.putJson(resultObjectPath, result)
    await this.repo.setPointers(analysisId, { gcsAnalysisJson: resultGsPath })
    logAnalysisDebug('analysis_result_saved', {
      analysisId,
      resultPath: resultGsPath,
      topRisks: topRisks.length
    })

    await this.repo.updateAnalysisStatus(analysisId, AnalysisStatus.READY, 100, AnalysisStep.FINALIZE)
    return result
  }

  private buildClaimsFromExtract(
    extract: ExtractJson,
    maxClaims = ANALYSIS_MAX_CLAIMS,
    minClaims = ANALYSIS_FALLBACK_MIN_CLAIMS
  ): Array<{ claimId: string; text: string; paragraphIds: string[] }> {
    const source = extract.paragraphs
      .filter((paragraph) => paragraph.text.trim().length >= CLAIM_MIN_TEXT_CHARS)
      .map((paragraph) => ({
        paragraphId: paragraph.id,
        text: normalizeClaimText(paragraph.text)
      }))
      .filter((item) => item.text.length >= CLAIM_MIN_TEXT_CHARS)

    const prioritized = source.filter((item) => looksLikeClaim(item.text))
    const fallback = source.filter((item) => !looksLikeClaim(item.text))
    let merged = [...prioritized, ...fallback].slice(0, maxClaims)
    if (merged.length === 0) {
      merged = extract.paragraphs
        .map((paragraph) => ({
          paragraphId: paragraph.id,
          text: normalizeClaimText(paragraph.text)
        }))
        .filter((item) => item.text.length > 0)
        .slice(0, Math.min(maxClaims, Math.max(3, minClaims)))
    }

    if (merged.length < minClaims) {
      const seen = new Set(merged.map((item) => item.paragraphId))
      for (const item of source) {
        if (seen.has(item.paragraphId)) continue
        merged.push(item)
        seen.add(item.paragraphId)
        if (merged.length >= Math.min(maxClaims, minClaims)) break
      }
    }

    return merged.map((item, index) => ({
      claimId: `claim_${index + 1}`,
      text: item.text,
      paragraphIds: [item.paragraphId]
    }))
  }

  private async buildClaimsWithLlmFallback(
    extract: ExtractJson
  ): Promise<{
    claims: AnalysisClaim[]
    warnings: string[]
    loopStats: ClaimLoopStats
  }> {
    const fallbackClaims = this.buildClaimsFromExtract(
      extract,
      ANALYSIS_MAX_CLAIMS,
      ANALYSIS_FALLBACK_MIN_CLAIMS
    )
    const paragraphIds = new Set(extract.paragraphs.map((paragraph) => paragraph.id))
    const defaultParagraphId = extract.paragraphs[0]?.id
    const warnings: string[] = []
    const segments = this.segmentClaimExtractionParagraphs(extract)
    const maxClaimsPerSegment = Math.max(
      4,
      Math.min(14, Math.ceil(ANALYSIS_MAX_CLAIMS / Math.max(1, segments.length)) + 2)
    )

    logAnalysisDebug('llm_claim_extraction_plan', {
      segments: segments.length,
      maxClaims: ANALYSIS_MAX_CLAIMS,
      maxClaimsPerSegment
    })

    const candidates: ClaimCandidate[] = []

    for (const [segmentIndex, segment] of segments.entries()) {
      try {
        const prompt = buildClaimPrompt({
          extractedText: serializeExtractSegmentForLlm(segment),
          maxClaims: maxClaimsPerSegment
        })

        logAnalysisDebug('llm_claim_extraction_request', {
          segment: segmentIndex + 1,
          segments: segments.length,
          promptChars: prompt.length,
          paragraphs: segment.length
        })

        const output = await runPrompt(prompt, claimOutputSchema, {
          ...(DEFAULT_CLAIM_MODEL ? { model: DEFAULT_CLAIM_MODEL } : {})
        })

        let accepted = 0
        for (const claim of output.claims.slice(0, maxClaimsPerSegment)) {
          const text = normalizeClaimText(claim.text).slice(0, CLAIM_TEXT_MAX_CHARS)
          if (text.length < CLAIM_MIN_TEXT_CHARS) continue

          const validParagraphIds = claim.paragraphIds.filter((id) => paragraphIds.has(id))
          const resolvedParagraphIds =
            validParagraphIds.length > 0
              ? validParagraphIds
              : [segment[0]?.id ?? fallbackClaims[0]?.paragraphIds[0] ?? defaultParagraphId]
                  .filter((id): id is string => Boolean(id))

          if (resolvedParagraphIds.length === 0) continue

          const score = scoreClaimCandidate({
            text,
            paragraphIds: resolvedParagraphIds
          })

          candidates.push({
            text,
            paragraphIds: resolvedParagraphIds,
            score
          })
          accepted += 1
        }

        logAnalysisDebug('llm_claim_extraction_segment_done', {
          segment: segmentIndex + 1,
          accepted,
          rawClaims: output.claims.length
        })
      } catch (error) {
        warnings.push(
          `claim extraction segment ${segmentIndex + 1} failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`
        )
        logAnalysisDebug('llm_claim_extraction_segment_failed', {
          segment: segmentIndex + 1,
          reason: error instanceof Error ? error.message : 'unknown'
        })
      }
    }

    const deduped: AnalysisClaim[] = dedupeClaimCandidates(candidates)
      .sort((left, right) => right.score - left.score)
      .slice(0, ANALYSIS_MAX_CLAIMS)
      .map((candidate, index) => ({
        claimId: `claim_${index + 1}`,
        text: candidate.text,
        paragraphIds: candidate.paragraphIds
      }))

    const mergedWithFallback = mergeClaimsWithFallback(
      deduped,
      fallbackClaims,
      ANALYSIS_MAX_CLAIMS,
      Math.min(ANALYSIS_FALLBACK_MIN_CLAIMS, fallbackClaims.length)
    )

    if (mergedWithFallback.length === 0) {
      console.warn(
        JSON.stringify({
          event: 'llm_claim_extraction_fallback',
          reason: 'llm produced empty claim list'
        })
      )
      return {
        claims: fallbackClaims,
        warnings: ['claim extraction via llm failed: llm produced empty claim list'],
        loopStats: {
          iterations: 0,
          replacements: 0,
          finalWeakClaims: fallbackClaims.length
        }
      }
    }

    const { claims: refinedClaims, warnings: loopWarnings, stats: loopStats } =
      this.runClaimCriticRefinerLoop({
        analysisId: extract.analysisId,
        initialClaims: mergedWithFallback,
        fallbackClaims,
        extract
      })
    warnings.push(...loopWarnings)

    logAnalysisDebug('llm_claim_extraction_success', {
      llmCandidates: deduped.length,
      mergedClaims: mergedWithFallback.length,
      refinedClaims: refinedClaims.length,
      fallbackClaims: fallbackClaims.length,
      refineIterations: loopStats.iterations,
      replacements: loopStats.replacements,
      finalWeakClaims: loopStats.finalWeakClaims
    })

    return { claims: refinedClaims, warnings, loopStats }
  }

  private runClaimCriticRefinerLoop(input: {
    analysisId: string
    initialClaims: AnalysisClaim[]
    fallbackClaims: AnalysisClaim[]
    extract: ExtractJson
  }): { claims: AnalysisClaim[]; warnings: string[]; stats: ClaimLoopStats } {
    const warnings: string[] = []
    const byParagraph = new Map(
      input.extract.paragraphs.map((paragraph) => [paragraph.id, paragraph.text] as const)
    )

    let current: AnalysisClaim[] = renumberClaims(input.initialClaims)
    let replacements = 0
    let iterations = 0

    const pool = dedupeClaimPool([
      ...input.initialClaims.map((claim) => ({
        text: claim.text,
        paragraphIds: claim.paragraphIds
      })),
      ...input.fallbackClaims.map((claim) => ({
        text: claim.text,
        paragraphIds: claim.paragraphIds
      }))
    ])

    for (let iteration = 1; iteration <= ANALYSIS_CLAIM_REFINER_MAX_ITER; iteration += 1) {
      iterations = iteration
      const critique = critiqueClaims(current, byParagraph)
      const weakClaims = critique.filter((entry) => entry.score < 2.2 || entry.issues.length >= 2)
      const duplicateMap = new Map<string, Array<{ claimId: string; score: number }>>()

      for (const entry of critique) {
        const key = normalizeClaimKey(entry.claim.text)
        const list = duplicateMap.get(key) ?? []
        list.push({ claimId: entry.claim.claimId, score: entry.score })
        duplicateMap.set(key, list)
      }

      const duplicateLosers = [...duplicateMap.values()]
        .filter((group) => group.length > 1)
        .flatMap((group) =>
          [...group]
            .sort((left, right) => right.score - left.score)
            .slice(1)
            .map((item) => item.claimId)
        )

      const replaceIds = new Set<string>([
        ...weakClaims.map((entry) => entry.claim.claimId),
        ...duplicateLosers
      ])

      logAnalysisDebug('llm_claim_critic_iteration', {
        analysisId: input.analysisId,
        iteration,
        claims: current.length,
        weakClaims: weakClaims.length,
        duplicateClaims: duplicateLosers.length
      })

      if (replaceIds.size === 0) {
        return {
          claims: current,
          warnings,
          stats: {
            iterations: iteration,
            replacements,
            finalWeakClaims: weakClaims.length
          }
        }
      }

      const kept = current.filter((claim) => !replaceIds.has(claim.claimId))
      const usedKey = new Set(kept.map((claim) => normalizeClaimKey(claim.text)))
      const replacementNeeded = Math.min(
        replaceIds.size,
        Math.max(0, ANALYSIS_MAX_CLAIMS - kept.length)
      )

      if (replacementNeeded <= 0) {
        current = renumberClaims(kept)
        continue
      }

      const rankedPool = pool
        .filter((item) => !usedKey.has(normalizeClaimKey(item.text)))
        .map((item) => ({
          ...item,
          quality: scoreClaimQuality(item, byParagraph)
        }))
        .sort((left, right) => right.quality.score - left.quality.score)

      const replacementsThisIter = rankedPool.slice(0, replacementNeeded).map((item) => ({
        claimId: '',
        text: item.text,
        paragraphIds: item.paragraphIds
      }))
      replacements += replacementsThisIter.length

      if (replacementsThisIter.length === 0) {
        warnings.push(`claim refiner iteration ${iteration}: no replacement candidates available`)
        break
      }

      current = renumberClaims([...kept, ...replacementsThisIter])

      logAnalysisDebug('llm_claim_refiner_iteration', {
        analysisId: input.analysisId,
        iteration,
        replaced: replacementsThisIter.length,
        totalClaims: current.length
      })
    }

    const finalCritique = critiqueClaims(current, byParagraph)
    const finalWeakClaims = finalCritique.filter(
      (entry) => entry.score < 2.2 || entry.issues.length >= 2
    ).length

    return {
      claims: current,
      warnings,
      stats: {
        iterations,
        replacements,
        finalWeakClaims
      }
    }
  }

  private buildTopRisks(input: {
    claims: Array<{
      claimId: string
      text: string
      paragraphIds: string[]
    }>
    evidenceRisks: Array<{
      claimId: string
      severity: 'LOW' | 'MEDIUM' | 'HIGH'
      paragraphIds: string[]
      reason: string
    }>
    logicRisks: Array<{
      claimId: string
      severity: 'LOW' | 'MEDIUM' | 'HIGH'
      reason: string
    }>
    preflight: PreflightResult
  }): TopRisk[] {
    const candidates: TopRisk[] = []
    const claimTextById = new Map(
      input.claims.map((claim) => [claim.claimId, toClaimHeadline(claim.text)] as const)
    )
    for (const risk of input.evidenceRisks) {
      const headline = claimTextById.get(risk.claimId) || risk.claimId
      candidates.push({
        severity: risk.severity,
        title: `根拠不足: ${headline}`,
        reason: risk.reason,
        refs: {
          claimIds: [risk.claimId],
          paragraphIds: risk.paragraphIds
        }
      })
    }
    for (const risk of input.logicRisks) {
      const headline = claimTextById.get(risk.claimId) || risk.claimId
      candidates.push({
        severity: risk.severity,
        title: `論理の曖昧さ: ${headline}`,
        reason: risk.reason,
        refs: {
          claimIds: [risk.claimId]
        }
      })
    }
    for (const finding of input.preflight.findings) {
      const severity: TopRisk['severity'] = finding.severity === 'error' ? 'HIGH' : 'MEDIUM'
      const title = preflightKindToJapanese(finding.kind)
      if (finding.refs) {
        candidates.push({
          severity,
          title,
          reason: finding.message,
          refs: finding.refs
        })
      } else {
        candidates.push({
          severity,
          title,
          reason: finding.message
        })
      }
    }

    const rank = (severity: 'LOW' | 'MEDIUM' | 'HIGH'): number =>
      severity === 'HIGH' ? 3 : severity === 'MEDIUM' ? 2 : 1

    return candidates
      .filter((risk) => risk.title.trim().length > 0)
      .sort((left, right) => rank(right.severity) - rank(left.severity))
      .filter((risk, index, list) => {
        const key = `${risk.severity}|${risk.title}|${risk.reason}`
        return list.findIndex((item) => `${item.severity}|${item.title}|${item.reason}` === key) === index
      })
      .slice(0, ANALYSIS_TOP_RISKS_MAX)
  }

  private async runExtractor(
    submission: Submission,
    rawBuffer: Buffer,
    analysisId: string
  ): Promise<ExtractJson> {
    const artifactType = resolveArtifactType(submission.artifactType)
    if (artifactType === ArtifactType.PAPER) {
      return this.paperAdapter.extract({
        analysisId,
        inputType: submission.inputType,
        rawBuffer
      })
    }

    if (artifactType === ArtifactType.PR) {
      return this.prAdapter.extract({
        analysisId,
        inputType: submission.inputType,
        rawBuffer
      })
    }

    if (artifactType === ArtifactType.DOC) {
      return this.docAdapter.extract({
        analysisId,
        inputType: submission.inputType,
        rawBuffer
      })
    }

    if (artifactType === ArtifactType.SHEET) {
      return this.sheetAdapter.extract({
        analysisId,
        inputType: submission.inputType,
        rawBuffer
      })
    }

    throw new AppError(ErrorCodes.INVALID_INPUT, 'unsupported artifact type', 400, {
      artifactType
    })
  }

  private runPreflightSafely(extract: ExtractJson): { preflight: PreflightResult; warnings: string[] } {
    try {
      return {
        preflight: runPreflight(extract),
        warnings: []
      }
    } catch (error) {
      const warning = `preflight failed: ${error instanceof Error ? error.message : 'unknown'}`
      return {
        preflight: {
          findings: [],
          summary: {
            errorCount: 0,
            warningCount: 0
          }
        },
        warnings: [warning]
      }
    }
  }

  private assertExtractQuality(extract: ExtractJson, artifactType: ArtifactType): void {
    const thresholds = resolveExtractQualityThreshold(artifactType)
    const paragraphCount = extract.paragraphs.length
    const totalChars = extract.paragraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0)
    const avgChars = paragraphCount > 0 ? Math.round(totalChars / paragraphCount) : 0

    if (paragraphCount >= thresholds.minParagraphs && totalChars >= thresholds.minTotalChars) {
      return
    }

    throw new AppError(
      ErrorCodes.WORKER_FAILED,
      'extracted text is too sparse for reliable analysis',
      422,
      {
        artifactType,
        paragraphCount,
        totalChars,
        avgChars,
        minParagraphs: thresholds.minParagraphs,
        minTotalChars: thresholds.minTotalChars,
        extractor: extract.meta?.extractor ?? 'unknown'
      }
    )
  }

  private segmentClaimExtractionParagraphs(extract: ExtractJson): Array<Array<{ id: string; text: string }>> {
    const candidates = extract.paragraphs
      .map((paragraph) => ({
        id: paragraph.id,
        text: paragraph.text.replace(/\s+/g, ' ').trim(),
        sectionId: paragraph.sectionId
      }))
      .filter((paragraph) => paragraph.text.length >= CLAIM_MIN_TEXT_CHARS)

    if (candidates.length === 0) return []

    const bySection = new Map<string, Array<{ id: string; text: string }>>()
    for (const paragraph of candidates) {
      const key = paragraph.sectionId ?? '__none__'
      const list = bySection.get(key) ?? []
      list.push({ id: paragraph.id, text: paragraph.text })
      bySection.set(key, list)
    }

    const sections = [...bySection.values()]
      .map((paragraphs) =>
        chunkWithOverlap(paragraphs, ANALYSIS_LLM_SEGMENT_MAX_PARAGRAPHS, ANALYSIS_LLM_SEGMENT_OVERLAP)
      )
      .flat()
      .filter((segment) => segment.length > 0)

    const fallbackSliding = chunkWithOverlap(
      candidates.map((paragraph) => ({ id: paragraph.id, text: paragraph.text })),
      ANALYSIS_LLM_SEGMENT_MAX_PARAGRAPHS,
      ANALYSIS_LLM_SEGMENT_OVERLAP
    )

    const basis = sections.length > 0 ? sections : fallbackSliding
    const limit = Math.max(1, ANALYSIS_LLM_MAX_SEGMENTS)
    if (basis.length <= limit) return basis

    const stride = Math.ceil(basis.length / limit)
    const merged: Array<Array<{ id: string; text: string }>> = []
    for (let index = 0; index < basis.length; index += stride) {
      const block = basis.slice(index, index + stride).flat()
      if (block.length === 0) continue
      merged.push(
        dedupeParagraphChunk(block).slice(0, ANALYSIS_LLM_SEGMENT_MAX_PARAGRAPHS)
      )
    }

    return merged.slice(0, limit)
  }
}

const normalizeClaimText = (text: string): string => {
  const compact = text.replace(/\s+/g, ' ').trim()
  const firstSentence = compact.split(/[。.!?]/).find((sentence) => sentence.trim().length > 0)
  const basis = (firstSentence ?? compact).trim()
  return basis.slice(0, CLAIM_TEXT_MAX_CHARS)
}

const toClaimHeadline = (text: string): string => {
  const normalized = normalizeClaimText(text)
  return normalized.length <= 64 ? normalized : `${normalized.slice(0, 61)}...`
}

const looksLikeClaim = (text: string): boolean => {
  return CLAIM_PATTERNS.some((pattern) => pattern.test(text))
}

const CLAIM_PATTERNS = [
  /\b(we show|we demonstrate|we propose|our method|results indicate|outperform|improve)\b/i,
  /\b(fix|prevent|mitigate|refactor|stabilize|rollback|retry|coverage|latency|regression)\b/i,
  /(本研究|提案|示す|改善|有効|性能|結果|達成|修正|防止|安定化|対応|再発防止|テスト追加)/i
]

const resolveExtractQualityThreshold = (
  artifactType: ArtifactType
): { minParagraphs: number; minTotalChars: number } => {
  if (artifactType === ArtifactType.PR) {
    return {
      minParagraphs: ANALYSIS_MIN_PARAGRAPHS_PR,
      minTotalChars: ANALYSIS_MIN_TOTAL_CHARS_PR
    }
  }
  if (artifactType === ArtifactType.DOC) {
    return {
      minParagraphs: ANALYSIS_MIN_PARAGRAPHS_DOC,
      minTotalChars: ANALYSIS_MIN_TOTAL_CHARS_DOC
    }
  }
  if (artifactType === ArtifactType.SHEET) {
    return {
      minParagraphs: ANALYSIS_MIN_PARAGRAPHS_SHEET,
      minTotalChars: ANALYSIS_MIN_TOTAL_CHARS_SHEET
    }
  }
  return {
    minParagraphs: ANALYSIS_MIN_PARAGRAPHS_PAPER,
    minTotalChars: ANALYSIS_MIN_TOTAL_CHARS_PAPER
  }
}

const resolveArtifactType = (value: Submission['artifactType']): ArtifactType => {
  if (value === ArtifactType.PAPER) return ArtifactType.PAPER
  if (value === ArtifactType.PR) return ArtifactType.PR
  if (value === ArtifactType.DOC) return ArtifactType.DOC
  if (value === ArtifactType.SHEET) return ArtifactType.SHEET
  return ArtifactType.PAPER
}

const preflightKindToJapanese = (kind: string): string => {
  switch (kind) {
    case 'MISSING_FIGURE_REFERENCE':
      return '図参照の欠落'
    case 'UNKNOWN_FIGURE_REFERENCE':
      return '未定義の図参照'
    case 'MISSING_BIB_ENTRY':
      return '参考文献エントリ欠落'
    case 'UNCITED_BIB_ENTRY':
      return '未引用の参考文献'
    default:
      return kind
  }
}

const serializeExtractSegmentForLlm = (segment: Array<{ id: string; text: string }>): string => {
  const lines = segment.map(
    (paragraph) =>
      `[${paragraph.id}] ${paragraph.text.replace(/\s+/g, ' ').trim().slice(0, ANALYSIS_CLAIM_PROMPT_PARAGRAPH_MAX_CHARS)}`
  )
  return lines.join('\n')
}

function sanitizeInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

const chunkWithOverlap = <T>(items: T[], size: number, overlap: number): T[][] => {
  if (items.length === 0) return []
  if (size <= 1) return items.map((item) => [item])
  const safeOverlap = Math.max(0, Math.min(overlap, size - 1))
  const step = Math.max(1, size - safeOverlap)
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += step) {
    const chunk = items.slice(index, index + size)
    if (chunk.length === 0) continue
    chunks.push(chunk)
    if (index + size >= items.length) break
  }
  return chunks
}

const dedupeParagraphChunk = (
  chunk: Array<{ id: string; text: string }>
): Array<{ id: string; text: string }> => {
  const seen = new Set<string>()
  const output: Array<{ id: string; text: string }> = []
  for (const paragraph of chunk) {
    if (seen.has(paragraph.id)) continue
    seen.add(paragraph.id)
    output.push(paragraph)
  }
  return output
}

const scoreClaimCandidate = (input: {
  text: string
  paragraphIds: string[]
}): number => {
  let score = 0
  if (looksLikeClaim(input.text)) score += 2
  if (/\d/.test(input.text)) score += 1
  if (/(because|therefore|thus|条件|比較|従来|有効|改善)/i.test(input.text)) score += 1
  score += Math.min(2, input.paragraphIds.length * 0.5)
  score += Math.min(2, input.text.length / 120)
  return Number(score.toFixed(2))
}

const dedupeClaimCandidates = (candidates: ClaimCandidate[]): ClaimCandidate[] => {
  const byKey = new Map<string, ClaimCandidate>()
  for (const candidate of candidates) {
    const key = candidate.text.toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9faf]+/gi, ' ').trim()
    const current = byKey.get(key)
    if (!current || candidate.score > current.score) {
      byKey.set(key, candidate)
    }
  }
  return [...byKey.values()]
}

const mergeClaimsWithFallback = (
  primary: AnalysisClaim[],
  fallback: AnalysisClaim[],
  maxClaims: number,
  minClaims: number
): AnalysisClaim[] => {
  const merged = [...primary]
  const seenText = new Set(
    merged.map((claim) => claim.text.toLowerCase().replace(/\s+/g, ' ').trim())
  )
  for (const claim of fallback) {
    if (merged.length >= maxClaims) break
    const key = claim.text.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seenText.has(key)) continue
    merged.push(claim)
    seenText.add(key)
  }

  if (merged.length <= minClaims) {
    return merged.map((claim, index) => ({
      ...claim,
      claimId: `claim_${index + 1}`
    }))
  }

  return merged.map((claim, index) => ({
    ...claim,
    claimId: `claim_${index + 1}`
  }))
}

const normalizeClaimKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9faf]+/gi, ' ')
    .trim()

const renumberClaims = (claims: AnalysisClaim[]): AnalysisClaim[] =>
  claims.map((claim, index) => ({
    ...claim,
    claimId: `claim_${index + 1}`
  }))

const dedupeClaimPool = (
  claims: Array<{ text: string; paragraphIds: string[] }>
): Array<{ text: string; paragraphIds: string[] }> => {
  const seen = new Set<string>()
  const output: Array<{ text: string; paragraphIds: string[] }> = []
  for (const claim of claims) {
    const key = normalizeClaimKey(claim.text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push({
      text: claim.text,
      paragraphIds: claim.paragraphIds
    })
  }
  return output
}

const critiqueClaims = (
  claims: AnalysisClaim[],
  paragraphById: Map<string, string>
): Array<{ claim: AnalysisClaim; score: number; issues: string[] }> =>
  claims.map((claim) => {
    const quality = scoreClaimQuality(
      {
        text: claim.text,
        paragraphIds: claim.paragraphIds
      },
      paragraphById
    )
    return {
      claim,
      score: quality.score,
      issues: quality.issues
    }
  })

const scoreClaimQuality = (
  claim: { text: string; paragraphIds: string[] },
  paragraphById: Map<string, string>
): { score: number; issues: string[] } => {
  const issues: string[] = []
  let score = 0

  const normalized = normalizeClaimText(claim.text)
  if (normalized.length >= 20) score += 1
  else issues.push('too_short')

  if (looksLikeClaim(normalized)) score += 1
  else issues.push('not_claim_like')

  if (/\d/.test(normalized)) score += 0.8
  else issues.push('no_number')

  if (/(because|therefore|thus|if|when|compared|baseline|条件|比較|従来|場合|有効|改善)/i.test(normalized)) {
    score += 0.7
  } else {
    issues.push('no_condition_or_comparator')
  }

  if (claim.paragraphIds.length > 0) {
    score += 0.6
    const paragraphText = paragraphById.get(claim.paragraphIds[0] ?? '') ?? ''
    const overlap = tokenOverlap(normalized, paragraphText)
    if (overlap >= 0.3) score += 1
    else issues.push('low_source_overlap')
  } else {
    issues.push('no_paragraph_ref')
  }

  return { score: Number(score.toFixed(2)), issues }
}

const tokenOverlap = (a: string, b: string): number => {
  const left = tokenizeSimple(a)
  const right = new Set(tokenizeSimple(b))
  if (left.length === 0) return 0
  let match = 0
  for (const token of left) {
    if (right.has(token)) match += 1
  }
  return match / left.length
}

const tokenizeSimple = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9faf]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 2)
