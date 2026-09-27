import { describe, expect, it } from 'vitest'
import { checkInSchema, registrationSchema, toFieldErrors } from './attendance.schema'

/**
 * A registration form is a public endpoint, so its bounds are the only thing
 * standing between a stranger and a CHECK-constraint violation. The limits match
 * the table so a rejected value gets a message a person can act on.
 */

const EVENT_ID = '6f1c2b40-1111-4222-8333-444455556666'

function registration(overrides: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    name: 'Maria Dela Cruz',
    studentId: 'BSIT-23-0147',
    course: 'BSIT',
    yearSection: '3A',
    email: 'maria@example.com',
    ...overrides,
  }
}

describe('registrationSchema', () => {
  it('accepts a complete registration', () => {
    const result = registrationSchema.safeParse(registration())
    expect(result.success).toBe(true)
  })

  it('accepts a registration with only a name', () => {
    const result = registrationSchema.safeParse({
      eventId: EVENT_ID,
      name: 'Ana Reyes',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Blanks are normalised so the service can pass them straight to the
      // function, which wraps them in nullif(btrim(...), '').
      expect(result.data.studentId).toBe('')
      expect(result.data.email).toBe('')
    }
  })

  it.each([
    ['a missing name', { name: '' }],
    ['a whitespace-only name', { name: '   ' }],
    ['an over-long name', { name: 'x'.repeat(121) }],
  ])('rejects %s', (_label, overrides) => {
    expect(registrationSchema.safeParse(registration(overrides)).success).toBe(false)
  })

  it('trims a padded name rather than storing the spaces', () => {
    const result = registrationSchema.safeParse(registration({ name: '  Maria  ' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe('Maria')
  })

  it.each([
    ['a malformed email', 'maria-at-example.com'],
    ['an email with no domain', 'maria@'],
    ['an over-long email', `${'x'.repeat(200)}@example.com`],
  ])('rejects %s', (_label, email) => {
    expect(registrationSchema.safeParse(registration({ email })).success).toBe(false)
  })

  it('accepts an empty email, because the field is optional', () => {
    expect(registrationSchema.safeParse(registration({ email: '' })).success).toBe(true)
  })

  it('rejects a malformed event id', () => {
    expect(registrationSchema.safeParse(registration({ eventId: 'not-a-uuid' })).success).toBe(
      false
    )
  })

  it('rejects an over-long student id, matching the table CHECK', () => {
    expect(registrationSchema.safeParse(registration({ studentId: 'x'.repeat(41) })).success).toBe(
      false
    )
  })

  it('never accepts a role, because the function has no such argument', () => {
    // An unexpected key is stripped rather than rejected, so a caller cannot
    // smuggle a role past the schema into the RPC.
    const result = registrationSchema.parse(registration({ role: 'Organizer' }))
    expect(result).not.toHaveProperty('role')
  })
})

describe('checkInSchema', () => {
  it('accepts an event id and a token', () => {
    expect(checkInSchema.safeParse({ eventId: EVENT_ID, token: 'a'.repeat(64) }).success).toBe(true)
  })

  it('trims the token', () => {
    const result = checkInSchema.safeParse({ eventId: EVENT_ID, token: '  abc  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.token).toBe('abc')
  })

  it('rejects an empty token before spending a query on it', () => {
    expect(checkInSchema.safeParse({ eventId: EVENT_ID, token: '   ' }).success).toBe(false)
  })

  it('rejects a malformed event id', () => {
    expect(checkInSchema.safeParse({ eventId: 'nope', token: 'a'.repeat(64) }).success).toBe(false)
  })

  it('rejects an absurdly long token', () => {
    expect(checkInSchema.safeParse({ eventId: EVENT_ID, token: 'x'.repeat(257) }).success).toBe(
      false
    )
  })
})

describe('toFieldErrors', () => {
  it('keys messages by field for ActionResult.fieldErrors', () => {
    const result = registrationSchema.safeParse(registration({ name: '', email: 'bad' }))
    expect(result.success).toBe(false)
    if (result.success) return

    const errors = toFieldErrors(result.error)
    expect(errors.name?.[0]).toMatch(/enter your name/i)
    expect(errors.email?.[0]).toMatch(/valid email/i)
  })
})
