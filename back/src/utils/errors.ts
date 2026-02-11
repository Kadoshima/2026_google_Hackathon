export { buildError }

// TODO: implement error helpers
export type ErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'INTERNAL_ERROR'

export type ErrorPayload = {
    error : {
        code : ErrorCode
        message : string
        details?: Record<string, unknown>
    }
}

const buildError = (
    error: ErrorCode,
    message: string,
    details?: Record<string, unknown>
): ErrorPayload => {
    // TODO: info情報の入力
    const payload: ErrorPayload = {
        error : {
            code : error,
            message : message,
        }
    }
    if (details !== undefined){
        payload.error.details = details
    }

    return payload
}