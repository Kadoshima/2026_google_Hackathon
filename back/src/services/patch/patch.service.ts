import { buildUnifiedDiff, summarizeUnifiedDiff } from './diff.js'

export { generateUnifiedDiff }
export type { GenerateUnifiedDiffInput, GenerateUnifiedDiffResult }

type GenerateUnifiedDiffInput = {
  analysisId: string
  acceptedTodos: string[]
}

type GenerateUnifiedDiffResult = {
  diffText: string
  patchSummary: {
    files: number
    hunks: number
  }
}

const generateUnifiedDiff = (
  input: GenerateUnifiedDiffInput
): GenerateUnifiedDiffResult => {
  const diffText = buildUnifiedDiff({
    analysisId: input.analysisId,
    acceptedTodos: input.acceptedTodos
  })

  return {
    diffText,
    patchSummary: summarizeUnifiedDiff(diffText)
  }
}
