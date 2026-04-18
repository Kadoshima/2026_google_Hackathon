import type {
  AnalysisResultJson,
  UnderstandingScore,
  UnderstandingScoreLabel
} from '../../domain/types.js'

export { computeUnderstandingScore }
export type { UnderstandingScoreInput }

type EvidenceRisk = NonNullable<AnalysisResultJson['evidenceRisks']>[number]
type LogicRisk = NonNullable<AnalysisResultJson['logicRisks']>[number]
type Claim = NonNullable<AnalysisResultJson['claims']>[number]
type Preflight = AnalysisResultJson['preflight']

type UnderstandingScoreInput = {
  claims: Claim[]
  evidenceRisks: EvidenceRisk[]
  logicRisks: LogicRisk[]
  preflight: Preflight
  adoptedPatchCount?: number
  oralDefensePassCount?: number
  oralDefenseFailCount?: number
}

const SEVERITY_WEIGHT: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = {
  HIGH: 1,
  MEDIUM: 0.5,
  LOW: 0.15
}

const CLAMP = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Math.round(value)))

const computeEvidenceScore = (claims: Claim[], risks: EvidenceRisk[]): number => {
  if (claims.length === 0) return risks.length === 0 ? 80 : 40
  const totalWeighted = risks.reduce((sum, risk) => sum + SEVERITY_WEIGHT[risk.severity], 0)
  const penalty = (totalWeighted / Math.max(claims.length, 1)) * 100
  return CLAMP(100 - penalty)
}

const computeLogicScore = (claims: Claim[], risks: LogicRisk[]): number => {
  if (claims.length === 0) return risks.length === 0 ? 80 : 40
  const totalWeighted = risks.reduce((sum, risk) => sum + SEVERITY_WEIGHT[risk.severity], 0)
  const penalty = (totalWeighted / Math.max(claims.length, 1)) * 85
  return CLAMP(100 - penalty)
}

const computePreflightScore = (preflight: Preflight): number => {
  const errors = preflight.summary.errorCount
  const warnings = preflight.summary.warningCount
  const penalty = errors * 18 + warnings * 6
  return CLAMP(100 - penalty)
}

const computeSpecificityScore = (claims: Claim[]): number => {
  if (claims.length === 0) return 50
  let hits = 0
  for (const claim of claims) {
    const text = claim.text
    const hasNumber = /\d/.test(text)
    const hasComparator = /(because|therefore|thus|compared|baseline|条件|比較|従来|場合|有効|改善|vs\.|より)/i.test(
      text
    )
    if (hasNumber) hits += 0.6
    if (hasComparator) hits += 0.4
  }
  const ratio = hits / claims.length
  return CLAMP(ratio * 100)
}

const computeOralBonus = (input: UnderstandingScoreInput): number => {
  const passes = input.oralDefensePassCount ?? 0
  const fails = input.oralDefenseFailCount ?? 0
  const adopted = input.adoptedPatchCount ?? 0
  if (passes === 0 && fails === 0 && adopted === 0) return 0
  const total = passes + fails
  const passRatio = total > 0 ? passes / total : 0
  const adoptedBoost = Math.min(adopted * 2, 10)
  return Math.round(passRatio * 5 + adoptedBoost)
}

const resolveLabel = (total: number): UnderstandingScoreLabel => {
  if (total >= 85) return 'STRONG'
  if (total >= 70) return 'GOOD'
  if (total >= 55) return 'FAIR'
  if (total >= 35) return 'WEAK'
  return 'CRITICAL'
}

const computeUnderstandingScore = (input: UnderstandingScoreInput): UnderstandingScore => {
  const evidence = computeEvidenceScore(input.claims, input.evidenceRisks)
  const logic = computeLogicScore(input.claims, input.logicRisks)
  const preflight = computePreflightScore(input.preflight)
  const specificity = computeSpecificityScore(input.claims)

  const weighted =
    evidence * 0.4 + logic * 0.3 + specificity * 0.2 + preflight * 0.1

  const bonus = computeOralBonus(input)
  const total = CLAMP(weighted + bonus)

  return {
    total,
    breakdown: {
      evidence,
      logic,
      preflight,
      specificity
    },
    label: resolveLabel(total),
    version: 'v1'
  }
}
