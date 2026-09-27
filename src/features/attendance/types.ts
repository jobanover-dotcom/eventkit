/**
 * Attendance types shared across the server/client boundary.
 *
 * These are read models, not database rows. Keeping them separate means a column
 * rename cannot leak into a component prop.
 */

/** What a design or pass needs to know about a person. */
export type CheckedInParticipant = {
  id: string
  name: string
  /** `student_id` when set, otherwise a short derived fallback. */
  code: string
  role: string
  course: string | null
  yearSection: string | null
  /** Speaker affiliation, or null for an ordinary participant. */
  organization: string | null
  /** Free-text speaker title, or null for an ordinary participant. */
  title: string | null
}

export type AttendanceRecord = {
  participantId: string
  checkedInAt: string
}

export type AttendanceStatus = 'checked_in' | 'not_checked_in'

/** A participant plus their attendance state, as the list pages render it. */
export type ParticipantAttendance = CheckedInParticipant & {
  email: string | null
  studentId: string | null
  qrToken: string
  status: AttendanceStatus
  checkedInAt: string | null
}

export type AttendanceSummary = {
  total: number
  checkedIn: number
  notCheckedIn: number
  /** Whole percent, or 0 when nobody has registered. */
  rate: number
}

/** Which slice of the roster a list page is showing. */
export const ATTENDANCE_FILTERS = ['all', 'checked_in', 'not_checked_in'] as const

export type AttendanceFilter = (typeof ATTENDANCE_FILTERS)[number]

export const ATTENDANCE_FILTER_LABELS: Readonly<Record<AttendanceFilter, string>> = {
  all: 'All',
  checked_in: 'Checked in',
  not_checked_in: 'Not checked in',
}

/**
 * Which half of the door the list is showing.
 *
 * Distinct from `role`, which filters on the stored badge vocabulary and is
 * offered only when the roster actually contains more than one role. The group
 * filter answers a different question — participants versus speakers — and is
 * what the certificate flow needs in order never to mix the two populations.
 */
export const ATTENDANCE_GROUPS = ['all', 'participants', 'speakers'] as const

export type AttendanceGroup = (typeof ATTENDANCE_GROUPS)[number]

export const ATTENDANCE_GROUP_LABELS: Readonly<Record<AttendanceGroup, string>> = {
  all: 'Everyone',
  participants: 'Participants',
  speakers: 'Speakers',
}

export function isAttendanceGroup(value: string | undefined): value is AttendanceGroup {
  return ATTENDANCE_GROUPS.some((option) => option === value)
}

export const PARTICIPANT_SORTS = ['name', 'checked_in_at'] as const

export type ParticipantSort = (typeof PARTICIPANT_SORTS)[number]

export const PARTICIPANT_ROLES = [
  'Student',
  'Speaker',
  'Organizer',
  'Staff',
  'Guest',
  'Judge',
] as const

export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number]

export function isAttendanceFilter(value: string | undefined): value is AttendanceFilter {
  return ATTENDANCE_FILTERS.some((option) => option === value)
}

export function isParticipantSort(value: string | undefined): value is ParticipantSort {
  return PARTICIPANT_SORTS.some((option) => option === value)
}

export function isParticipantRole(value: string | undefined): value is ParticipantRole {
  return PARTICIPANT_ROLES.some((option) => option === value)
}
