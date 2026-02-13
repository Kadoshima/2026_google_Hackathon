import type { OralAskRequest, OralAskResponse } from 'shared'
import { runPrompt } from '../llm/vertex.client.js'
import { buildOralPrompt } from '../llm/prompts.js'
import { oralOutputSchema } from '../llm/jsonSchemas.js'

export const nextQuestion = async (
  analysisId: string,
  context?: OralAskRequest['context'],
  userAnswer?: string,
  llmInput?: {
    focusClaimText?: string
    extractedText?: string
  }
): Promise<OralAskResponse> => {
  const focusClaimId = context?.focus_claim_id
  const fallbackQuestion = focusClaimId
    ? `Claim ${focusClaimId} を支える実験条件と比較対象を、1文で具体化してください。`
    : 'Please summarize the core novelty of your claim in one sentence.'
  const focusClaimText = llmInput?.focusClaimText ?? fallbackQuestion
  const extractedText =
    llmInput?.extractedText ??
    `analysisId: ${analysisId}\nfocusClaimId: ${focusClaimId ?? '(none)'}`

  const question = await buildQuestionWithLlmOrFallback({
    focusClaimId: focusClaimId ?? 'claim_1',
    focusClaimText,
    extractedText,
    fallbackQuestion
  })

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

const buildQuestionWithLlmOrFallback = async (input: {
  focusClaimId: string
  focusClaimText: string
  extractedText: string
  fallbackQuestion: string
}): Promise<string> => {
  try {
    const prompt = buildOralPrompt({
      focusClaimId: input.focusClaimId,
      focusClaimText: input.focusClaimText,
      extractedText: input.extractedText
    })
    const output = await runPrompt(prompt, oralOutputSchema)
    if (output.question.trim().length === 0) {
      console.warn(
        JSON.stringify({
          event: 'llm_oral_question_fallback',
          reason: 'empty question'
        })
      )
      return input.fallbackQuestion
    }
    console.info(
      JSON.stringify({
        event: 'llm_oral_question_success'
      })
    )
    return output.question.trim()
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'llm_oral_question_fallback',
        reason: error instanceof Error ? error.message : 'unknown'
      })
    )
    return input.fallbackQuestion
  }
}
