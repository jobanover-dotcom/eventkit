import { describe, expect, it, vi } from 'vitest'
import { toActionResult } from './action-error'
import { ACTION_ERROR_CODES, AppError } from './errors'

describe('toActionResult', () => {
  it('preserves an application error code and message', () => {
    const result = toActionResult(new AppError(ACTION_ERROR_CODES.NOT_FOUND, 'Event not found.'))

    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Event not found.' },
    })
  })

  it('preserves field errors for form rendering', () => {
    const result = toActionResult(
      new AppError(ACTION_ERROR_CODES.VALIDATION_FAILED, 'Check the highlighted fields.', {
        fieldErrors: { name: ['Name is required'] },
      })
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.fieldErrors).toEqual({ name: ['Name is required'] })
    }
  })

  it('redacts an unexpected error and does not leak its message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = toActionResult(
      new Error('connection to postgres://user:hunter2@db.internal failed')
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR')
      expect(result.error.message).toBe('Something went wrong. Please try again.')
      expect(result.error.message).not.toContain('hunter2')
    }
    spy.mockRestore()
  })

  it('redacts a thrown non-error value', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = toActionResult('raw string failure')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INTERNAL_ERROR')
    spy.mockRestore()
  })
})
