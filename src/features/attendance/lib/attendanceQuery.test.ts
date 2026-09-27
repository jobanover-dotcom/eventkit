import { describe, expect, it } from 'vitest'
import {
  availableRoles,
  filterParticipants,
  hasSpeakers,
  matchesGroup,
  matchesSearch,
  matchesStatus,
  sortParticipants,
  summarizeAttendance,
} from './attendanceQuery'
import type { ParticipantAttendance } from '@/features/attendance/types'

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

const ROSTER: ParticipantAttendance[] = [
  row({
    id: '1',
    name: 'Ana Reyes',
    code: 'BSIT-23-0001',
    studentId: 'BSIT-23-0001',
    email: 'ana@example.com',
    status: 'checked_in',
    checkedInAt: '2026-11-05T09:00:00.000Z',
    role: 'Speaker',
  }),
  row({
    id: '2',
    name: 'Bela Santos',
    code: 'BSIT-23-0002',
    studentId: 'BSIT-23-0002',
    email: 'bela@example.com',
    status: 'not_checked_in',
    checkedInAt: null,
    role: 'Student',
  }),
  row({
    id: '3',
    name: 'Carlo Lim',
    code: 'BSIT-23-0003',
    studentId: 'BSIT-23-0003',
    email: 'carlo@example.com',
    status: 'checked_in',
    checkedInAt: '2026-11-05T08:14:00.000Z',
    role: 'Student',
  }),
]

describe('matchesSearch', () => {
  it('matches everything for an empty term', () => {
    expect(matchesSearch(row(), '')).toBe(true)
    expect(matchesSearch(row(), '   ')).toBe(true)
  })

  it('matches on name, case-insensitively', () => {
    expect(matchesSearch(row(), 'maria')).toBe(true)
    expect(matchesSearch(row(), 'DELA')).toBe(true)
  })

  it('matches on code, email, and student id', () => {
    expect(matchesSearch(row(), 'BSIT-23-0147')).toBe(true)
    expect(matchesSearch(row(), 'maria@example')).toBe(true)
  })

  it('rejects a term that matches nothing', () => {
    expect(matchesSearch(row(), 'zzz')).toBe(false)
  })

  it('does not throw on a null email', () => {
    expect(matchesSearch(row({ email: null }), 'maria')).toBe(true)
  })
})

describe('matchesStatus', () => {
  it('accepts everything under all', () => {
    expect(matchesStatus(row({ status: 'checked_in' }), 'all')).toBe(true)
    expect(matchesStatus(row({ status: 'not_checked_in' }), 'all')).toBe(true)
  })

  it('separates checked in from not checked in', () => {
    expect(matchesStatus(row({ status: 'checked_in' }), 'checked_in')).toBe(true)
    expect(matchesStatus(row({ status: 'checked_in' }), 'not_checked_in')).toBe(false)
    expect(matchesStatus(row({ status: 'not_checked_in' }), 'not_checked_in')).toBe(true)
  })
})

describe('filterParticipants', () => {
  it('returns the whole roster with no options', () => {
    expect(filterParticipants(ROSTER, {})).toHaveLength(3)
  })

  it('filters by search term', () => {
    expect(filterParticipants(ROSTER, { search: 'bela' }).map((r) => r.name)).toEqual([
      'Bela Santos',
    ])
  })

  it('filters by attendance status', () => {
    const checkedIn = filterParticipants(ROSTER, { status: 'checked_in' })
    expect(checkedIn.map((r) => r.name)).toEqual(['Ana Reyes', 'Carlo Lim'])
  })

  it('filters by role', () => {
    expect(filterParticipants(ROSTER, { role: 'Speaker' }).map((r) => r.name)).toEqual([
      'Ana Reyes',
    ])
  })

  it('combines filters', () => {
    const result = filterParticipants(ROSTER, { status: 'checked_in', role: 'Student' })
    expect(result.map((r) => r.name)).toEqual(['Carlo Lim'])
  })

  it('ignores an empty role rather than matching nothing', () => {
    expect(filterParticipants(ROSTER, { role: '' })).toHaveLength(3)
    expect(filterParticipants(ROSTER, { role: '   ' })).toHaveLength(3)
  })
})

describe('sortParticipants', () => {
  it('sorts by name', () => {
    expect(sortParticipants(ROSTER, 'name').map((r) => r.name)).toEqual([
      'Ana Reyes',
      'Bela Santos',
      'Carlo Lim',
    ])
  })

  /**
   * A missing timestamp must not compare as the epoch, which would put every
   * unchecked-in participant at the top of an "earliest first" list.
   */
  it('sorts by check-in time with the unchecked-in last', () => {
    const sorted = sortParticipants(ROSTER, 'checked_in_at')
    expect(sorted.map((r) => r.name)).toEqual(['Carlo Lim', 'Ana Reyes', 'Bela Santos'])
  })

  it('does not mutate its input', () => {
    const original = ROSTER.map((r) => r.name)
    sortParticipants(ROSTER, 'name')
    expect(ROSTER.map((r) => r.name)).toEqual(original)
  })
})

describe('summarizeAttendance', () => {
  it('counts totals for a mixed roster', () => {
    expect(summarizeAttendance(ROSTER)).toEqual({
      total: 3,
      checkedIn: 2,
      notCheckedIn: 1,
      rate: 67,
    })
  })

  it('handles an empty roster without dividing by zero', () => {
    expect(summarizeAttendance([])).toEqual({
      total: 0,
      checkedIn: 0,
      notCheckedIn: 0,
      rate: 0,
    })
  })

  it('reports a full house as 100', () => {
    const all = ROSTER.map((r) => ({ ...r, status: 'checked_in' as const }))
    expect(summarizeAttendance(all).rate).toBe(100)
  })

  it('reports nobody arriving as 0', () => {
    expect(
      summarizeAttendance(ROSTER.map((r) => ({ ...r, status: 'not_checked_in' as const }))).rate
    ).toBe(0)
  })

  it('rounds to a whole percent', () => {
    const rows = [row({ status: 'checked_in' }), row({ id: '2' }), row({ id: '3' })].map((r, i) =>
      i === 0 ? r : { ...r, status: 'not_checked_in' as const }
    )
    expect(summarizeAttendance(rows).rate).toBe(33)
  })
})

describe('availableRoles', () => {
  it('lists only the roles actually present, sorted', () => {
    expect(availableRoles(ROSTER)).toEqual(['Speaker', 'Student'])
  })

  it('returns nothing for an empty roster', () => {
    expect(availableRoles([])).toEqual([])
  })
})

describe('matchesGroup', () => {
  it('includes everyone for the all group', () => {
    for (const role of ['Student', 'Speaker', 'Guest', 'Judge']) {
      expect(matchesGroup(row({ role }), 'all')).toBe(true)
    }
  })

  it('treats only Speaker as a speaker', () => {
    expect(matchesGroup(row({ role: 'Speaker' }), 'speakers')).toBe(true)
    for (const role of ['Student', 'Guest', 'Judge', 'Staff', 'Organizer']) {
      expect(matchesGroup(row({ role }), 'speakers')).toBe(false)
    }
  })

  it('treats every non-Speaker role as a participant', () => {
    for (const role of ['Student', 'Guest', 'Judge', 'Staff', 'Organizer', 'Unknown']) {
      expect(matchesGroup(row({ role }), 'participants')).toBe(true)
    }
    expect(matchesGroup(row({ role: 'Speaker' }), 'participants')).toBe(false)
  })
})

describe('filterParticipants by group', () => {
  const mixed = [
    row({ id: 'p1', role: 'Student', checkedInAt: null, status: 'not_checked_in' }),
    row({ id: 'p2', role: 'Guest', checkedInAt: null, status: 'not_checked_in' }),
    row({ id: 's1', role: 'Speaker', checkedInAt: null, status: 'not_checked_in' }),
  ]

  it('returns the speakers only', () => {
    const result = filterParticipants(mixed, { group: 'speakers' })
    expect(result.map((entry) => entry.id)).toEqual(['s1'])
  })

  it('returns the participants only', () => {
    const result = filterParticipants(mixed, { group: 'participants' })
    expect(result.map((entry) => entry.id)).toEqual(['p1', 'p2'])
  })

  it('never mixes the two groups', () => {
    const speakers = filterParticipants(mixed, { group: 'speakers' }).map((entry) => entry.id)
    const participants = filterParticipants(mixed, { group: 'participants' }).map(
      (entry) => entry.id
    )
    expect(speakers.some((id) => participants.includes(id))).toBe(false)
  })

  it('combines with the status filter', () => {
    const withCheckIn = [
      ...mixed,
      row({
        id: 's2',
        role: 'Speaker',
        status: 'checked_in',
        checkedInAt: '2026-11-05T09:00:00.000Z',
      }),
    ]
    const result = filterParticipants(withCheckIn, { group: 'speakers', status: 'checked_in' })
    expect(result.map((entry) => entry.id)).toEqual(['s2'])
  })

  it('combines with the role filter', () => {
    const result = filterParticipants(mixed, { group: 'participants', role: 'Guest' })
    expect(result.map((entry) => entry.id)).toEqual(['p2'])
  })

  it('defaults to everyone when no group is given', () => {
    expect(filterParticipants(mixed, {})).toHaveLength(3)
  })
})

describe('hasSpeakers', () => {
  it('is false when the roster has no speaker', () => {
    expect(hasSpeakers([row({ role: 'Student' }), row({ role: 'Guest' })])).toBe(false)
  })

  it('is true as soon as one speaker exists', () => {
    expect(hasSpeakers([row({ role: 'Student' }), row({ role: 'Speaker' })])).toBe(true)
  })

  it('is false for an empty roster', () => {
    expect(hasSpeakers([])).toBe(false)
  })
})
