import type { Hono } from 'hono'
import type { OralAskRequest } from 'shared'
import type { AnalysisResultJson } from '../../domain/types.js'
import { RetentionMode } from '../../domain/enums.js'
import {
  getAnalysis,
  getSession,
  saveConversationTurn
} from '../../services/firestore.repo.js'
import { StorageService } from '../../services/storage.service.js'
import { nextQuestion } from '../../services/oralDefense/oralExaminer.js'
import { buildError } from '../../utils/errors.js'
import { makeId } from '../../utils/ids.js'

const storageService = new StorageService()

export const registerOralRoutes = (app: Hono) => {
  app.post('/oral/ask', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(buildError('INVALID_INPUT', 'request body must be JSON'), 400)
    }

    const parsed = parseOralAskRequest(body)
    if (!parsed.ok) {
      return c.json(buildError('INVALID_INPUT', parsed.message), 400)
    }

    try {
      const analysis = await getAnalysis({ analysisId: parsed.value.analysis_id })
      if (!analysis) {
        return c.json(buildError('NOT_FOUND', 'analysis not found'), 404)
      }

      const llmInput = await buildOralLlmInput(analysis, parsed.value.context?.focus_claim_id)
      const response = await nextQuestion(
        parsed.value.analysis_id,
        parsed.value.context,
        parsed.value.user_answer,
        llmInput
      )

      const shouldSave = await shouldPersistConversation(analysis.sessionId)
      if (shouldSave) {
        await persistConversation(parsed.value, response)
      }

      return c.json(response, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to generate oral response', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

const buildOralLlmInput = async (
  analysis: NonNullable<Awaited<ReturnType<typeof getAnalysis>>>,
  focusClaimId: string | undefined
): Promise<{ focusClaimText?: string; extractedText?: string }> => {
  const path = analysis.pointers?.gcsAnalysisJson
  if (!path) return {}

  try {
    const result = await storageService.readJson<AnalysisResultJson>(path)
    const claims = result.claims ?? []
    const focusClaimText = focusClaimId
      ? claims.find((claim) => claim.claimId === focusClaimId)?.text
      : claims[0]?.text
    const extractedText = claims
      .slice(0, 12)
      .map((claim) => `[${claim.claimId}] ${claim.text}`)
      .join('\n')

    return {
      ...(focusClaimText ? { focusClaimText } : {}),
      ...(extractedText ? { extractedText } : {})
    }
  } catch {
    return {}
  }
}

const shouldPersistConversation = async (sessionId: string): Promise<boolean> => {
  const session = await getSession({ sessionId })
  return session?.retentionPolicy.mode === RetentionMode.SAVE
}

const persistConversation = async (
  request: OralAskRequest,
  response: {
    question: string
    evaluation?: { pass: boolean; reason: string }
    draft_sentences?: string[]
  }
): Promise<void> => {
  if (request.user_answer?.trim()) {
    await saveConversationTurn({
      analysisId: request.analysis_id,
      turnId: request.turn_id,
      role: 'USER',
      type: 'ANSWER',
      content: request.user_answer
    })
  }

  await saveConversationTurn({
    analysisId: request.analysis_id,
    turnId: makeId('turn'),
    role: 'AI',
    type: 'QUESTION',
    content: response.question
  })

  if (response.evaluation) {
    await saveConversationTurn({
      analysisId: request.analysis_id,
      turnId: makeId('turn'),
      role: 'AI',
      type: 'EVAL',
      content: `${response.evaluation.pass ? 'PASS' : 'REVISE'}: ${response.evaluation.reason}`
    })
  }

  if (response.draft_sentences && response.draft_sentences.length > 0) {
    await saveConversationTurn({
      analysisId: request.analysis_id,
      turnId: makeId('turn'),
      role: 'AI',
      type: 'DRAFT',
      content: response.draft_sentences.join('\n')
    })
  }
}

const parseOralAskRequest = (
  value: unknown
): { ok: true; value: OralAskRequest } | { ok: false; message: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'request body must be an object' }
  }

  const record = value as Record<string, unknown>
  const analysisId = record.analysis_id
  const turnId = record.turn_id
  const userAnswer = record.user_answer
  const context = record.context

  if (typeof analysisId !== 'string' || analysisId.length === 0) {
    return { ok: false, message: 'analysis_id is required' }
  }
  if (typeof turnId !== 'string' || turnId.length === 0) {
    return { ok: false, message: 'turn_id is required' }
  }
  if (userAnswer !== undefined && typeof userAnswer !== 'string') {
    return { ok: false, message: 'user_answer must be string' }
  }
  if (
    context !== undefined &&
    (!context || typeof context !== 'object' || Array.isArray(context))
  ) {
    return { ok: false, message: 'context must be an object' }
  }

  const contextRecord = context as { focus_claim_id?: unknown } | undefined
  const focusClaimId = contextRecord?.focus_claim_id
  if (focusClaimId !== undefined && typeof focusClaimId !== 'string') {
    return { ok: false, message: 'context.focus_claim_id must be string' }
  }

  return {
    ok: true,
    value: {
      analysis_id: analysisId,
      turn_id: turnId,
      ...(userAnswer !== undefined ? { user_answer: userAnswer } : {}),
      ...(focusClaimId !== undefined
        ? { context: { focus_claim_id: focusClaimId } }
        : context !== undefined
          ? { context: {} }
          : {})
    }
  }
}
