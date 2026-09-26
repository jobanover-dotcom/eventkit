import { isAppError, ACTION_ERROR_CODES } from './errors'
import { type ActionFailure, actionFail } from './action-result'
import { logger } from './logger'

const INTERNAL_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/**
 * The single place an application failure becomes a client-safe result. Server
 * Actions call this instead of returning raw PostgREST/Supabase errors, so stack
 * traces, SQL text, and internal hostnames never cross the boundary.
 */
export function toActionResult(error: unknown): ActionFailure {
  if (isAppError(error)) {
    return actionFail(error.code, error.message, error.fieldErrors)
  }

  logger.error('unhandled_error', { detail: describe(error) })
  return actionFail(ACTION_ERROR_CODES.INTERNAL_ERROR, INTERNAL_ERROR_MESSAGE)
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return 'non-error thrown'
}
