import type { Hono } from 'hono'
import type { UploadMetadata, UploadResponse } from 'shared'
import { ArtifactType, InputType, RetentionMode } from '../../domain/enums.js'
import type { RetentionPolicy } from '../../domain/types.js'
import {
  createSession,
  createSubmission
} from '../../services/firestore.repo.js'
import { putRawFile } from '../../services/storage.service.js'
import { buildError } from '../../utils/errors.js'
import { makeId } from '../../utils/ids.js'
import { createFixedWindowRateLimiter } from '../../utils/rateLimit.js'
import { resolveClientTokenHash } from '../../utils/security.js'

const uploadRateLimiter = createFixedWindowRateLimiter({
  maxRequests: Number(process.env.UPLOAD_RATE_LIMIT_MAX ?? 20),
  windowMs: Number(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS ?? 60_000)
})

export const registerUploadRoutes = (app: Hono) => {
  app.post('/upload', async (c) => {
    const clientTokenHash = resolveClientTokenHash(c.req)
    try {
      uploadRateLimiter.check(`upload:${clientTokenHash}`)
    } catch (error) {
      return c.json(
        buildError('RATE_LIMITED', 'too many upload requests', {
          message: error instanceof Error ? error.message : 'rate limit exceeded'
        }),
        429
      )
    }

    const contentType = c.req.header('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return c.json(
        buildError(
          'INVALID_INPUT',
          'content-type must be multipart/form-data for upload'
        ),
        400
      )
    }

    let body: Awaited<ReturnType<typeof c.req.parseBody>>
    try {
      body = await c.req.parseBody({ all: true })
    } catch {
      return c.json(
        buildError('INVALID_INPUT', 'invalid multipart body'),
        400
      )
    }
    const fileValue = takeFirst(body.file)

    if (!isUploadedFile(fileValue)) {
      return c.json(
        buildError('INVALID_INPUT', 'file is required in multipart body'),
        400
      )
    }

    const metadataResult = parseMetadata(takeFirst(body.metadata))
    if (!metadataResult.ok) {
      return c.json(
        buildError('INVALID_INPUT', metadataResult.message),
        400
      )
    }

    const inputType = detectInputType(fileValue.name)
    if (!inputType) {
      return c.json(
        buildError('INVALID_INPUT', 'file extension must be .zip or .pdf'),
        400
      )
    }
    const artifactType = metadataResult.value.artifactType ?? ArtifactType.PAPER
    if (artifactType !== ArtifactType.PAPER) {
      return c.json(
        buildError(
          'INVALID_INPUT',
          `artifactType ${artifactType} is not supported by /v1/upload yet (currently PAPER only)`
        ),
        400
      )
    }

    const sessionId = makeId('sess')
    const submissionId = makeId('sub')
    const uploadId = makeId('upl')

    const retentionPolicy: RetentionPolicy = metadataResult.value.retentionPolicy ?? {
      mode: RetentionMode.NO_SAVE
    }

    try {
      const data = Buffer.from(await fileValue.arrayBuffer())
      const gcsPathRaw = await putRawFile({
        sessionId,
        submissionId,
        fileName: fileValue.name,
        contentType: fileValue.type || defaultContentType(inputType),
        data
      })

      await createSession({
        sessionId,
        clientTokenHash,
        retentionPolicy,
        ...(metadataResult.value.language
          ? { language: metadataResult.value.language }
          : {}),
        ...(metadataResult.value.domainTag
          ? { domainTag: metadataResult.value.domainTag }
          : {})
      })

      await createSubmission({
        submissionId,
        sessionId,
        artifactType,
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
        buildError('INTERNAL_ERROR', 'failed to persist upload', {
          message: error instanceof Error ? error.message : 'unknown error'
        }),
        500
      )
    }
  })
}

type UploadedFile = {
  name: string
  type: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

type ParseMetadataSuccess = { ok: true; value: UploadMetadata }
type ParseMetadataFailure = { ok: false; message: string }
type ParseMetadataResult = ParseMetadataSuccess | ParseMetadataFailure

const takeFirst = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value

const isUploadedFile = (value: unknown): value is UploadedFile => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as UploadedFile
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.arrayBuffer === 'function'
  )
}

const detectInputType = (fileName: string): InputType | null => {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.zip')) return InputType.LATEX_ZIP
  if (lower.endsWith('.pdf')) return InputType.PDF
  return null
}

const defaultContentType = (inputType: InputType): string => {
  if (inputType === InputType.PDF) return 'application/pdf'
  return 'application/zip'
}

const parseMetadata = (value: unknown): ParseMetadataResult => {
  if (value === undefined) return { ok: true, value: {} }
  if (typeof value !== 'string') {
    return { ok: false, message: 'metadata must be a JSON string' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return { ok: false, message: 'metadata is not valid JSON' }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'metadata must be a JSON object' }
  }

  const record = parsed as Record<string, unknown>
  const artifactType = record.artifactType
  const language = record.language
  const domainTag = record.domainTag
  const retentionPolicy = record.retentionPolicy

  if (artifactType !== undefined && !isArtifactType(artifactType)) {
    return { ok: false, message: 'metadata.artifactType must be PAPER|PR|DOC|SHEET' }
  }

  if (language !== undefined && typeof language !== 'string') {
    return { ok: false, message: 'metadata.language must be string' }
  }

  if (domainTag !== undefined && typeof domainTag !== 'string') {
    return { ok: false, message: 'metadata.domainTag must be string' }
  }

  const parsedRetention = parseRetentionPolicy(retentionPolicy)
  if (!parsedRetention.ok) {
    return parsedRetention
  }

  return {
    ok: true,
    value: {
      ...(artifactType ? { artifactType } : {}),
      ...(language ? { language } : {}),
      ...(domainTag ? { domainTag } : {}),
      ...(parsedRetention.value ? { retentionPolicy: parsedRetention.value } : {})
    }
  }
}

const parseRetentionPolicy = (
  value: unknown
): { ok: true; value?: RetentionPolicy } | ParseMetadataFailure => {
  if (value === undefined) return { ok: true }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'metadata.retentionPolicy must be object' }
  }

  const record = value as Record<string, unknown>
  const mode = record.mode
  const ttlHours = record.ttlHours

  if (mode !== RetentionMode.NO_SAVE && mode !== RetentionMode.SAVE) {
    return {
      ok: false,
      message: 'metadata.retentionPolicy.mode must be NO_SAVE or SAVE'
    }
  }

  if (ttlHours !== undefined && typeof ttlHours !== 'number') {
    return { ok: false, message: 'metadata.retentionPolicy.ttlHours must be number' }
  }

  return {
    ok: true,
    value: {
      mode,
      ...(ttlHours !== undefined ? { ttlHours } : {})
    }
  }
}

const isArtifactType = (value: unknown): value is ArtifactType => {
  return (
    value === ArtifactType.PAPER ||
    value === ArtifactType.PR ||
    value === ArtifactType.DOC ||
    value === ArtifactType.SHEET
  )
}
