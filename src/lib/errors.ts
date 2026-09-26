/**
 * Stable, public error codes. Client behavior routes on `code`, never on `message`.
 * Registered in docs/api/errors.md — keep both in sync.
 */
export const ACTION_ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_QR: 'INVALID_QR',
  WRONG_EVENT: 'WRONG_EVENT',
  UPLOAD_REJECTED: 'UPLOAD_REJECTED',
  CONFIG_MISSING: 'CONFIG_MISSING',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[keyof typeof ACTION_ERROR_CODES]

export type FieldErrors = Record<string, string[]>

/**
 * Application-level failure raised by services. Carries no HTTP concern: the
 * transport or server-action layer converts it into a safe `ActionResult`.
 */
export class AppError extends Error {
  readonly code: ActionErrorCode
  readonly fieldErrors?: FieldErrors

  constructor(
    code: ActionErrorCode,
    message: string,
    options: { fieldErrors?: FieldErrors; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    if (options.fieldErrors) this.fieldErrors = options.fieldErrors
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}
