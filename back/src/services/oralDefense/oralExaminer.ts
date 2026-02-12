import type { OralAskRequest, OralAskResponse } from 'shared'

export const nextQuestion = async (
  analysisId: string,
  context?: OralAskRequest['context']
): Promise<OralAskResponse> => {
  void analysisId
  void context

  return {
    question: 'Please summarize the core novelty of your claim in one sentence.',
    follow_up: false
  }
}
