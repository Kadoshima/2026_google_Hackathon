import { createHash } from 'node:crypto'

export { hashClientToken, resolveClientTokenHash, normalizeClientToken }

type HeaderReader = {
  header: (name: string) => string | undefined
}

const normalizeClientToken = (value: string | undefined): string => {
  const trimmed = value?.trim()
  if (!trimmed) return 'anonymous'
  return trimmed
}

const hashClientToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex')
}

const resolveClientTokenHash = (reader: HeaderReader): string => {
  const explicitHash = reader.header('x-client-token-hash')?.trim()
  if (explicitHash) return explicitHash

  const rawToken = normalizeClientToken(reader.header('x-client-token'))
  return hashClientToken(rawToken)
}
