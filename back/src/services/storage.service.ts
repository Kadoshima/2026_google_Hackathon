import { Storage } from '@google-cloud/storage'

const storageProjectId = process.env.GCP_PROJECT_ID
const bucketName = process.env.BUCKET_NAME

export const storage = new Storage({
  ...(storageProjectId ? { projectId: storageProjectId } : {})
})

const requireBucketName = (): string => {
  if (!bucketName) {
    throw new Error('BUCKET_NAME is required')
  }
  return bucketName
}

const parseGsPath = (gsPath: string): { bucket: string; objectPath: string } => {
  if (!gsPath.startsWith('gs://')) {
    throw new Error('gsPath must start with gs://')
  }

  const withoutScheme = gsPath.slice(5)
  const slashIndex = withoutScheme.indexOf('/')
  if (slashIndex < 0) {
    throw new Error('gsPath must include object path')
  }

  return {
    bucket: withoutScheme.slice(0, slashIndex),
    objectPath: withoutScheme.slice(slashIndex + 1)
  }
}

const sanitizeFilename = (filename: string): string =>
  filename.replace(/[^a-zA-Z0-9._-]/g, '_')

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
