import { describe, expect, it } from 'vitest'
import { ACTION_ERROR_CODES, AppError, type ActionErrorCode } from '@/lib/errors'
import { isHiddenPageError } from './page-errors'

/**
 * The page-level error policy, asserted as a pure predicate.
 *
 * This is the regression guard for a bug that cost real time: a bare
 * `catch { notFound() }` turned a missing database column into a 404, so the
 * cause looked like "this event does not exist" and sent the reader looking in
 * the wrong layer entirely.
 */

const hidden = (code: ActionErrorCode) => new AppError(code, 'message')

describe('isHiddenPageError', () => {
  it('hides a missing event', () => {
    expect(isHiddenPageError(hidden(ACTION_ERROR_CODES.NOT_FOUND))).toBe(true)
  })

  it('hides a caller who is not allowed to see the page', () => {
    // A 404 rather than a 403, because a 403 would confirm the event exists.
    expect(isHiddenPageError(hidden(ACTION_ERROR_CODES.UNAUTHENTICATED))).toBe(true)
    expect(isHiddenPageError(hidden(ACTION_ERROR_CODES.FORBIDDEN))).toBe(true)
  })

  it('does not hide an internal error', () => {
    expect(isHiddenPageError(hidden(ACTION_ERROR_CODES.INTERNAL_ERROR))).toBe(false)
  })

  it('does not hide any other application code', () => {
    for (const code of [
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      ACTION_ERROR_CODES.CONFLICT,
      ACTION_ERROR_CODES.INVALID_QR,
      ACTION_ERROR_CODES.WRONG_EVENT,
      ACTION_ERROR_CODES.UPLOAD_REJECTED,
      ACTION_ERROR_CODES.CONFIG_MISSING,
    ]) {
      expect(isHiddenPageError(hidden(code))).toBe(false)
    }
  })

  it('does not hide a database fault', () => {
    // The exact failure that motivated this: a 42703 from PostgREST.
    expect(isHiddenPageError(new Error('column participants.organization does not exist'))).toBe(
      false
    )
  })

  it('does not hide a plain object that merely looks like an error', () => {
    for (const value of [null, undefined, 'boom', 42, {}, { code: 'NOT_FOUND' }]) {
      expect(isHiddenPageError(value)).toBe(false)
    }
  })
})
