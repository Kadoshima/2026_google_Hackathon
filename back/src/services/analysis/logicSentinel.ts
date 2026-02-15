export { inspectLogic }
export type {
  LogicSentinelInput,
  LogicSentinelOutput,
  LogicRisk
}

type LogicSentinelInput = {
  analysisId: string
  claims: Array<{
    claimId: string
    text: string
  }>
}

type LogicRisk = {
  claimId: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  reason: string
}

type LogicSentinelOutput = {
  risks: LogicRisk[]
}

const inspectLogic = async (
  input: LogicSentinelInput
): Promise<LogicSentinelOutput> => {
  const risks: LogicRisk[] = []

  for (const claim of input.claims) {
    const text = claim.text
    const lowered = text.toLowerCase()
    const textLength = text.trim().length

    const hasNumber = /(?:\d+(\.\d+)?%?|\b[0-9]+\b)/.test(text)
    const hasVagueWord = matchesAny(lowered, VAGUE_PATTERNS)
    const hasAbsoluteWord = matchesAny(lowered, ABSOLUTE_PATTERNS)
    const impliesComparison = matchesAny(lowered, COMPARATIVE_PATTERNS)
    const hasComparator = matchesAny(lowered, COMPARATOR_PATTERNS)
    const hasCondition = matchesAny(lowered, CONDITION_PATTERNS)

    const reasons: string[] = []
    let severity: LogicRisk['severity'] | null = null

    if (hasAbsoluteWord && !hasCondition) {
      reasons.push('断定表現がある一方で、成立条件が明示されていません')
      severity = 'HIGH'
    }

    if (hasVagueWord && !hasNumber) {
      reasons.push('定量根拠がないまま抽象語で効果を述べています')
      severity = promoteSeverity(severity, 'MEDIUM')
    }

    if (impliesComparison && !hasComparator) {
      reasons.push('比較を示唆していますが、比較対象（ベースライン）が不明です')
      severity = promoteSeverity(severity, 'MEDIUM')
    }

    if (!hasNumber && !hasCondition && !hasComparator) {
      reasons.push('数値・条件・比較対象の3要素が不足しています')
      severity = promoteSeverity(severity, 'LOW')
    }

    if (textLength < 45 && !hasNumber) {
      reasons.push('主張文が短く、再現可能性を担保する具体性が不足しています')
      severity = promoteSeverity(severity, 'LOW')
    }

    if (!severity) {
      continue
    }

    risks.push({
      claimId: claim.claimId,
      severity,
      reason: reasons.join('; ')
    })
  }

  return { risks }
}

const matchesAny = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(text))

const promoteSeverity = (
  current: LogicRisk['severity'] | null,
  next: LogicRisk['severity']
): LogicRisk['severity'] => {
  if (!current) return next
  if (current === 'HIGH' || next === 'HIGH') return 'HIGH'
  if (current === 'MEDIUM' || next === 'MEDIUM') return 'MEDIUM'
  return 'LOW'
}

const VAGUE_PATTERNS = [
  /\b(significant|substantial|dramatic|remarkable|effective|efficient)\b/i,
  /(大幅|十分|顕著|有効|効果的|高速化|改善した|優れている|高い性能)/i
]

const ABSOLUTE_PATTERNS = [
  /\b(always|never|all|every|entirely|completely)\b/i,
  /(すべて|常に|完全に|必ず|全て|どの環境でも)/i
]

const COMPARATIVE_PATTERNS = [
  /\b(better|faster|stronger|improved|outperform|superior)\b/i,
  /(優れる|改善|高速|高精度|高性能|上回る)/i
]

const COMPARATOR_PATTERNS = [
  /\b(than|versus|vs\.?|compared to|baseline|prior)\b/i,
  /(従来|既存|比較|ベースライン|対して)/i
]

const CONDITION_PATTERNS = [
  /\b(when|if|under|for|in case)\b/i,
  /(条件|場合|とき|下で|環境)/i
]
