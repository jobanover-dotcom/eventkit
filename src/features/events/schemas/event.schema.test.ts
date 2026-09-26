import { describe, expect, it } from 'vitest'
import { eventSchema, DEFAULT_THEME, toFieldErrors, type EventInput } from './event.schema'

const VALID = {
  name: '  IT FEST 2026  ',
  description: 'A demo event',
  date: '2026-11-05',
  startTime: '08:00',
  endTime: '17:00',
  venue: ' Assumption College ',
  organizerName: ' BSIT Department ',
  theme: DEFAULT_THEME,
  registrationOpen: true,
}

describe('eventSchema', () => {
  it('accepts a complete event', () => {
    expect(eventSchema.safeParse(VALID).success).toBe(true)
  })

  it('trims the text fields', () => {
    const parsed = eventSchema.parse(VALID)
    expect(parsed.name).toBe('IT FEST 2026')
    expect(parsed.venue).toBe('Assumption College')
    expect(parsed.organizerName).toBe('BSIT Department')
  })

  it('defaults the theme and registration flag', () => {
    const withoutOptionals: EventInput = {
      name: VALID.name,
      description: VALID.description,
      date: VALID.date,
      startTime: VALID.startTime,
      endTime: VALID.endTime,
      venue: VALID.venue,
      organizerName: VALID.organizerName,
    }

    const parsed = eventSchema.parse(withoutOptionals)
    expect(parsed.theme).toBe(DEFAULT_THEME)
    expect(parsed.registrationOpen).toBe(true)
  })

  it('rejects an end time that is not after the start time', () => {
    const result = eventSchema.safeParse({ ...VALID, startTime: '17:00', endTime: '08:00' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['endTime'])
    }
  })

  it('rejects equal start and end times', () => {
    expect(eventSchema.safeParse({ ...VALID, endTime: '08:00' }).success).toBe(false)
  })

  it.each([
    ['a blank name', { name: '   ' }],
    ['a blank venue', { venue: '' }],
    ['a blank organizer', { organizerName: '' }],
    ['a malformed date', { date: '05-11-2026' }],
    ['an impossible date', { date: '2026-02-31' }],
    ['a malformed time', { startTime: '8am' }],
    ['a non-hex theme', { theme: 'purple' }],
  ])('rejects %s', (_label, override) => {
    expect(eventSchema.safeParse({ ...VALID, ...override }).success).toBe(false)
  })

  it('rejects a name longer than the column allows', () => {
    expect(eventSchema.safeParse({ ...VALID, name: 'x'.repeat(121) }).success).toBe(false)
  })
})

describe('toFieldErrors', () => {
  it('maps issues onto field names', () => {
    const result = eventSchema.safeParse({ ...VALID, name: '', venue: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fieldErrors = toFieldErrors(result.error)
      expect(fieldErrors.name).toContain('Give the event a name')
      expect(fieldErrors.venue).toContain('Where is the event held?')
    }
  })
})
