import type { Analysis } from '../../domain/types.js'
import { firestore } from '../firestore.repo.js'
import { putText } from '../storage.service.js'

export { renderHtml, saveReportHtml, getReportRecord }
export type { SaveReportHtmlInput, ReportRecord }

type SaveReportHtmlInput = {
  reportId: string
  analysisId: string
  html: string
}

type ReportRecord = {
  reportId: string
  analysisId: string
  gcsPath: string
  createdAt: string
}

const renderHtml = (analysis: Analysis): string => {
  const escapedAnalysisId = escapeHtml(analysis.analysisId)
  const escapedSessionId = escapeHtml(analysis.sessionId)
  const escapedSubmissionId = escapeHtml(analysis.submissionId)
  const escapedStatus = escapeHtml(analysis.status)
  const escapedProgress = escapeHtml(String(analysis.progress))
  const escapedStep = escapeHtml(analysis.step ?? '-')

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>Analysis Report - ${escapedAnalysisId}</title>`,
    '</head>',
    '<body>',
    '  <h1>Analysis Report</h1>',
    '  <table border="1" cellpadding="8" cellspacing="0">',
    `    <tr><th>analysisId</th><td>${escapedAnalysisId}</td></tr>`,
    `    <tr><th>sessionId</th><td>${escapedSessionId}</td></tr>`,
    `    <tr><th>submissionId</th><td>${escapedSubmissionId}</td></tr>`,
    `    <tr><th>status</th><td>${escapedStatus}</td></tr>`,
    `    <tr><th>progress</th><td>${escapedProgress}</td></tr>`,
    `    <tr><th>step</th><td>${escapedStep}</td></tr>`,
    '  </table>',
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

const saveReportHtml = async (input: SaveReportHtmlInput): Promise<string> => {
  const objectPath = `reports/${input.analysisId}/${input.reportId}.html`
  const gcsPath = await putText({
    objectPath,
    text: input.html,
    contentType: 'text/html; charset=utf-8'
  })

  const record: ReportRecord = {
    reportId: input.reportId,
    analysisId: input.analysisId,
    gcsPath,
    createdAt: new Date().toISOString()
  }

  await firestore.collection('reports').doc(input.reportId).set(record)
  return gcsPath
}

const getReportRecord = async (reportId: string): Promise<ReportRecord | null> => {
  const snap = await firestore.collection('reports').doc(reportId).get()
  if (!snap.exists) return null
  return snap.data() as ReportRecord
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
