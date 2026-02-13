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
  void input
  // TODO(BE-056): generate retrieval-friendly prior-art queries per claim.
  return { queries: [] }
}
