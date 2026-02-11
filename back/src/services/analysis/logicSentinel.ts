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
  void input
  // TODO(BE-055): detect contradictions, missing premises, and over-claims.
  return { risks: [] }
}
