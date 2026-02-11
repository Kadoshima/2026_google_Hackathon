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
  void input
  // TODO(BE-054): call LLM with evidence prompt and map output to risks.
  return { risks: [] }
}
