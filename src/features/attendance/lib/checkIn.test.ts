import { describe, expect, it } from 'vitest'
import { buildCheckInOutcome } from './checkIn'
import { classifyTokenMatch, isValidQrToken, normalizeQrToken } from './token'
import { isSpeaker, toParticipantType } from '@/lib/participantType'
import type { CheckedInParticipant } from '@/features/attendance/types'

/**
 * The scan decision, asserted without a scanner, a database, or a browser.
 *
 * The database already proves — in the pgTAP suite — that a duplicate cannot
 * create a second row, that attendance is immutable, that `anon` cannot check
 * anybody in, and that a row cannot point at another event's participant. What is
 * left to prove here is that the application *reports* those outcomes correctly,
 * which is what these tests cover.
 */

const PERSON: CheckedInParticipant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Maria Dela Cruz',
  code: 'BSIT-23-0147',
  role: 'Student',
  course: 'BSIT',
  yearSection: '3A',
  organization: null,
  title: null,
}

const RECORD = { participantId: PERSON.id, checkedInAt: '2026-11-05T08:14:00.000Z' }

describe('buildCheckInOutcome', () => {
  it('reports a fresh check-in', () => {
    const outcome = buildCheckInOutcome({ participant: PERSON, record: RECORD, createdNow: true })

    expect(outcome.kind).toBe('checked_in')
    expect(outcome.participant).toEqual(PERSON)
    expect(outcome.checkedInAt).toBe('2026-11-05T08:14:00.000Z')
  })

  /**
   * `attendance` has no UPDATE policy, so a rescan must report the stored time.
   * Reporting the moment of the rescan would make the sheet contradict itself.
   */
  it('reports the original time on a duplicate, not the time of the rescan', () => {
    const outcome = buildCheckInOutcome({
      participant: PERSON,
      record: RECORD,
      createdNow: false,
    })

    expect(outcome.kind).toBe('already_checked_in')
    expect(outcome.checkedInAt).toBe('2026-11-05T08:14:00.000Z')
  })

  it('never renames the participant', () => {
    const fresh = buildCheckInOutcome({ participant: PERSON, record: RECORD, createdNow: true })
    const repeat = buildCheckInOutcome({ participant: PERSON, record: RECORD, createdNow: false })

    expect(fresh.participant.id).toBe(repeat.participant.id)
    expect(fresh.participant.name).toBe(repeat.participant.name)
  })
})

describe('isValidQrToken', () => {
  const token = 'a1b2c3d4'.repeat(8)

  it('accepts a 64-character hex token', () => {
    expect(isValidQrToken(token)).toBe(true)
  })

  it.each([
    ['too short', 'a1b2'],
    ['empty', ''],
    ['non-hex characters', 'z'.repeat(64)],
    ['a uuid with dashes', '11111111-1111-4111-8111-111111111111'],
  ])('rejects %s', (_label, value) => {
    expect(isValidQrToken(value)).toBe(false)
  })
})

describe('normalizeQrToken', () => {
  it('returns a clean token unchanged', () => {
    const token = 'a1b2c3d4'.repeat(8)
    expect(normalizeQrToken(token)).toBe(token)
  })

  it('trims surrounding whitespace from a hand-pasted code', () => {
    const token = 'a1b2c3d4'.repeat(8)
    expect(normalizeQrToken(`  ${token}\n`)).toBe(token)
  })

  it('lower-cases, because a camera or a keyboard may upper-case hex', () => {
    const token = 'A1B2C3D4'.repeat(8)
    expect(normalizeQrToken(token)).toBe('a1b2c3d4'.repeat(8))
  })

  it.each([null, undefined, '', '   ', 'not-a-token', 'a1b2'])(
    'rejects %s with null so no query is spent on it',
    (value) => {
      expect(normalizeQrToken(value as string)).toBeNull()
    }
  )

  it('rejects a token carrying injected SQL', () => {
    expect(normalizeQrToken("' or 1=1--")).toBeNull()
  })
})

describe('classifyTokenMatch', () => {
  it('matches a participant of this event', () => {
    expect(classifyTokenMatch('event-1', 'event-1')).toBe('match')
  })

  it('reports a valid token from another event separately', () => {
    expect(classifyTokenMatch('event-2', 'event-1')).toBe('wrong_event')
  })

  /**
   * RLS means a token belonging to another organizer's event can never reach the
   * `wrong_event` branch, so an unknown token is indistinguishable from a forged
   * one. That is what keeps this from being an enumeration oracle.
   */
  it('reports an unmatched token as invalid', () => {
    expect(classifyTokenMatch(null, 'event-1')).toBe('invalid')
  })

  it('treats an empty string as unmatched', () => {
    expect(classifyTokenMatch('', 'event-1')).toBe('invalid')
  })
})

describe('a speaker is checked in through the same path', () => {
  const SPEAKER: CheckedInParticipant = {
    ...PERSON,
    name: 'Dr. Maria Santos',
    role: 'Speaker',
    organization: 'Assumption College of Davao',
    title: 'Keynote Speaker',
  }

  it('reports a fresh speaker check-in', () => {
    const outcome = buildCheckInOutcome({ participant: SPEAKER, record: RECORD, createdNow: true })
    expect(outcome.kind).toBe('checked_in')
    expect(outcome.participant.role).toBe('Speaker')
  })

  it('classifies a speaker as SPEAKER', () => {
    const outcome = buildCheckInOutcome({ participant: SPEAKER, record: RECORD, createdNow: true })
    expect(toParticipantType(outcome.participant.role)).toBe('SPEAKER')
  })

  it('rejects a duplicate speaker scan exactly as it does a participant', () => {
    const outcome = buildCheckInOutcome({
      participant: SPEAKER,
      record: RECORD,
      createdNow: false,
    })
    // Same shape, same message, same stored timestamp. A speaker is not a
    // special case at the door.
    expect(outcome.kind).toBe('already_checked_in')
    expect(outcome.checkedInAt).toBe(RECORD.checkedInAt)
  })

  it('never invents a new timestamp on a rescan', () => {
    const outcome = buildCheckInOutcome({
      participant: SPEAKER,
      record: { participantId: SPEAKER.id, checkedInAt: '2026-11-05T08:00:00.000Z' },
      createdNow: false,
    })
    expect(outcome.checkedInAt).toBe('2026-11-05T08:00:00.000Z')
  })

  it('carries the speaker profile through to the result', () => {
    const outcome = buildCheckInOutcome({ participant: SPEAKER, record: RECORD, createdNow: true })
    expect(outcome.participant.title).toBe('Keynote Speaker')
    expect(outcome.participant.organization).toBe('Assumption College of Davao')
  })

  it('keeps the two scan kinds distinguishable by type, not by a new code', () => {
    const speaker = buildCheckInOutcome({
      participant: SPEAKER,
      record: RECORD,
      createdNow: true,
    })
    const participant = buildCheckInOutcome({
      participant: PERSON,
      record: RECORD,
      createdNow: true,
    })

    expect(speaker.kind).toBe(participant.kind)
    expect(isSpeaker(speaker.participant.role)).toBe(true)
    expect(isSpeaker(participant.participant.role)).toBe(false)
  })
})
