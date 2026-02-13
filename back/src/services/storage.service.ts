import { AppError, ErrorCodes } from '../utils/errors.js'
import { Storage } from '@google-cloud/storage'

const storageProjectId = process.env.GCP_PROJECT_ID
const bucketName = process.env.BUCKET_NAME

const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600

const assertSafeObjectPath = (objectPath: string): string => {
  const normalized = objectPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('\0')) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'invalid storage path', 400, { objectPath })
  }

  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '..')) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'unsafe storage path', 400, { objectPath })
  }

  return normalized
}

type StorageServiceOptions = {
  bucketName?: string
}

export type PutRawFileInput = {
  sessionId: string
  submissionId: string
  fileName: string
  contentType: string
  data: Buffer
}

export type PutJsonInput = {
  objectPath: string
  json: string
}

export class StorageService {
  private readonly bucketName: string
  private readonly storage: Storage

  constructor(options: StorageServiceOptions = {}) {
    this.bucketName = options.bucketName ?? process.env.BUCKET_NAME ?? ''
    if (!this.bucketName) {
      throw new Error('BUCKET_NAME is required')
    }

    this.storage = new Storage({
      ...(storageProjectId ? { projectId: storageProjectId } : {})
    })
  }

  toGsPath(objectPath: string): string {
    return `gs://${this.bucketName}/${assertSafeObjectPath(objectPath)}`
  }

  async putRawFile(
    objectPath: string,
    content: Buffer | Uint8Array | string,
    contentType?: string
  ): Promise<string> {
    const normalizedPath = assertSafeObjectPath(objectPath)
    await this.storage.bucket(this.bucketName).file(normalizedPath).save(content, {
      ...(contentType ? { contentType } : {}),
      resumable: false
    })
    return this.toGsPath(normalizedPath)
  }

  async putJson(objectPath: string, value: unknown): Promise<string> {
    const normalizedPath = assertSafeObjectPath(objectPath)
    await this.storage
      .bucket(this.bucketName)
      .file(normalizedPath)
      .save(`${JSON.stringify(value, null, 2)}\n`, {
        contentType: 'application/json',
        resumable: false
      })
    return this.toGsPath(normalizedPath)
  }

  private isGcsNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    if ('code' in error && (error as { code?: unknown }).code === 404) return true
    return false
  }

  async readAsBuffer(pathOrGs: string): Promise<Buffer> {
    const objectPath = this.toObjectPath(pathOrGs)

    try {
      const [buffer] = await this.storage.bucket(this.bucketName).file(objectPath).download()
      return buffer
    } catch (error) {
      if (this.isGcsNotFound(error)) {
        throw new AppError(ErrorCodes.STORAGE_NOT_FOUND, 'storage object not found', 404, {
          objectPath
        })
      }
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'failed to read storage object', 500, {
        objectPath,
        reason: error instanceof Error ? error.message : 'unknown'
      })
    }
  }

  async readJson<T>(pathOrGs: string): Promise<T> {
    const raw = await this.readAsBuffer(pathOrGs)
    return JSON.parse(raw.toString('utf8')) as T
  }

  async getSignedUrl(pathOrGs: string, ttlSeconds?: number): Promise<string> {
    const objectPath = this.toObjectPath(pathOrGs)
    const ttl =
      ttlSeconds ?? Number(process.env.SIGNED_URL_TTL_SECONDS ?? DEFAULT_SIGNED_URL_TTL_SECONDS)
    const [signedUrl] = await this.storage.bucket(this.bucketName).file(objectPath).getSignedUrl({
      action: 'read',
      expires: Date.now() + ttl * 1000,
      version: 'v4'
    })
    return signedUrl
  }

  private toObjectPath(pathOrGs: string): string {
    if (pathOrGs.startsWith('gs://')) {
      const withoutScheme = pathOrGs.slice('gs://'.length)
      const firstSlash = withoutScheme.indexOf('/')
      if (firstSlash < 0) {
        throw new AppError(ErrorCodes.INVALID_INPUT, 'invalid gs path', 400, { pathOrGs })
      }
      const bucketName = withoutScheme.slice(0, firstSlash)
      const objectPath = withoutScheme.slice(firstSlash + 1)
      if (bucketName !== this.bucketName) {
        throw new AppError(ErrorCodes.INVALID_INPUT, 'bucket mismatch', 400, {
          expected: this.bucketName,
          actual: bucketName
        })
      }
      return assertSafeObjectPath(objectPath)
    }

    return assertSafeObjectPath(pathOrGs)
  }
}

export const storage = new Storage({
  ...(storageProjectId ? { projectId: storageProjectId } : {})
})

const requireBucketName = (): string => {
  if (!bucketName) {
    throw new Error('BUCKET_NAME is required')
  }
  return bucketName
}

const sanitizeFilename = (filename: string): string =>
  filename.replace(/[^a-zA-Z0-9._-]/g, '_')

const parseGsPath = (gsPath: string): { bucket: string; objectPath: string } => {
  if (!gsPath.startsWith('gs://')) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'invalid gs path', 400, { gsPath })
  }

  const withoutScheme = gsPath.slice('gs://'.length)
  const firstSlash = withoutScheme.indexOf('/')
  if (firstSlash < 0) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'invalid gs path', 400, { gsPath })
  }

  const bucket = withoutScheme.slice(0, firstSlash)
  const objectPath = withoutScheme.slice(firstSlash + 1)
  if (!bucket) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'invalid gs path', 400, { gsPath })
  }

  return {
    bucket,
    objectPath: assertSafeObjectPath(objectPath)
  }
}

export const putRawFile = async (input: PutRawFileInput): Promise<string> => {
  const bucket = requireBucketName()
  const safeName = sanitizeFilename(input.fileName)
  const objectPath = `raw/${input.sessionId}/${input.submissionId}/${Date.now()}_${safeName}`

  await storage.bucket(bucket).file(objectPath).save(input.data, {
    contentType: input.contentType,
    resumable: false
  })

  return `gs://${bucket}/${objectPath}`
}

export const putJson = async (input: PutJsonInput): Promise<string> => {
  const bucket = requireBucketName()

  await storage.bucket(bucket).file(input.objectPath).save(input.json, {
    contentType: 'application/json',
    resumable: false
  })

  return `gs://${bucket}/${input.objectPath}`
}

export const getSignedUrl = async (gsPath: string): Promise<string> => {
  const { bucket, objectPath } = parseGsPath(gsPath)
  const ttlSeconds = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 900)

  const [signedUrl] = await storage.bucket(bucket).file(objectPath).getSignedUrl({
    action: 'read',
    expires: Date.now() + ttlSeconds * 1000,
    version: 'v4'
  })

  return signedUrl
}
