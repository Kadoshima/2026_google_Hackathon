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
        score: overlapScore(claimTokens, paragraph.tokens)
      }))
      .sort((left, right) => right.score - left.score)

    const strongMatches = scored.filter((item) => item.score >= 0.34)
    const paragraphIds = strongMatches.slice(0, 3).map((item) => item.paragraphId)
    const bestScore = scored[0]?.score ?? 0

    if (paragraphIds.length === 0) {
      risks.push({
        claimId: claim.claimId,
        severity: 'HIGH',
        paragraphIds: [],
        reason: 'No paragraph appears to support this claim with sufficient lexical overlap.'
      })
      continue
    }

    if (bestScore < 0.45 || paragraphIds.length === 1) {
      risks.push({
        claimId: claim.claimId,
        severity: 'MEDIUM',
        paragraphIds,
        reason:
          'Evidence coverage is weak: claim wording only partially aligns with a small set of paragraphs.'
      })
      continue
    }

    if (bestScore < 0.62) {
      risks.push({
        claimId: claim.claimId,
        severity: 'LOW',
        paragraphIds,
        reason: 'Evidence exists, but stronger and more explicit support is recommended.'
      })
    }
  }

  return { risks }
}

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
