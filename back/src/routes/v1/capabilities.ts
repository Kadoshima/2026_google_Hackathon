import type { Hono } from 'hono'
import type { CapabilitiesResponse } from 'shared'
import { ArtifactType } from '../../domain/enums.js'

export const registerCapabilitiesRoutes = (app: Hono) => {
  app.get('/capabilities', (c) => {
    const response: CapabilitiesResponse = {
      concept: 'comprehension_assurance',
      explain_to_ship: true,
      artifact_adapters: [
        {
          artifact_type: ArtifactType.PAPER,
          status: 'ready',
          supported_inputs: ['LATEX_ZIP', 'PDF'],
          key_checks: ['claim_evidence_map', 'logic_gap', 'preflight']
        },
        {
          artifact_type: ArtifactType.PR,
          status: 'beta',
          supported_inputs: ['PR_TEXT'],
          key_checks: ['diff_hunk_alignment', 'test_coverage_signal', 'explain_to_ship']
        },
        {
          artifact_type: ArtifactType.DOC,
          status: 'beta',
          supported_inputs: ['DOC_TEXT'],
          key_checks: ['claim_basis', 'assumption_clarity', 'decision_constraint_gap']
        },
        {
          artifact_type: ArtifactType.SHEET,
          status: 'beta',
          supported_inputs: ['SHEET_TEXT'],
          key_checks: ['formula_traceability', 'aggregation_constraints', 'sanity_signal']
        }
      ]
    }

    return c.json(response, 200)
  })
}
