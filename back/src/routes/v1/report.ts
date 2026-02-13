import type { Hono } from 'hono'
import type { ReportGenerateResponse, ReportGetResponse } from 'shared'
import { getAnalysis, setPointers } from '../../services/firestore.repo.js'
import { getSignedUrl } from '../../services/storage.service.js'
import {
  getReportRecord,
  renderHtml,
  saveReportHtml
} from '../../services/report/report.service.js'
import { buildError } from '../../utils/errors.js'
import { makeId } from '../../utils/ids.js'

export const registerReportRoutes = (app: Hono) => {
  app.post('/report/generate', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(buildError('INVALID_INPUT', 'request body must be JSON'), 400)
    }

    const parsed = parseReportGenerateRequest(body)
    if (!parsed.ok) {
      return c.json(buildError('INVALID_INPUT', parsed.message), 400)
    }

    try {
      const analysis = await getAnalysis({ analysisId: parsed.value.analysis_id })
      if (!analysis) {
        return c.json(buildError('NOT_FOUND', 'analysis not found'), 404)
      }

      const reportId = makeId('rep')
      const html = renderHtml(analysis)
      const gcsPath = await saveReportHtml({
        reportId,
        analysisId: parsed.value.analysis_id,
        html
      })

      await setPointers({
        analysisId: parsed.value.analysis_id,
        gcsReportHtml: gcsPath
      })

      const response: ReportGenerateResponse = { report_id: reportId }
      return c.json(response, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to generate report', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })

  app.get('/report/:reportId', async (c) => {
    const reportId = c.req.param('reportId')
    if (!reportId) {
      return c.json(buildError('INVALID_INPUT', 'reportId is required'), 400)
    }

    try {
      const record = await getReportRecord(reportId)
      if (!record) {
        return c.json(buildError('NOT_FOUND', 'report not found'), 404)
      }

      const reportHtmlSignedUrl = await getSignedUrl(record.gcsPath)
      const response: ReportGetResponse = {
        report_html_signed_url: reportHtmlSignedUrl
      }
      return c.json(response, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to fetch report url', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

const parseReportGenerateRequest = (
  value: unknown
): { ok: true; value: { analysis_id: string } } | { ok: false; message: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'request body must be an object' }
  }

  const record = value as Record<string, unknown>
  const analysisId = record.analysis_id
  if (typeof analysisId !== 'string' || analysisId.length === 0) {
    return { ok: false, message: 'analysis_id is required' }
  }

  return { ok: true, value: { analysis_id: analysisId } }
}
