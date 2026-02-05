import { Hono } from 'hono'
import { registerAnalyzeRoutes } from './analyze.js'
import { registerAnalysisRoutes } from './analysis.js'
import { registerHealthRoutes } from './health.js'
import { registerOralRoutes } from './oral.js'
import { registerPatchRoutes } from './patch.js'
import { registerReportRoutes } from './report.js'
import { registerUploadRoutes } from './upload.js'

export const registerV1Routes = (app: Hono) => {
  const v1 = new Hono()

  registerUploadRoutes(v1)
  registerAnalyzeRoutes(v1)
  registerAnalysisRoutes(v1)
  registerOralRoutes(v1)
  registerPatchRoutes(v1)
  registerReportRoutes(v1)
  registerHealthRoutes(v1)

  app.route('/v1', v1)
}
