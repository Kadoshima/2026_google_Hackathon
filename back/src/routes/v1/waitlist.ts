import type { Hono } from 'hono'
import { firestore } from '../../services/firestore.repo.js'
import { buildError } from '../../utils/errors.js'
import { makeId } from '../../utils/ids.js'

type WaitlistPlan = 'PRO' | 'TEAM' | 'ENTERPRISE'

type WaitlistRequest = {
  email?: unknown
  plan?: unknown
  useCase?: unknown
  company?: unknown
  source?: unknown
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL = 320
const MAX_USE_CASE = 1000
const MAX_COMPANY = 200
const MAX_SOURCE = 80
const VALID_PLANS: WaitlistPlan[] = ['PRO', 'TEAM', 'ENTERPRISE']

const sanitizeString = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.slice(0, max)
}

const isValidPlan = (value: unknown): value is WaitlistPlan =>
  typeof value === 'string' && (VALID_PLANS as string[]).includes(value)

export const registerWaitlistRoutes = (app: Hono) => {
  app.post('/waitlist', async (c) => {
    let body: WaitlistRequest
    try {
      body = (await c.req.json()) as WaitlistRequest
    } catch {
      return c.json(buildError('INVALID_INPUT', 'body must be JSON'), 400)
    }

    const email = sanitizeString(body.email, MAX_EMAIL)
    if (!email || !EMAIL_RE.test(email)) {
      return c.json(buildError('INVALID_INPUT', 'valid email is required'), 400)
    }

    if (!isValidPlan(body.plan)) {
      return c.json(
        buildError('INVALID_INPUT', 'plan must be one of PRO, TEAM, ENTERPRISE'),
        400
      )
    }

    const useCase = sanitizeString(body.useCase, MAX_USE_CASE)
    const company = sanitizeString(body.company, MAX_COMPANY)
    const source = sanitizeString(body.source, MAX_SOURCE)
    const waitlistId = makeId('wait')
    const createdAt = new Date().toISOString()

    const doc: Record<string, string> = {
      waitlistId,
      email: email.toLowerCase(),
      plan: body.plan,
      createdAt
    }
    if (useCase) doc.useCase = useCase
    if (company) doc.company = company
    if (source) doc.source = source

    try {
      await firestore.collection('waitlist').doc(waitlistId).set(doc)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to record waitlist entry', {
          message: error instanceof Error ? error.message : 'unknown'
        }),
        500
      )
    }

    return c.json(
      {
        waitlist_id: waitlistId,
        status: 'RECEIVED',
        message: 'お申し込みありがとうございます。リリース時にご連絡します。'
      },
      201
    )
  })
}
