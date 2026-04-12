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
    : 'この研究の新規性を、比較対象を含めて1文で説明してください。'
  const focusClaimText = llmInput?.focusClaimText ?? fallbackQuestion
  // When we have no extracted document text available, fall back to a
  // neutral placeholder instead of leaking internal IDs into the prompt.
  // Leaking analysisId / focusClaimId would only produce garbage questions.
  const extractedText =
    llmInput?.extractedText ?? '(no extracted document available)'

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

  // Heuristic answer scoring. We deliberately avoid a pure char-count
  // threshold ("80 chars = pass") because that is gameable with noise.
  // Combine multiple weak signals: length, presence of numeric evidence,
  // comparison language, and citation-like markers.
  const hasNumbers = /\d+(\.\d+)?\s*(%|ms|s|min|px|MB|GB|倍|件|本|名)?/.test(
    normalizedAnswer
  )
  const hasComparison = /(比較|対比|ベースライン|従来|既存|baseline|compared?|than|vs\.?)/i.test(
    normalizedAnswer
  )
  const hasEvidenceRef = /(図|表|節|段落|Fig\.?|Table|Section|§|p\.?\s*\d+)/i.test(
    normalizedAnswer
  )
  const longEnough = normalizedAnswer.length >= 60
  const passSignals =
    (longEnough ? 1 : 0) +
    (hasNumbers ? 1 : 0) +
    (hasComparison ? 1 : 0) +
    (hasEvidenceRef ? 1 : 0)

  // Require at least 3 of 4 signals to "pass" the heuristic check.
  const pass = passSignals >= 3

  const missing: string[] = []
  if (!longEnough) missing.push('十分な説明量')
  if (!hasNumbers) missing.push('定量的な根拠(数値・単位)')
  if (!hasComparison) missing.push('比較対象(ベースラインや従来手法)')
  if (!hasEvidenceRef) missing.push('根拠の参照(図/表/節/段落)')

  const reason = pass
    ? '主張の骨子は明確です。次は根拠の定量性と比較範囲をさらに絞り込みましょう。'
    : `回答に不足している要素があります: ${missing.join('、')}。これらを1文ずつ補強してください。`

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
