import type { Hono } from 'hono'
import type { AnalysisReadyResponse, AnalysisResponse, AnalysisSummary } from 'shared'
import { getAnalysis } from '../../services/firestore.repo.js'
import { getSignedUrl } from '../../services/storage.service.js'
import { buildError } from '../../utils/errors.js'

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

      const summary = buildSummary(analysis.metrics)
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

const buildSummary = (
  metrics: {
    noEvidenceClaimsCount?: number
    weakEvidenceClaimsCount?: number
    specificityLackCount?: number
  } | undefined
): AnalysisSummary | undefined => {
  if (!metrics) return undefined

  const hasMetric =
    metrics.noEvidenceClaimsCount !== undefined ||
    metrics.weakEvidenceClaimsCount !== undefined ||
    metrics.specificityLackCount !== undefined

  if (!hasMetric) return undefined

  return {
    metrics: {
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
