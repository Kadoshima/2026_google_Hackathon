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
  const hasMetric = Boolean(
    metrics &&
      (metrics.noEvidenceClaimsCount !== undefined ||
        metrics.weakEvidenceClaimsCount !== undefined ||
        metrics.specificityLackCount !== undefined)
  )

  const topRisks = await readTopRisks(analysisJsonPath)

  if (!hasMetric && topRisks.length === 0) return undefined

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
    ...(Object.keys(metricFields).length > 0 ? { metrics: metricFields } : {})
  }
}

const readTopRisks = async (
  analysisJsonPath: string | undefined
): Promise<NonNullable<AnalysisSummary['top3_risks']>> => {
  if (!analysisJsonPath) return []

  try {
    const result = await storageService.readJson<AnalysisResultJson>(analysisJsonPath)
    const topRisks = result.summary?.topRisks ?? []
    return topRisks.slice(0, 3).map((risk) => ({
      title: risk.title,
      refs: {
        ...(risk.refs?.claimIds ? { claim_ids: risk.refs.claimIds } : {}),
        ...(risk.refs?.paragraphIds ? { paragraph_ids: risk.refs.paragraphIds } : {}),
        ...(risk.refs?.figureIds ? { figure_ids: risk.refs.figureIds } : {}),
        ...(risk.refs?.citationKeys ? { citation_keys: risk.refs.citationKeys } : {})
      }
    }))
  } catch {
    return []
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
