import type { AnalysisMetrics } from '../../domain/types.js'

export { computeMetrics }
export type { ComputeMetricsInput, MetricSignal }

type MetricSignal = {
  kind: 'NO_EVIDENCE' | 'WEAK_EVIDENCE' | 'SPECIFICITY_LACK'
  claimId?: string
}

type ComputeMetricsInput = {
  evidenceSignals?: MetricSignal[]
  logicSignals?: MetricSignal[]
}

const computeMetrics = (input: ComputeMetricsInput): AnalysisMetrics => {
  const signals = [
    ...(input.evidenceSignals ?? []),
    ...(input.logicSignals ?? [])
  ]

  return {
    noEvidenceClaimsCount: signals.filter((s) => s.kind === 'NO_EVIDENCE').length,
    weakEvidenceClaimsCount: signals.filter((s) => s.kind === 'WEAK_EVIDENCE').length,
    specificityLackCount: signals.filter((s) => s.kind === 'SPECIFICITY_LACK').length
  }
}
