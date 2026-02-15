import type { Hono } from 'hono'
import type { AnalysisReadyResponse, AnalysisResponse, AnalysisSummary } from 'shared'
import type { Analysis, AnalysisResultJson } from '../../domain/types.js'
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

      const progressMessage = resolveProgressMessage(analysis)
      const base: AnalysisResponse = {
        analysis_id: analysis.analysisId,
        status: analysis.status,
        progress: normalizeProgress(analysis.progress),
        ...(analysis.step ? { step: analysis.step } : {}),
        ...(progressMessage ? { message: progressMessage } : {})
      }

      if (analysis.status !== 'READY') {
        const runtimeSummary = buildRuntimeSummaryFromAnalysis(analysis)
        if (runtimeSummary) {
          const inProgressResponse: AnalysisResponse = {
            ...base,
            summary: runtimeSummary
          }
          return c.json(inProgressResponse, 200)
        }
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

const resolveProgressMessage = (analysis: {
  status: string
  step?: string
  error?: { messagePublic?: string }
}): string | undefined => {
  if (analysis.error?.messagePublic) return analysis.error.messagePublic
  if (analysis.status === 'READY') return 'AIオーケストレーション完了'
  if (analysis.status === 'FAILED') return 'AIオーケストレーション失敗'
  if (analysis.step === 'extract') return 'Extractorが成果物を構造化しています'
  if (analysis.step === 'evidence') return 'Evidence Auditorが主張と根拠を照合しています'
  if (analysis.step === 'logic') return 'Claim Miner / Logic Sentinelが論点を解析しています'
  if (analysis.step === 'prior_art') return 'Prior-Art Coachが比較観点を生成しています'
  if (analysis.step === 'finalize') return 'Synthesizerが最終レポートを統合しています'
  return analysis.status === 'QUEUED' ? 'Plannerが解析計画を準備しています' : undefined
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
  const top3Risks = topRisks.slice(0, 3).map((risk) => ({
    title: risk.title,
    ...(risk.refs ? { refs: risk.refs } : {})
  }))
  const agents = toAgents(result)
  const claimEvidence = toClaimEvidence(result)
  const logicRisks = toLogicRisks(result)
  const preflightSummary = toPreflightSummary(result)

  const hasStructuredDetails =
    agents.length > 0 ||
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
    ...(top3Risks.length > 0 ? { top3_risks: top3Risks } : {}),
    ...(topRisks.length > 0 ? { top_risks: topRisks } : {}),
    ...(agents.length > 0 ? { agents } : {}),
    ...(claimEvidence.length > 0 ? { claim_evidence: claimEvidence } : {}),
    ...(logicRisks.length > 0 ? { logic_risks: logicRisks } : {}),
    ...(preflightSummary ? { preflight_summary: preflightSummary } : {}),
    ...(Object.keys(metricFields).length > 0 ? { metrics: metricFields } : {})
  }
}

const buildRuntimeSummaryFromAnalysis = (
  analysis: Analysis
): AnalysisSummary | undefined => {
  const agents = toAgentsFromTrace(analysis.agentTrace)
  if (agents.length === 0) return undefined
  return { agents }
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
): NonNullable<AnalysisSummary['top_risks']> => {
  const topRisks = result?.summary?.topRisks ?? []
  return topRisks.map((risk) => ({
    title: risk.title,
    severity: risk.severity,
    reason: risk.reason,
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
        reason: risk?.reason ?? 'この主張に対する重大な根拠リスクは検出されませんでした。'
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

const toAgents = (
  result: AnalysisResultJson | undefined
): NonNullable<AnalysisSummary['agents']> => {
  return toAgentsFromTrace(result?.agentTrace)
}

const toAgentsFromTrace = (
  trace: AnalysisResultJson['agentTrace'] | Analysis['agentTrace']
): NonNullable<AnalysisSummary['agents']> => {
  const safeTrace = trace ?? []
  return safeTrace.map((entry) => ({
    agent_id: entry.agentId,
    role: entry.role,
    status: entry.status,
    duration_ms: entry.durationMs,
    summary: entry.summary,
    ...(entry.highlights && entry.highlights.length > 0
      ? { highlights: entry.highlights }
      : {})
  }))
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
