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
        '主張の技術コア語を優先した検索式です。先行技術調査の初期クエリとして利用できます。'
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

  return ordered.length > 0 ? ordered : ['研究', '手法']
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
