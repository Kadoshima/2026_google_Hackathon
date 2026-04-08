import { Hono } from 'hono'
import { registerAnalyzeRoutes } from './analyze.js'
import { registerAnalysisRoutes } from './analysis.js'
import { registerArtifactRoutes } from './artifacts.js'
import { registerCapabilitiesRoutes } from './capabilities.js'
import { registerHealthRoutes } from './health.js'
import { registerOralRoutes } from './oral.js'
import { registerPatchRoutes } from './patch.js'
import { registerReportRoutes } from './report.js'
import { registerSessionRoutes } from './sessions.js'
import { registerSettingsRoutes } from './settings.js'
import { registerUploadRoutes } from './upload.js'
import { loadConfig } from '../../utils/config.js'
import { createRateLimitMiddleware } from '../../utils/rateLimit.js'
import { createIdempotencyMiddleware } from '../../utils/idempotency.js'
import { createBodyLimitMiddleware } from '../../utils/bodyLimit.js'

export const registerV1Routes = (app: Hono) => {
  const v1 = new Hono()
  const config = loadConfig()

  // Hard ceiling on JSON bodies. Multipart uploads are sized per-route.
  v1.use('*', createBodyLimitMiddleware())

  // Per-scope rate limiting at the router level. The individual route files
  // may also keep their own limiters as a defence-in-depth layer.
  const toCfg = (s: { max: number; windowMs: number }) => ({
    maxRequests: s.max,
    windowMs: s.windowMs
  })
  v1.use('/upload', createRateLimitMiddleware('upload', toCfg(config.rateLimit.upload)))
  v1.use('/artifacts', createRateLimitMiddleware('artifacts', toCfg(config.rateLimit.artifacts)))
  v1.use('/analyze', createRateLimitMiddleware('analyze', toCfg(config.rateLimit.analyze)))
  v1.use('/oral/*', createRateLimitMiddleware('oral', toCfg(config.rateLimit.oral)))
  v1.use('/patch/*', createRateLimitMiddleware('patch', toCfg(config.rateLimit.patch)))

  // Idempotency-Key: opt-in, applies only when the header is present.
  v1.use('/upload', createIdempotencyMiddleware('upload'))
  v1.use('/artifacts', createIdempotencyMiddleware('artifacts'))
  v1.use('/analyze', createIdempotencyMiddleware('analyze'))
  v1.use('/oral/ask', createIdempotencyMiddleware('oral.ask'))
  v1.use('/patch/generate', createIdempotencyMiddleware('patch.generate'))

  registerUploadRoutes(v1)
  registerArtifactRoutes(v1)
  registerAnalyzeRoutes(v1)
  registerAnalysisRoutes(v1)
  registerOralRoutes(v1)
  registerPatchRoutes(v1)
  registerReportRoutes(v1)
  registerSessionRoutes(v1)
  registerSettingsRoutes(v1)
  registerCapabilitiesRoutes(v1)
  registerHealthRoutes(v1)

  app.route('/v1', v1)
}
