import { describe, expect, it } from 'vitest'
import { attendanceFilename, escapeCsvValue, slugify, toCsv } from './csv'
import type { ParticipantAttendance } from '@/features/attendance/types'

/**
 * Names come from a public registration form, so the CSV writer is a trust
 * boundary twice over: it has to produce a file spreadsheets parse correctly, and
 * it must not let a crafted name execute as a formula.
 */

function row(overrides: Partial<ParticipantAttendance> = {}): ParticipantAttendance {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Maria Dela Cruz',
    code: 'BSIT-23-0147',
    role: 'Student',
    course: 'BSIT',
    yearSection: '3A',
    organization: null,
    title: null,
    email: 'maria@example.com',
    studentId: 'BSIT-23-0147',
    qrToken: 'a'.repeat(64),
    status: 'not_checked_in',
    checkedInAt: null,
    ...overrides,
  }
}

describe('escapeCsvValue', () => {
  it('quotes a plain value', () => {
    expect(escapeCsvValue('Maria')).toBe('"Maria"')
  })

  it('escapes an embedded comma', () => {
    expect(escapeCsvValue('Dela Cruz, Maria')).toBe('"Dela Cruz, Maria"')
  })

  it('doubles embedded quotes', () => {
    expect(escapeCsvValue('Ana "Annie" Reyes')).toBe('"Ana ""Annie"" Reyes"')
  })

  it('preserves a newline inside the quoted field', () => {
    expect(escapeCsvValue('line one\nline two')).toBe('"line one\nline two"')
  })

  it('preserves a carriage return', () => {
    expect(escapeCsvValue('a\r\nb')).toBe('"a\r\nb"')
  })

  it('renders null and undefined as an empty quoted field, not the text "null"', () => {
    expect(escapeCsvValue(null)).toBe('""')
    expect(escapeCsvValue(undefined)).toBe('""')
  })

  it('coerces a number', () => {
    expect(escapeCsvValue(42 as unknown as string)).toBe('"42"')
  })

  /**
   * The reason a name is quoted unconditionally rather than only when it needs
   * to be: a cell starting `=` is a formula in Excel and Sheets.
   */
  it.each([
    ['=1+1', '"\'=1+1"'],
    ['+SUM(A1)', '"\'+SUM(A1)"'],
    ['-2+3', '"\'-2+3"'],
    ['@import', '"\'@import"'],
  ])('neutralises a formula prefix in %s', (value, expected) => {
    expect(escapeCsvValue(value)).toBe(expected)
  })

  it('leaves an ordinary leading hyphen-free value alone', () => {
    expect(escapeCsvValue('BSIT-3A')).toBe('"BSIT-3A"')
  })
})

describe('toCsv', () => {
  it('writes a header row', () => {
    const [header] = toCsv([]).split('\r\n')
    expect(header).toBe('"Name","Code","Role","Email","Student ID","Status","Checked In At"')
  })

  it('writes one line per participant', () => {
    const csv = toCsv([row(), row({ name: 'Second Person' })])
    expect(csv.trimEnd().split('\r\n')).toHaveLength(3)
  })

  it('marks a checked-in participant and keeps the timestamp', () => {
    const csv = toCsv([row({ status: 'checked_in', checkedInAt: '2026-11-05T08:14:00Z' })])
    expect(csv).toContain('"Checked in"')
    expect(csv).toContain('"2026-11-05T08:14:00Z"')
  })

  it('writes a not-checked-in participant with an empty timestamp', () => {
    const csv = toCsv([row()])
    expect(csv).toContain('"Not checked in"')
    expect(csv.trimEnd().endsWith('""')).toBe(true)
  })

  it('keeps a name containing a comma parseable as one field', () => {
    const csv = toCsv([row({ name: 'Dela Cruz, Maria' })])
    const dataLine = csv.trimEnd().split('\r\n')[1] ?? ''
    // One field boundary before the code, not two.
    expect(dataLine.startsWith('"Dela Cruz, Maria","')).toBe(true)
  })

  it('keeps a name containing a quote parseable', () => {
    const csv = toCsv([row({ name: 'Ana "Annie" Reyes' })])
    expect(csv).toContain('"Ana ""Annie"" Reyes"')
  })

  it('ends with a trailing newline', () => {
    expect(toCsv([row()]).endsWith('\r\n')).toBe(true)
  })

  it('handles an empty roster', () => {
    expect(toCsv([]).trimEnd().split('\r\n')).toHaveLength(1)
  })
})

describe('slugify', () => {
  it.each([
    ['IT FEST 2026', 'it-fest-2026'],
    ['BSIT Department', 'bsit-department'],
    ['  spaced  out  ', 'spaced-out'],
    ["Ann's Event!", 'ann-s-event'],
    ['---', ''],
    // NFKD splits the diacritic into a combining mark, which becomes a separator.
    ['ñ_and_ü', 'n-and-u'],
  ])('turns %s into %s', (value, expected) => {
    expect(slugify(value)).toBe(expected)
  })

  it('caps the length', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(60)
  })
})

describe('attendanceFilename', () => {
  it('prefers a readable event name', () => {
    expect(attendanceFilename('IT FEST 2026', 'abc')).toBe('eventkit-attendance-it-fest-2026.csv')
  })

  it('falls back to the event id when the name has no usable characters', () => {
    expect(attendanceFilename('***', 'abc-123')).toBe('eventkit-attendance-abc-123.csv')
  })

  it('produces a name with no path separators', () => {
    const result = attendanceFilename('../../etc/passwd', 'abc')
    expect(result).not.toContain('/')
    expect(result).not.toContain('..')
  })
})
