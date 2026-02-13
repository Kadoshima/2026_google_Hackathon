import { GoogleAuth } from 'google-auth-library'

export { runPrompt, setVertexTransport }

export type OutputSchema<T> =
  | { parse: (value: unknown) => T }
  | ((value: unknown) => T)

export type RunPromptOptions = {
  timeoutMs?: number
  maxRetries?: number
  retryDelayMs?: number
  temperature?: number
  model?: string
}

export type VertexRequest = {
  prompt: string
  model: string
  projectId: string
  location: string
  temperature: number
}

export type VertexTransport = (
  request: VertexRequest,
  signal: AbortSignal
) => Promise<unknown>

type ResolvedRunPromptOptions = {
  timeoutMs: number
  maxRetries: number
  retryDelayMs: number
  temperature: number
  model: string
}

const DEFAULT_TIMEOUT_MS = Number(process.env.VERTEX_TIMEOUT_MS ?? 20000)
const DEFAULT_MAX_RETRIES = Number(process.env.VERTEX_MAX_RETRIES ?? 2)
const DEFAULT_RETRY_DELAY_MS = Number(process.env.VERTEX_RETRY_DELAY_MS ?? 300)
const DEFAULT_TEMPERATURE = Number(process.env.VERTEX_TEMPERATURE ?? 0.2)
const DEFAULT_MODEL = process.env.VERTEX_MODEL ?? 'gemini-2.0-flash-lite'
const DEFAULT_LOCATION = process.env.VERTEX_LOCATION ?? 'us-central1'
const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

const auth = new GoogleAuth({
  scopes: [VERTEX_SCOPE]
})

let vertexTransport: VertexTransport = defaultVertexTransport

const setVertexTransport = (transport: VertexTransport): void => {
  vertexTransport = transport
}

async function defaultVertexTransport(
  request: VertexRequest,
  signal: AbortSignal
): Promise<unknown> {
  const accessToken = await auth.getAccessToken()
  if (!accessToken) {
    throw new Error('failed to acquire Google access token for Vertex API')
  }

  const response = await fetch(buildVertexEndpoint(request), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: request.prompt }]
        }
      ],
      generationConfig: {
        temperature: request.temperature
      },
      responseMimeType: 'application/json'
    }),
    signal
  })

  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(
      `Vertex API ${response.status}: ${extractErrorMessage(payload)}`
    )
  }

  const text = extractCandidateText(payload)
  if (text.trim().length === 0) {
    throw new Error('Vertex API returned empty candidate text')
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Vertex API candidate is not valid JSON')
  }
}

const runPrompt = async <T>(
  prompt: string,
  schema: OutputSchema<T>,
  options: RunPromptOptions = {}
): Promise<T> => {
  if (prompt.trim().length === 0) {
    throw new Error('prompt must not be empty')
  }

  const resolved = resolveOptions(options)
  const projectId = process.env.VERTEX_PROJECT_ID ?? process.env.GCP_PROJECT_ID
  if (!projectId) {
    throw new Error('VERTEX_PROJECT_ID or GCP_PROJECT_ID is required')
  }

  const request: VertexRequest = {
    prompt,
    model: resolved.model,
    projectId,
    location: DEFAULT_LOCATION,
    temperature: resolved.temperature
  }

  let lastError: unknown = null
  const maxAttempts = resolved.maxRetries + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const raw = await withTimeout(resolved.timeoutMs, (signal) =>
        vertexTransport(request, signal)
      )
      return applySchema(schema, raw)
    } catch (error) {
      lastError = error
      if (!shouldRetry(error) || attempt === maxAttempts) {
        break
      }
      await sleep(backoffMs(resolved.retryDelayMs, attempt))
    }
  }

  throw new Error(
    `runPrompt failed after ${maxAttempts} attempts: ${toErrorMessage(lastError)}`
  )
}

const resolveOptions = (
  options: RunPromptOptions
): ResolvedRunPromptOptions => ({
  timeoutMs: sanitizeInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
  maxRetries: sanitizeInteger(options.maxRetries, DEFAULT_MAX_RETRIES),
  retryDelayMs: sanitizeInteger(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS),
  temperature: sanitizeTemperature(options.temperature, DEFAULT_TEMPERATURE),
  model: options.model?.trim() || DEFAULT_MODEL
})

const buildVertexEndpoint = (request: VertexRequest): string =>
  `https://${request.location}-aiplatform.googleapis.com/v1/projects/${request.projectId}/locations/${request.location}/publishers/google/models/${request.model}:generateContent`

const sanitizeInteger = (value: number | undefined, fallback: number): number => {
  if (value === undefined) return fallback
  const normalized = Math.floor(value)
  return normalized >= 0 ? normalized : fallback
}

const sanitizeTemperature = (
  value: number | undefined,
  fallback: number
): number => {
  if (value === undefined) return fallback
  if (Number.isNaN(value)) return fallback
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

const withTimeout = async <T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await task(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`runPrompt timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const applySchema = <T>(schema: OutputSchema<T>, value: unknown): T => {
  if (typeof schema === 'function') {
    return schema(value)
  }
  return schema.parse(value)
}

const shouldRetry = (error: unknown): boolean => {
  const message = toErrorMessage(error).toLowerCase()
  return (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('503')
  )
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const backoffMs = (baseDelayMs: number, attempt: number): number => {
  const cappedAttempt = Math.min(attempt, 6)
  const exponential = baseDelayMs * 2 ** (cappedAttempt - 1)
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelayMs / 2)))
  return exponential + jitter
}

const readJson = async (response: Response): Promise<unknown> => {
  const raw = await response.text()
  if (raw.length === 0) {
    return {}
  }
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { raw }
  }
}

const extractErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'unknown error'
  }
  const record = payload as Record<string, unknown>
  const error = record.error
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    return 'unknown error'
  }
  const errorRecord = error as Record<string, unknown>
  const message = errorRecord.message
  if (typeof message === 'string' && message.length > 0) {
    return message
  }
  return 'unknown error'
}

const extractCandidateText = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Vertex API payload must be an object')
  }

  const candidates = (payload as Record<string, unknown>).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Vertex API payload has no candidates')
  }

  const first = candidates[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    throw new Error('Vertex API candidate is invalid')
  }

  const content = (first as Record<string, unknown>).content
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Vertex API candidate content is missing')
  }

  const parts = (content as Record<string, unknown>).parts
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('Vertex API candidate parts are missing')
  }

  const part = parts[0]
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    throw new Error('Vertex API candidate part is invalid')
  }

  const text = (part as Record<string, unknown>).text
  if (typeof text !== 'string') {
    throw new Error('Vertex API candidate text is missing')
  }

  return text
}
