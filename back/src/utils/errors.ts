import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const ErrorCodes = {
  INVALID_INPUT: 'INVALID_INPUT',
  ANALYSIS_NOT_FOUND: 'ANALYSIS_NOT_FOUND',
  SUBMISSION_NOT_FOUND: 'SUBMISSION_NOT_FOUND',
  ALREADY_PROCESSED_OR_LOCKED: 'ALREADY_PROCESSED_OR_LOCKED',
  INVALID_ZIP_PATH: 'INVALID_ZIP_PATH',
  DISALLOWED_FILE_TYPE: 'DISALLOWED_FILE_TYPE',
  ZIP_TOO_LARGE: 'ZIP_TOO_LARGE',
  ZIP_TOO_MANY_FILES: 'ZIP_TOO_MANY_FILES',
  ZIP_CORRUPTED: 'ZIP_CORRUPTED',
  INVALID_PDF: 'INVALID_PDF',
  STORAGE_NOT_FOUND: 'STORAGE_NOT_FOUND',
  WORKER_FAILED: 'WORKER_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes] | (string & {})

export type ErrorPayload = {
  error: {
    code: ErrorCode
    message: string
    details?: Record<string, unknown>
  }
}

export const buildError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ErrorPayload => {
  if (details) {
    return { error: { code, message, details } }
  }

  return { error: { code, message } }
}

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly status: ContentfulStatusCode
  public readonly details?: Record<string, unknown>

  constructor(
    code: ErrorCode,
    message: string,
    status: ContentfulStatusCode = 500,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    if (details) {
      this.details = details
    }
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError

export const toErrorResponse = (
  error: unknown,
  fallbackMessage = 'internal error'
): { status: ContentfulStatusCode; payload: ErrorPayload } => {
  if (isAppError(error)) {
    return {
      status: error.status,
      payload: buildError(error.code, error.message, error.details)
    }
  }

  return {
    status: 500,
    payload: buildError(ErrorCodes.INTERNAL_ERROR, fallbackMessage)
  }
}
