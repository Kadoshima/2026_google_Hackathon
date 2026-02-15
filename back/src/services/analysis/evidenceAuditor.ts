export { auditEvidence }
export type {
  EvidenceAuditorInput,
  EvidenceAuditorOutput,
  EvidenceRisk
}

type EvidenceAuditorInput = {
  analysisId: string
  claims: Array<{
    claimId: string
    text: string
  }>
  paragraphs: Array<{
    paragraphId: string
    text: string
  }>
}

type EvidenceRisk = {
  claimId: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  paragraphIds: string[]
  reason: string
}

type EvidenceAuditorOutput = {
  risks: EvidenceRisk[]
}

const auditEvidence = async (
  input: EvidenceAuditorInput
): Promise<EvidenceAuditorOutput> => {
  const paragraphs = input.paragraphs.map((paragraph) => ({
    ...paragraph,
    tokens: tokenize(paragraph.text)
  }))

  const risks: EvidenceRisk[] = []

  for (const claim of input.claims) {
    const claimTokens = tokenize(claim.text)
    const scored = paragraphs
      .map((paragraph) => ({
        paragraphId: paragraph.paragraphId,
        text: paragraph.text,
        tokens: paragraph.tokens,
        score: overlapScore(claimTokens, paragraph.tokens)
      }))
      .sort((left, right) => right.score - left.score)

    const supportMatches = scored.filter((item) => item.score >= 0.18)
    const strongMatchCount = scored.filter((item) => item.score >= 0.35).length
    const topMatches = supportMatches.slice(0, 3)
    const paragraphIds = topMatches.map((item) => item.paragraphId)
    const bestScore = scored[0]?.score ?? 0
    const topScoreAverage =
      topMatches.length > 0
        ? topMatches.reduce((sum, item) => sum + item.score, 0) / topMatches.length
        : 0
    const tokenCoverage = estimateTokenCoverage(
      claimTokens,
      topMatches.map((item) => item.tokens)
    )
    const claimHasQuantitativeSignal = hasQuantitativeSignal(claim.text)
    const supportHasQuantitativeSignal = topMatches.some((item) =>
      hasQuantitativeSignal(item.text)
    )

    if (paragraphIds.length === 0 || bestScore < 0.22) {
      risks.push({
        claimId: claim.claimId,
        severity: 'HIGH',
        paragraphIds: [],
        reason: `主張を直接裏づける本文段落が見つかりません（一致度最大 ${toPercent(
          bestScore
        )}）。対応する実験結果・比較結果・引用を明示してください。`
      })
      continue
    }

    if (tokenCoverage < 0.3 || strongMatchCount === 0) {
      risks.push({
        claimId: claim.claimId,
        severity: 'MEDIUM',
        paragraphIds,
        reason: `対応段落はありますが、主張に対する根拠の対応範囲が狭いです（一致度平均 ${toPercent(
          topScoreAverage
        )} / カバー率 ${toPercent(tokenCoverage)}）。主張内の条件・結果に対応する記述を追加してください。`
      })
      continue
    }

    if (claimHasQuantitativeSignal && !supportHasQuantitativeSignal) {
      risks.push({
        claimId: claim.claimId,
        severity: 'MEDIUM',
        paragraphIds,
        reason:
          '主張は数値・比較を含みますが、根拠段落に定量情報が不足しています。比較対象・評価条件・数値結果を追記してください。'
      })
      continue
    }

    if (bestScore < 0.58 || paragraphIds.length < 2) {
      risks.push({
        claimId: claim.claimId,
        severity: 'LOW',
        paragraphIds,
        reason: `根拠は存在しますが、裏づけ密度が十分ではありません（一致度最大 ${toPercent(
          bestScore
        )}）。主張に対する直接根拠をもう1段落以上追加すると安全です。`
      })
    }
  }

  return { risks }
}

const estimateTokenCoverage = (claimTokens: string[], matchedTokenLists: string[][]): number => {
  if (claimTokens.length === 0) return 0
  const matchedSet = new Set(matchedTokenLists.flat())
  let covered = 0
  for (const token of claimTokens) {
    if (matchedSet.has(token)) covered += 1
  }
  return covered / claimTokens.length
}

const toPercent = (value: number): string => `${Math.round(Math.max(0, value) * 100)}%`

const hasQuantitativeSignal = (text: string): boolean =>
  /(?:\d+(\.\d+)?%?|\b[0-9]+\b|倍|秒|ms|fps|精度|accuracy|auc|f1|bleu|p値|有意|比較)/i.test(text)

const tokenize = (text: string): string[] => {
  const lowered = text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9faf]+/gi, ' ')
    .trim()

  if (!lowered) return []

  return lowered
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token))
}

const overlapScore = (claimTokens: string[], paragraphTokens: string[]): number => {
  if (claimTokens.length === 0 || paragraphTokens.length === 0) return 0
  const paragraphSet = new Set(paragraphTokens)
  let matched = 0
  for (const token of claimTokens) {
    if (paragraphSet.has(token)) matched += 1
  }
  return matched / claimTokens.length
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'from',
  'into',
  'using',
  'used',
  'our',
  'are',
  'was',
  'were',
  'than',
  'have',
  'has',
  'had',
  'also',
  'then',
  'their',
  'there',
  'about',
  'ため',
  'こと',
  'これ',
  'それ',
  'および',
  'また',
  'する',
  'した',
  'して',
  'ある',
  'ない'
])
