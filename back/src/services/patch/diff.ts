export { buildUnifiedDiff, summarizeUnifiedDiff }
export type { BuildUnifiedDiffInput, DiffSummary }

type BuildUnifiedDiffInput = {
  analysisId: string
  acceptedTodos: string[]
}

type DiffSummary = {
  files: number
  hunks: number
}

const buildUnifiedDiff = (input: BuildUnifiedDiffInput): string => {
  const safeTodos = input.acceptedTodos
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  const filePath = `docs/analysis_${input.analysisId}.md`
  const bodyLines =
    safeTodos.length > 0
      ? safeTodos.map((todo) => `+- [ ] ${todo}`)
      : ['+<!-- no accepted todos -->']

  return [
    `diff --git a/${filePath} b/${filePath}`,
    'index 0000000..1111111 100644',
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${bodyLines.length} @@`,
    ...bodyLines,
    ''
  ].join('\n')
}

const summarizeUnifiedDiff = (diffText: string): DiffSummary => {
  const files = diffText
    .split('\n')
    .filter((line) => line.startsWith('diff --git ')).length
  const hunks = diffText
    .split('\n')
    .filter((line) => line.startsWith('@@ ')).length

  return { files, hunks }
}
