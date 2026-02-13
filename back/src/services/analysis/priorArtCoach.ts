export { proposePriorArtQueries }
export type {
  PriorArtCoachInput,
  PriorArtCoachOutput,
  PriorArtQuery
}

type PriorArtCoachInput = {
  analysisId: string
  domainTag?: string
  claims: Array<{
    claimId: string
    text: string
  }>
}

type PriorArtQuery = {
  claimId: string
  query: string
  rationale: string
}

type PriorArtCoachOutput = {
  queries: PriorArtQuery[]
}

const proposePriorArtQueries = async (
  input: PriorArtCoachInput
): Promise<PriorArtCoachOutput> => {
  const queries = input.claims.map((claim) => {
    const keywords = pickKeywords(claim.text, 8)
    const domainPrefix = input.domainTag ? `${input.domainTag} ` : ''
    const query = `${domainPrefix}${keywords.join(' ')}`

    return {
      claimId: claim.claimId,
      query: query.trim(),
      rationale:
        'Focuses on the technical core terms in the claim and can be used directly for prior-art retrieval.'
    }
  })

  return { queries }
}

const pickKeywords = (text: string, limit: number): string[] => {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9faf]+/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token))

  const seen = new Set<string>()
  const ordered: string[] = []
  for (const token of tokens) {
    if (seen.has(token)) continue
    seen.add(token)
    ordered.push(token)
    if (ordered.length >= limit) break
  }

  return ordered.length > 0 ? ordered : ['research', 'method']
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'using',
  'into',
  'our',
  'are',
  'was',
  'were',
  'than',
  'have',
  'has',
  'also',
  'する',
  'した',
  'して',
  'こと',
  'これ',
  'それ',
  'ある',
  'ない'
])
