import type { Hono } from 'hono'
import type { AnalysisReadyResponse, AnalysisResponse, AnalysisSummary } from 'shared'
import type { AnalysisResultJson } from '../../domain/types.js'
import { getAnalysis } from '../../services/firestore.repo.js'
import { getSignedUrl, StorageService } from '../../services/storage.service.js'
import { buildError } from '../../utils/errors.js'

const storageService = new StorageService()

export const registerAnalysisRoutes = (app: Hono) => {
  app.get('/analysis/:analysisId', async (c) => {
    const analysisId = c.req.param('analysisId')
    if (!analysisId) {
      return c.json(buildError('INVALID_INPUT', 'analysisId is required'), 400)
    }

    try {
      const analysis = await getAnalysis({ analysisId })

      if (!analysis) {
        return c.json(buildError('NOT_FOUND', 'analysis not found'), 404)
      }

      const base: AnalysisResponse = {
        analysis_id: analysis.analysisId,
        status: analysis.status,
        progress: normalizeProgress(analysis.progress),
        ...(analysis.step ? { step: analysis.step } : {}),
        ...(analysis.error?.messagePublic ? { message: analysis.error.messagePublic } : {})
      }

      if (analysis.status !== 'READY') {
        return c.json(base, 200)
      }

      const summary = await buildSummary(analysis.metrics, analysis.pointers?.gcsAnalysisJson)
      const pointers = await buildPointers(analysis.pointers)

      const readyResponse: AnalysisReadyResponse = {
        ...base,
        ...(summary ? { summary } : {}),
        ...(pointers ? { pointers } : {})
      }

      return c.json(readyResponse, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to fetch analysis', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

const normalizeProgress = (progress: number): number => {
  const value = progress <= 1 ? progress * 100 : progress
  return Math.min(Math.max(value, 0), 100)
}

const buildSummary = async (
  metrics: {
    noEvidenceClaimsCount?: number
    weakEvidenceClaimsCount?: number
    specificityLackCount?: number
  } | undefined,
  analysisJsonPath: string | undefined
): Promise<AnalysisSummary | undefined> => {
  const result = await readAnalysisResult(analysisJsonPath)

  const hasMetric = Boolean(
    metrics &&
      (metrics.noEvidenceClaimsCount !== undefined ||
        metrics.weakEvidenceClaimsCount !== undefined ||
        metrics.specificityLackCount !== undefined)
  )

  const topRisks = toTopRisks(result)
  const claimEvidence = toClaimEvidence(result)
  const logicRisks = toLogicRisks(result)
  const preflightSummary = toPreflightSummary(result)

  const hasStructuredDetails =
    claimEvidence.length > 0 ||
    logicRisks.length > 0 ||
    preflightSummary !== undefined

  if (!hasMetric && topRisks.length === 0 && !hasStructuredDetails) return undefined

  const metricFields = metrics
    ? {
        ...(metrics.noEvidenceClaimsCount !== undefined
          ? { no_evidence_claims: metrics.noEvidenceClaimsCount }
          : {}),
        ...(metrics.weakEvidenceClaimsCount !== undefined
          ? { weak_evidence_claims: metrics.weakEvidenceClaimsCount }
          : {}),
        ...(metrics.specificityLackCount !== undefined
          ? { specificity_lack: metrics.specificityLackCount }
          : {})
      }
    : {}

  return {
    ...(topRisks.length > 0 ? { top3_risks: topRisks } : {}),
    ...(claimEvidence.length > 0 ? { claim_evidence: claimEvidence } : {}),
    ...(logicRisks.length > 0 ? { logic_risks: logicRisks } : {}),
    ...(preflightSummary ? { preflight_summary: preflightSummary } : {}),
    ...(Object.keys(metricFields).length > 0 ? { metrics: metricFields } : {})
  }
}

const readAnalysisResult = async (
  analysisJsonPath: string | undefined
): Promise<AnalysisResultJson | undefined> => {
  if (!analysisJsonPath) return undefined

  try {
    return await storageService.readJson<AnalysisResultJson>(analysisJsonPath)
  } catch {
    return undefined
  }
}

const toTopRisks = (
  result: AnalysisResultJson | undefined
): NonNullable<AnalysisSummary['top3_risks']> => {
  const topRisks = result?.summary?.topRisks ?? []
  return topRisks.slice(0, 3).map((risk) => ({
    title: risk.title,
    refs: {
      ...(risk.refs?.claimIds ? { claim_ids: risk.refs.claimIds } : {}),
      ...(risk.refs?.paragraphIds ? { paragraph_ids: risk.refs.paragraphIds } : {}),
      ...(risk.refs?.figureIds ? { figure_ids: risk.refs.figureIds } : {}),
      ...(risk.refs?.citationKeys ? { citation_keys: risk.refs.citationKeys } : {})
    }
  }))
}

const toClaimEvidence = (
  result: AnalysisResultJson | undefined
): NonNullable<AnalysisSummary['claim_evidence']> => {
  const claims = result?.claims ?? []
  const evidenceRisks = result?.evidenceRisks ?? []
  const riskByClaim = new Map(evidenceRisks.map((risk) => [risk.claimId, risk]))

  if (claims.length > 0) {
    return claims.map((claim) => {
      const risk = riskByClaim.get(claim.claimId)
      return {
        claim_id: claim.claimId,
        claim_text: claim.text,
        paragraph_ids: risk?.paragraphIds ?? claim.paragraphIds,
        severity: risk?.severity ?? 'LOW',
        reason: risk?.reason ?? 'No major evidence risk was detected for this claim.'
      }
    })
  }

  return evidenceRisks.map((risk) => {
    const claim = claims.find((item) => item.claimId === risk.claimId)
    return {
      claim_id: risk.claimId,
      claim_text: claim?.text ?? risk.claimId,
      paragraph_ids: risk.paragraphIds,
      severity: risk.severity,
      reason: risk.reason
    }
  })
}

const toLogicRisks = (
  result: AnalysisResultJson | undefined
): NonNullable<AnalysisSummary['logic_risks']> => {
  if (!result?.logicRisks || result.logicRisks.length === 0) return []
  return result.logicRisks.map((risk) => ({
    claim_id: risk.claimId,
    severity: risk.severity,
    reason: risk.reason
  }))
}

const toPreflightSummary = (
  result: AnalysisResultJson | undefined
): AnalysisSummary['preflight_summary'] | undefined => {
  const summary = result?.preflight?.summary
  if (!summary) return undefined
  return {
    error_count: summary.errorCount,
    warning_count: summary.warningCount
  }
}

const buildPointers = async (
  pointers: {
    gcsExtractJson?: string
    gcsAnalysisJson?: string
    gcsReportHtml?: string
  } | undefined
) => {
  if (!pointers) return undefined

  const next: {
    analysis_json_signed_url?: string
    report_html_signed_url?: string
    extract_json_signed_url?: string
  } = {}

  if (pointers.gcsAnalysisJson) {
    next.analysis_json_signed_url = await getSignedUrl(pointers.gcsAnalysisJson)
  }
  if (pointers.gcsReportHtml) {
    next.report_html_signed_url = await getSignedUrl(pointers.gcsReportHtml)
  }
  if (pointers.gcsExtractJson) {
    next.extract_json_signed_url = await getSignedUrl(pointers.gcsExtractJson)
  }

  if (Object.keys(next).length === 0) return undefined
  return next
}
