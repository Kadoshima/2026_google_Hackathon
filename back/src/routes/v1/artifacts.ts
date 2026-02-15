import type { Hono } from 'hono'
import type { ArtifactCreateRequest, UploadResponse } from 'shared'
import { ArtifactType, InputType, RetentionMode } from '../../domain/enums.js'
import type { RetentionPolicy } from '../../domain/types.js'
import { createSession, createSubmission } from '../../services/firestore.repo.js'
import { putRawFile } from '../../services/storage.service.js'
import { buildError } from '../../utils/errors.js'
import { makeId } from '../../utils/ids.js'
import { createFixedWindowRateLimiter } from '../../utils/rateLimit.js'
import { resolveClientTokenHash } from '../../utils/security.js'

type SupportedArtifactType = Exclude<ArtifactType, 'PAPER'>

type ArtifactFormat = 'plain' | 'markdown' | 'diff' | 'json'

type ParseSuccess = { ok: true; value: ArtifactCreateRequest }
type ParseFailure = { ok: false; message: string }
type ParseResult = ParseSuccess | ParseFailure

const artifactRateLimiter = createFixedWindowRateLimiter({
  maxRequests: Number(process.env.UPLOAD_RATE_LIMIT_MAX ?? 20),
  windowMs: Number(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS ?? 60_000)
})
const ARTIFACT_MIN_CHARS = Number(process.env.ARTIFACT_MIN_CHARS ?? 40)
const ARTIFACT_MAX_CHARS = Number(process.env.ARTIFACT_MAX_CHARS ?? 200_000)
const ARTIFACT_MAX_TITLE_CHARS = Number(process.env.ARTIFACT_MAX_TITLE_CHARS ?? 120)

export const registerArtifactRoutes = (app: Hono) => {
  app.post('/artifacts', async (c) => {
    const clientTokenHash = resolveClientTokenHash(c.req)
    try {
      artifactRateLimiter.check(`artifact:${clientTokenHash}`)
    } catch (error) {
      return c.json(
        buildError('RATE_LIMITED', 'too many artifact create requests', {
          message: error instanceof Error ? error.message : 'rate limit exceeded'
        }),
        429
      )
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(buildError('INVALID_INPUT', 'request body must be JSON'), 400)
    }

    const parsed = parseArtifactCreateRequest(body)
    if (!parsed.ok) {
      return c.json(buildError('INVALID_INPUT', parsed.message), 400)
    }

    if (parsed.value.artifact_type === ArtifactType.PAPER) {
      return c.json(
        buildError('INVALID_INPUT', 'PAPER artifact must use /v1/upload endpoint'),
        400
      )
    }

    const sessionId = makeId('sess')
    const submissionId = makeId('sub')
    const uploadId = makeId('upl')

    const retentionPolicy: RetentionPolicy = parsed.value.retentionPolicy ?? {
      mode: RetentionMode.NO_SAVE
    }

    try {
      const inputType = toInputType(parsed.value.artifact_type)
      const fileName = buildArtifactFileName(
        parsed.value.artifact_type,
        parsed.value.title,
        parsed.value.content_format
      )
      const gcsPathRaw = await putRawFile({
        sessionId,
        submissionId,
        fileName,
        contentType: toContentType(parsed.value.content_format),
        data: Buffer.from(parsed.value.content, 'utf8')
      })

      await createSession({
        sessionId,
        clientTokenHash,
        retentionPolicy,
        ...(parsed.value.language ? { language: parsed.value.language } : {}),
        ...(parsed.value.domainTag ? { domainTag: parsed.value.domainTag } : {})
      })

      await createSubmission({
        submissionId,
        sessionId,
        artifactType: parsed.value.artifact_type,
        inputType,
        gcsPathRaw
      })

      const response: UploadResponse = {
        session_id: sessionId,
        submission_id: submissionId,
        upload_id: uploadId
      }

      return c.json(response, 200)
    } catch (error) {
      return c.json(
        buildError('INTERNAL_ERROR', 'failed to persist artifact', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

const parseArtifactCreateRequest = (value: unknown): ParseResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'request body must be an object' }
  }

  const record = value as Record<string, unknown>
  const artifactType = record.artifact_type
  const content = record.content
  const title = record.title
  const contentFormat = record.content_format
  const sourceRef = record.source_ref
  const language = record.language
  const domainTag = record.domainTag
  const retentionPolicy = record.retentionPolicy

  if (!isArtifactType(artifactType)) {
    return { ok: false, message: 'artifact_type must be PAPER|PR|DOC|SHEET' }
  }

  if (typeof content !== 'string' || content.trim().length === 0) {
    return { ok: false, message: 'content must be a non-empty string' }
  }
  const contentChars = content.trim().length
  if (contentChars < Math.max(1, ARTIFACT_MIN_CHARS)) {
    return {
      ok: false,
      message: `content is too short (min ${ARTIFACT_MIN_CHARS} chars required)`
    }
  }
  if (contentChars > Math.max(ARTIFACT_MIN_CHARS, ARTIFACT_MAX_CHARS)) {
    return {
      ok: false,
      message: `content is too long (max ${ARTIFACT_MAX_CHARS} chars)`
    }
  }

  if (title !== undefined && typeof title !== 'string') {
    return { ok: false, message: 'title must be string' }
  }
  if (typeof title === 'string' && title.trim().length > ARTIFACT_MAX_TITLE_CHARS) {
    return {
      ok: false,
      message: `title is too long (max ${ARTIFACT_MAX_TITLE_CHARS} chars)`
    }
  }

  if (contentFormat !== undefined && !isArtifactFormat(contentFormat)) {
    return { ok: false, message: 'content_format must be plain|markdown|diff|json' }
  }
  if (!isFormatAllowedForType(artifactType, contentFormat)) {
    return {
      ok: false,
      message: `content_format ${String(contentFormat)} is not allowed for ${artifactType}`
    }
  }

  if (sourceRef !== undefined && typeof sourceRef !== 'string') {
    return { ok: false, message: 'source_ref must be string' }
  }
  if (typeof sourceRef === 'string' && sourceRef.trim().length > 240) {
    return { ok: false, message: 'source_ref is too long (max 240 chars)' }
  }

  if (language !== undefined && typeof language !== 'string') {
    return { ok: false, message: 'language must be string' }
  }

  if (domainTag !== undefined && typeof domainTag !== 'string') {
    return { ok: false, message: 'domainTag must be string' }
  }

  const parsedRetention = parseRetentionPolicy(retentionPolicy)
  if (!parsedRetention.ok) {
    return parsedRetention
  }

  return {
    ok: true,
    value: {
      artifact_type: artifactType,
      content,
      ...(title ? { title } : {}),
      ...(contentFormat ? { content_format: contentFormat } : {}),
      ...(sourceRef ? { source_ref: sourceRef } : {}),
      ...(language ? { language } : {}),
      ...(domainTag ? { domainTag } : {}),
      ...(parsedRetention.value ? { retentionPolicy: parsedRetention.value } : {})
    }
  }
}

const parseRetentionPolicy = (
  value: unknown
): { ok: true; value?: RetentionPolicy } | ParseFailure => {
  if (value === undefined) return { ok: true }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'retentionPolicy must be object' }
  }

  const record = value as Record<string, unknown>
  const mode = record.mode
  const ttlHours = record.ttlHours

  if (mode !== RetentionMode.NO_SAVE && mode !== RetentionMode.SAVE) {
    return { ok: false, message: 'retentionPolicy.mode must be NO_SAVE or SAVE' }
  }

  if (ttlHours !== undefined && typeof ttlHours !== 'number') {
    return { ok: false, message: 'retentionPolicy.ttlHours must be number' }
  }

  return {
    ok: true,
    value: {
      mode,
      ...(ttlHours !== undefined ? { ttlHours } : {})
    }
  }
}

const toInputType = (artifactType: SupportedArtifactType): InputType => {
  if (artifactType === ArtifactType.PR) return InputType.PR_TEXT
  if (artifactType === ArtifactType.DOC) return InputType.DOC_TEXT
  return InputType.SHEET_TEXT
}

const buildArtifactFileName = (
  artifactType: SupportedArtifactType,
  title: string | undefined,
  format: ArtifactFormat | undefined
): string => {
  const suffix = extensionFromFormat(format)
  const base = title?.trim() || `${artifactType.toLowerCase()}_artifact`
  return `${base}${suffix}`
}

const extensionFromFormat = (format: ArtifactFormat | undefined): string => {
  if (format === 'markdown') return '.md'
  if (format === 'diff') return '.diff'
  if (format === 'json') return '.json'
  return '.txt'
}

const toContentType = (format: ArtifactFormat | undefined): string => {
  if (format === 'markdown') return 'text/markdown; charset=utf-8'
  if (format === 'diff') return 'text/x-diff; charset=utf-8'
  if (format === 'json') return 'application/json'
  return 'text/plain; charset=utf-8'
}

const isArtifactType = (value: unknown): value is ArtifactType => {
  return (
    value === ArtifactType.PAPER ||
    value === ArtifactType.PR ||
    value === ArtifactType.DOC ||
    value === ArtifactType.SHEET
  )
}

const isArtifactFormat = (value: unknown): value is ArtifactFormat => {
  return value === 'plain' || value === 'markdown' || value === 'diff' || value === 'json'
}

const isFormatAllowedForType = (
  artifactType: ArtifactType,
  format: ArtifactFormat | undefined
): boolean => {
  if (!format) return true

  if (artifactType === ArtifactType.PR) {
    return format === 'plain' || format === 'markdown' || format === 'diff'
  }

  if (artifactType === ArtifactType.DOC) {
    return format === 'plain' || format === 'markdown'
  }

  if (artifactType === ArtifactType.SHEET) {
    return format === 'plain' || format === 'json'
  }

  // PAPER is handled by /v1/upload. Keep conservative.
  return format === 'plain'
}
