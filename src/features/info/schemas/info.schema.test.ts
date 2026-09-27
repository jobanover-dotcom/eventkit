import { describe, expect, it } from 'vitest'
import { ruleSchema, scheduleItemSchema, toFieldErrors } from './info.schema'

/**
 * These schemas are the last check before Postgres, and their bounds mirror the
 * `schedules` and `rules` CHECK constraints. The table is not reachable from a
 * unit test, so this is where "invalid data is rejected" is actually proven.
 */

const EVENT_ID = '6f1c2b40-1111-4222-8333-444455556666'

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    title: 'Opening ceremony',
    startTime: '09:00',
    endTime: '10:00',
    location: 'Main hall',
    ...overrides,
  }
}

describe('scheduleItemSchema', () => {
  it('accepts a complete item', () => {
    expect(scheduleItemSchema.safeParse(schedule()).success).toBe(true)
  })

  it('accepts an item with no location, because the column defaults to empty', () => {
    const result = scheduleItemSchema.safeParse(schedule({ location: '' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.location).toBe('')
  })

  it('trims a padded title', () => {
    const result = scheduleItemSchema.safeParse(schedule({ title: '  Opening  ' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.title).toBe('Opening')
  })

  it.each([
    ['a missing title', { title: '' }],
    ['a whitespace-only title', { title: '   ' }],
    ['an over-long title', { title: 'x'.repeat(161) }],
  ])('rejects %s', (_label, overrides) => {
    expect(scheduleItemSchema.safeParse(schedule(overrides)).success).toBe(false)
  })

  it.each([
    ['a start time with no padding', '9:00'],
    ['an impossible hour', '25:00'],
    ['an empty time', ''],
  ])('rejects %s', (_label, startTime) => {
    expect(scheduleItemSchema.safeParse(schedule({ startTime })).success).toBe(false)
  })

  it('rejects an end time at or before the start, matching the table CHECK', () => {
    expect(
      scheduleItemSchema.safeParse(schedule({ startTime: '10:00', endTime: '10:00' })).success
    ).toBe(false)
    expect(
      scheduleItemSchema.safeParse(schedule({ startTime: '10:00', endTime: '09:00' })).success
    ).toBe(false)
    expect(
      scheduleItemSchema.safeParse(schedule({ startTime: '09:00', endTime: '09:01' })).success
    ).toBe(true)
  })

  it('rejects a malformed event id', () => {
    expect(scheduleItemSchema.safeParse(schedule({ eventId: 'nope' })).success).toBe(false)
  })

  it('rejects an over-long location', () => {
    expect(scheduleItemSchema.safeParse(schedule({ location: 'x'.repeat(161) })).success).toBe(
      false
    )
  })
})

describe('ruleSchema', () => {
  function valid(overrides: Record<string, unknown> = {}) {
    return { eventId: EVENT_ID, title: 'Attendance', content: 'Be on time.', ...overrides }
  }

  it('accepts a complete rule', () => {
    expect(ruleSchema.safeParse(valid()).success).toBe(true)
  })

  it.each([
    ['a missing title', { title: '' }],
    ['a missing body', { content: '' }],
    ['a whitespace-only body', { content: '   ' }],
    ['a title over 160 characters', { title: 'x'.repeat(161) }],
  ])('rejects %s', (_label, overrides) => {
    expect(ruleSchema.safeParse(valid(overrides)).success).toBe(false)
  })

  it('accepts content at the 4000 character limit and rejects one past it', () => {
    expect(ruleSchema.safeParse(valid({ content: 'x'.repeat(4000) })).success).toBe(true)
    expect(ruleSchema.safeParse(valid({ content: 'x'.repeat(4001) })).success).toBe(false)
  })

  it('keeps an organizer line breaks, so the rendered rule matches what was typed', () => {
    const result = ruleSchema.safeParse(valid({ content: 'First line\nSecond line' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.content).toBe('First line\nSecond line')
  })
})

describe('toFieldErrors', () => {
  it('keys messages by field for ActionResult.fieldErrors', () => {
    const result = scheduleItemSchema.safeParse(schedule({ title: '', endTime: '08:00' }))
    expect(result.success).toBe(false)
    if (result.success) return

    const errors = toFieldErrors(result.error)
    expect(errors.title?.[0]).toMatch(/title/i)
    expect(errors.endTime?.[0]).toMatch(/after the start time/i)
  })
})
