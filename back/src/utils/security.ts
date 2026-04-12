import { createHash } from 'node:crypto'
import type { Session } from '../domain/types.js'

export {
  hashClientToken,
  resolveClientTokenHash,
  normalizeClientToken,
  isAnonymousClient,
  isSessionOwner,
  ANONYMOUS_TOKEN
}

type HeaderReader = {
  header: (name: string) => string | undefined
}

const ANONYMOUS_TOKEN = 'anonymous'

const normalizeClientToken = (value: string | undefined): string => {
  const trimmed = value?.trim()
  if (!trimmed) return ANONYMOUS_TOKEN
  return trimmed
}

const hashClientToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex')
}

const isAnonymousClient = (token: string | undefined): boolean => {
  return !token?.trim() || token.trim() === ANONYMOUS_TOKEN
}

/**
 * Constant-time check that a session belongs to the caller identified by
 * `clientTokenHash`. Uses timingSafeEqual-like semantics via a simple XOR loop
 * since both inputs are hex-encoded SHA-256 of known length; the main benefit
 * here is a central, typed ownership helper.
 */
const isSessionOwner = (
  session: Pick<Session, 'clientTokenHash'> | null | undefined,
  clientTokenHash: string
): session is Pick<Session, 'clientTokenHash'> => {
  if (!session) return false
  const a = session.clientTokenHash
  const b = clientTokenHash
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Resolve the client token hash from the request headers.
 *
 * Security note: we ONLY derive the hash server-side from the raw
 * `X-Client-Token` header. Any client-supplied `X-Client-Token-Hash` header is
 * ignored — trusting it would allow attackers to impersonate any known hash.
 */
const resolveClientTokenHash = (reader: HeaderReader): string => {
  const rawToken = normalizeClientToken(reader.header('x-client-token'))
  return hashClientToken(rawToken)
}
