import type { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildError } from '../../utils/errors.js'

/**
 * Demo routes serve precomputed fixtures so that product demos don't
 * depend on Vertex AI / Firestore / Cloud Tasks being available.
 *
 * - GET /v1/demo/sample          : the bad paper markdown text
 * - GET /v1/demo/sample/analysis : the precomputed AnalysisReadyResponse JSON
 */
export const registerDemoRoutes = (app: Hono) => {
  app.get('/demo/sample', async (c) => {
    try {
      const text = await readSampleText()
      return c.body(text, 200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      })
    } catch (err) {
      return c.json(
        buildError('INTERNAL_ERROR', 'demo sample unavailable', {
          message: err instanceof Error ? err.message : 'unknown'
        }),
        500
      )
    }
  })

  app.get('/demo/sample/analysis', async (c) => {
    try {
      const json = await readExpectedAnalysis()
      return c.json(json, 200, {
        'Cache-Control': 'public, max-age=300'
      })
    } catch (err) {
      return c.json(
        buildError('INTERNAL_ERROR', 'demo analysis unavailable', {
          message: err instanceof Error ? err.message : 'unknown'
        }),
        500
      )
    }
  })

  app.get('/demo/info', (c) => {
    return c.json(
      {
        sample_id: 'demo_amr_net_v1',
        title: 'Toward Ultra-Fast Graph Learning: Adaptive Mesh Reordering',
        description:
          'A deliberately flawed paper used to showcase the Reviewer Zero analysis pipeline.',
        endpoints: {
          sample: '/v1/demo/sample',
          analysis: '/v1/demo/sample/analysis'
        },
        flaws: [
          '10x speedup claim with no measurement conditions',
          'accuracy improvements without significance testing',
          'missing appendix referenced from introduction',
          'dangling prior-work references (SGC / APPNP)',
          'no ablation for the cache-locality causal claim'
        ]
      },
      200
    )
  })
}

// ---- fixture loading --------------------------------------------------------

// Resolve path relative to the compiled JS file so this works both in
// development (ts-node) and in production (dist/).
const here = path.dirname(fileURLToPath(import.meta.url))
const docsDir = path.resolve(here, '../../../docs/demo')
const sampleMarkdownPath = path.join(docsDir, 'bad-paper-sample.md')
const expectedAnalysisPath = path.join(docsDir, 'expected-analysis.json')

let cachedMarkdown: string | null = null
let cachedJson: unknown = null

const readSampleText = async (): Promise<string> => {
  if (cachedMarkdown !== null) return cachedMarkdown
  const raw = await readFile(sampleMarkdownPath, 'utf8')
  cachedMarkdown = raw
  return raw
}

const readExpectedAnalysis = async (): Promise<unknown> => {
  if (cachedJson !== null) return cachedJson
  const raw = await readFile(expectedAnalysisPath, 'utf8')
  cachedJson = JSON.parse(raw)
  return cachedJson
}
