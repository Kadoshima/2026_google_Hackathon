import type { OralAskRequest, OralAskResponse } from 'shared'

export const nextQuestion = async (
  analysisId: string,
  context?: OralAskRequest['context'],
  userAnswer?: string
): Promise<OralAskResponse> => {
  void analysisId

  const focusClaimId = context?.focus_claim_id
  const question = focusClaimId
    ? `Claim ${focusClaimId} を支える実験条件と比較対象を、1文で具体化してください。`
    : 'Please summarize the core novelty of your claim in one sentence.'

  const normalizedAnswer = userAnswer?.trim()
  if (!normalizedAnswer) {
    return {
      question,
      follow_up: false
    }
  }

  const pass = normalizedAnswer.length >= 80
  const reason = pass
    ? '主張の骨子は明確です。次は根拠の定量性を補強しましょう。'
    : '回答が短く根拠が不足しています。比較条件・数値・根拠段落を追加してください。'

  return {
    question,
    follow_up: !pass,
    evaluation: {
      pass,
      reason
    },
    draft_sentences: pass
      ? ['本研究の新規性は、従来法と比較して有効性を定量評価した点にあります。']
      : ['提案手法は既存手法と比較して、特定条件下で性能向上を示します。'],
    ...(!pass
      ? {
          todo_candidate: {
            title: '回答文に比較条件と定量根拠を追加',
            impact: 4,
            effort: 2
          }
        }
      : {})
  }
}
