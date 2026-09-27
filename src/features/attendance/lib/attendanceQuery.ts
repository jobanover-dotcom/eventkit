import type {
  AttendanceFilter,
  AttendanceGroup,
  AttendanceSummary,
  ParticipantAttendance,
  ParticipantSort,
} from '@/features/attendance/types'
import { toParticipantType } from '@/lib/participantType'

/**
 * Roster filtering, sorting, and totals, kept pure so the list pages and the
 * summary cards are asserted without a database or a rendered table.
 *
 * Filtering happens on the server after an authorized read, which keeps the
 * browser from holding rows an organizer may not see and avoids a second data
 * path. A school event registers tens of people, not thousands, so loading the
 * roster in one query is the right trade here; server-side pagination becomes
 * necessary well past this size.
 */

function includesTerm(haystack: string | null, term: string): boolean {
  if (!term) return true
  return (haystack ?? '').toLowerCase().includes(term)
}

/** Matches name, code, email, and student id, which is what an organizer scans a row for. */
export function matchesSearch(row: ParticipantAttendance, rawTerm: string): boolean {
  const term = rawTerm.trim().toLowerCase()
  if (!term) return true

  return (
    includesTerm(row.name, term) ||
    includesTerm(row.code, term) ||
    includesTerm(row.email, term) ||
    includesTerm(row.studentId, term)
  )
}

export function matchesStatus(row: ParticipantAttendance, filter: AttendanceFilter): boolean {
  if (filter === 'all') return true
  return row.status === filter
}

/**
 * Group membership is derived from the stored role through the shared helper, so
 * "speaker" means the same thing here as it does on the check-in screen and in
 * the certificate flow.
 */
export function matchesGroup(row: ParticipantAttendance, group: AttendanceGroup): boolean {
  if (group === 'all') return true
  const type = toParticipantType(row.role)
  return group === 'speakers' ? type === 'SPEAKER' : type === 'PARTICIPANT'
}

export function filterParticipants(
  rows: readonly ParticipantAttendance[],
  options: {
    search?: string
    status?: AttendanceFilter
    role?: string
    group?: AttendanceGroup
  }
): ParticipantAttendance[] {
  const role = options.role?.trim() ?? ''

  return rows.filter((row) => {
    if (!matchesSearch(row, options.search ?? '')) return false
    if (!matchesStatus(row, options.status ?? 'all')) return false
    if (!matchesGroup(row, options.group ?? 'all')) return false
    if (role && row.role !== role) return false
    return true
  })
}

export function sortParticipants(
  rows: readonly ParticipantAttendance[],
  sort: ParticipantSort
): ParticipantAttendance[] {
  const sorted = [...rows]

  sorted.sort((a, b) => {
    if (sort === 'checked_in_at') {
      // Unchecked-in participants sort last rather than as 1970, which is what a
      // missing timestamp would otherwise compare as.
      if (a.checkedInAt === null && b.checkedInAt === null) return a.name.localeCompare(b.name)
      if (a.checkedInAt === null) return 1
      if (b.checkedInAt === null) return -1
      return a.checkedInAt.localeCompare(b.checkedInAt)
    }

    return a.name.localeCompare(b.name)
  })

  return sorted
}

/**
 * Totals are computed over the whole roster, not the filtered view, so the
 * summary cards do not change as someone types in the search box.
 */
export function summarizeAttendance(rows: readonly ParticipantAttendance[]): AttendanceSummary {
  const total = rows.length
  const checkedIn = rows.reduce(
    (count, row) => (row.status === 'checked_in' ? count + 1 : count),
    0
  )

  return {
    total,
    checkedIn,
    notCheckedIn: Math.max(0, total - checkedIn),
    rate: total === 0 ? 0 : Math.round((checkedIn / total) * 100),
  }
}

/** The distinct roles actually present, so the filter never offers a dead option. */
export function availableRoles(rows: readonly ParticipantAttendance[]): string[] {
  return [...new Set(rows.map((row) => row.role))].sort((a, b) => a.localeCompare(b))
}

/**
 * Whether the roster holds anyone at all beyond ordinary participants, so the
 * group filter can be hidden when it would offer nothing.
 */
export function hasSpeakers(rows: readonly ParticipantAttendance[]): boolean {
  return rows.some((row) => toParticipantType(row.role) === 'SPEAKER')
}
