import { AnalysisStatus, AnalysisStep, InputType } from '../../domain/enums.js'
import type { AnalysisResultJson, ExtractJson, PreflightResult } from '../../domain/types.js'
import { FirestoreRepo } from '../firestore.repo.js'
import { StorageService } from '../storage.service.js'
import { LatexExtractor } from '../extract/latex.extractor.js'
import { PdfExtractor } from '../extract/pdf.extractor.js'
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

export class AnalysisOrchestrator {
  private readonly repo: FirestoreRepo
  private readonly storage: StorageService
  private readonly latexExtractor: LatexExtractor
  private readonly pdfExtractor: PdfExtractor

  constructor(dependencies: OrchestratorDependencies = {}) {
    this.repo = dependencies.repo ?? new FirestoreRepo()
    this.storage = dependencies.storage ?? new StorageService()
    this.latexExtractor = dependencies.latexExtractor ?? new LatexExtractor()
    this.pdfExtractor = dependencies.pdfExtractor ?? new PdfExtractor()
  }

  async run(analysisId: string, _options: RunOptions = {}): Promise<AnalysisResultJson> {
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

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.EXTRACTING,
      10,
      AnalysisStep.EXTRACT
    )

    const rawBuffer = await this.storage.readAsBuffer(submission.gcsPathRaw)
    const extract = await this.runExtractor(submission.inputType, rawBuffer, analysisId)

    const extractObjectPath = `extract/${analysisId}/extract.json`
    const extractGsPath = await this.storage.putJson(extractObjectPath, extract)
    await this.repo.setPointers(analysisId, { gcsExtractJson: extractGsPath })

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      55,
      AnalysisStep.LOGIC
    )

    const { claims, warnings: claimWarnings } = await this.buildClaimsWithLlmFallback(extract)
    const { preflight, warnings: preflightWarnings } = this.runPreflightSafely(extract)
    const warnings = [...claimWarnings, ...preflightWarnings]

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      68,
      AnalysisStep.EVIDENCE
    )
    const evidenceResult = await auditEvidence({
      analysisId,
      claims,
      paragraphs: extract.paragraphs.map((paragraph) => ({
        paragraphId: paragraph.id,
        text: paragraph.text
      }))
    })

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      78,
      AnalysisStep.LOGIC
    )
    const logicResult = await inspectLogic({ analysisId, claims })

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      86,
      AnalysisStep.PRIOR_ART
    )
    const priorArtResult = await proposePriorArtQueries({
      analysisId,
      claims,
      ...(session?.domainTag ? { domainTag: session.domainTag } : {})
    })

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

    const topRisks = this.buildTopRisks({
      evidenceRisks: evidenceResult.risks,
      logicRisks: logicResult.risks,
      preflight
    })

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
      extractPath: extractGsPath
    }
    if (warnings.length > 0) {
      result.warnings = warnings
    }

    const resultObjectPath = `analysis/${analysisId}/result.json`
    const resultGsPath = await this.storage.putJson(resultObjectPath, result)
    await this.repo.setPointers(analysisId, { gcsAnalysisJson: resultGsPath })

    await this.repo.updateAnalysisStatus(analysisId, AnalysisStatus.READY, 100, AnalysisStep.FINALIZE)
    return result
  }

  private buildClaimsFromExtract(
    extract: ExtractJson
  ): Array<{ claimId: string; text: string; paragraphIds: string[] }> {
    const source = extract.paragraphs
      .filter((paragraph) => paragraph.text.trim().length >= 12)
      .map((paragraph) => ({
        paragraphId: paragraph.id,
        text: normalizeClaimText(paragraph.text)
      }))
      .filter((item) => item.text.length >= 12)

    const prioritized = source.filter((item) => looksLikeClaim(item.text))
    const fallback = source.filter((item) => !looksLikeClaim(item.text))
    let merged = [...prioritized, ...fallback].slice(0, 12)
    if (merged.length === 0) {
      merged = extract.paragraphs
        .map((paragraph) => ({
          paragraphId: paragraph.id,
          text: normalizeClaimText(paragraph.text)
        }))
        .filter((item) => item.text.length > 0)
        .slice(0, 3)
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
    claims: Array<{ claimId: string; text: string; paragraphIds: string[] }>
    warnings: string[]
  }> {
    const fallbackClaims = this.buildClaimsFromExtract(extract)
    const paragraphIds = new Set(extract.paragraphs.map((paragraph) => paragraph.id))
    const defaultParagraphId = extract.paragraphs[0]?.id

    try {
      const prompt = buildClaimPrompt({
        extractedText: serializeExtractForLlm(extract),
        maxClaims: 12
      })
      const output = await runPrompt(prompt, claimOutputSchema)
      const normalized = output.claims
        .slice(0, 12)
        .map((claim, index) => {
          const text = claim.text.trim().slice(0, 260)
          const validParagraphIds = claim.paragraphIds.filter((id) => paragraphIds.has(id))
          const resolvedParagraphIds =
            validParagraphIds.length > 0
              ? validParagraphIds
              : fallbackClaims[index]?.paragraphIds ??
                (defaultParagraphId ? [defaultParagraphId] : [])

          return {
            claimId: `claim_${index + 1}`,
            text,
            paragraphIds: resolvedParagraphIds
          }
        })
        .filter((claim) => claim.text.length > 0)

      if (normalized.length === 0) {
        throw new Error('llm produced empty claim list')
      }

      console.info(
        JSON.stringify({
          event: 'llm_claim_extraction_success',
          claimCount: normalized.length
        })
      )
      return { claims: normalized, warnings: [] }
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'llm_claim_extraction_fallback',
          reason: error instanceof Error ? error.message : 'unknown'
        })
      )
      return {
        claims: fallbackClaims,
        warnings: [
          `claim extraction via llm failed: ${error instanceof Error ? error.message : 'unknown'}`
        ]
      }
    }
  }

  private buildTopRisks(input: {
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
    for (const risk of input.evidenceRisks) {
      candidates.push({
        severity: risk.severity,
        title: `Evidence risk: ${risk.claimId}`,
        reason: risk.reason,
        refs: {
          claimIds: [risk.claimId],
          paragraphIds: risk.paragraphIds
        }
      })
    }
    for (const risk of input.logicRisks) {
      candidates.push({
        severity: risk.severity,
        title: `Logic risk: ${risk.claimId}`,
        reason: risk.reason,
        refs: {
          claimIds: [risk.claimId]
        }
      })
    }
    for (const finding of input.preflight.findings) {
      const severity: TopRisk['severity'] = finding.severity === 'error' ? 'HIGH' : 'MEDIUM'
      if (finding.refs) {
        candidates.push({
          severity,
          title: finding.kind,
          reason: finding.message,
          refs: finding.refs
        })
      } else {
        candidates.push({
          severity,
          title: finding.kind,
          reason: finding.message
        })
      }
    }

    const rank = (severity: 'LOW' | 'MEDIUM' | 'HIGH'): number =>
      severity === 'HIGH' ? 3 : severity === 'MEDIUM' ? 2 : 1

    return candidates
      .sort((left, right) => rank(right.severity) - rank(left.severity))
      .slice(0, 3)
  }

  private async runExtractor(
    inputType: InputType,
    rawBuffer: Buffer,
    analysisId: string
  ): Promise<ExtractJson> {
    if (inputType === InputType.LATEX_ZIP) {
      return this.latexExtractor.extract(rawBuffer, analysisId)
    }

    if (inputType === InputType.PDF) {
      return this.pdfExtractor.extract(rawBuffer, analysisId)
    }

    throw new AppError(ErrorCodes.INVALID_INPUT, 'unsupported input type', 400, { inputType })
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
}

const normalizeClaimText = (text: string): string => {
  const compact = text.replace(/\s+/g, ' ').trim()
  const firstSentence = compact.split(/[。.!?]/).find((sentence) => sentence.trim().length > 0)
  const basis = (firstSentence ?? compact).trim()
  return basis.slice(0, 260)
}

const looksLikeClaim = (text: string): boolean => {
  return CLAIM_PATTERNS.some((pattern) => pattern.test(text))
}

const CLAIM_PATTERNS = [
  /\b(we show|we demonstrate|we propose|our method|results indicate|outperform|improve)\b/i,
  /(本研究|提案|示す|改善|有効|性能|結果|達成)/i
]

const serializeExtractForLlm = (extract: ExtractJson): string => {
  const maxParagraphs = 120
  const lines = extract.paragraphs
    .slice(0, maxParagraphs)
    .map((paragraph) => `[${paragraph.id}] ${paragraph.text.replace(/\s+/g, ' ').trim()}`)
  return lines.join('\n')
}
