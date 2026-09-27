import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/features/auth/services/getCurrentOrganizer'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import {
  selectOwnedEvent,
  selectVisibleEvent,
  type EventRow,
} from '@/features/events/repositories/eventRepository'
import {
  selectEventParticipant,
  selectEventParticipants,
  selectParticipantByToken,
  type ParticipantRow,
} from '@/features/participants/repositories/participantRepository'
import {
  insertAttendanceIgnoreDuplicate,
  selectAttendanceForParticipant,
  selectEventAttendance,
} from '@/features/attendance/repositories/attendanceRepository'
import { buildCheckInOutcome, type CheckInOutcome } from '@/features/attendance/lib/checkIn'
import { classifyTokenMatch, normalizeQrToken } from '@/features/attendance/lib/token'
import {
  availableRoles,
  filterParticipants,
  hasSpeakers,
  sortParticipants,
  summarizeAttendance,
} from '@/features/attendance/lib/attendanceQuery'
import type {
  AttendanceFilter,
  AttendanceGroup,
  AttendanceSummary,
  CheckedInParticipant,
  ParticipantAttendance,
  ParticipantSort,
} from '@/features/attendance/types'
import type { RegistrationValues } from '@/features/attendance/schemas/attendance.schema'

/**
 * Attendance application logic.
 *
 * Read paths authorize by matching the event against the session's organizer.
 * The single write path additionally proves that the scanned token belongs to
 * the event being checked into, which no client-supplied value can establish on
 * its own.
 */

export type Roster = {
  rows: ParticipantAttendance[]
  filtered: ParticipantAttendance[]
  summary: AttendanceSummary
  roles: string[]
  /** Whether any speaker exists, so the group filter can be hidden when empty. */
  hasSpeakers: boolean
}

/** `student_id` is nullable, so a code falls back to a short id reference. */
function toCode(row: ParticipantRow): string {
  return row.student_id?.trim() || row.id.slice(0, 8).toUpperCase()
}

function toCheckedInParticipant(row: ParticipantRow): CheckedInParticipant {
  return {
    id: row.id,
    name: row.name,
    code: toCode(row),
    role: row.role,
    course: row.course,
    yearSection: row.year_section,
    organization: row.organization,
    title: row.title,
  }
}

export async function getEventRoster(
  eventId: string,
  options: {
    search?: string
    status?: AttendanceFilter
    role?: string
    group?: AttendanceGroup
    sort?: ParticipantSort
  }
): Promise<Roster> {
  const organizer = await requireOrganizer()
  const client = await createClient()

  const event = await selectOwnedEvent(client, eventId, organizer.id)
  if (!event) {
    throw new AppError(
      ACTION_ERROR_CODES.NOT_FOUND,
      'That event does not exist, or it belongs to another organizer.'
    )
  }

  const [participantRows, attendanceRows] = await Promise.all([
    selectEventParticipants(client, eventId),
    selectEventAttendance(client, eventId),
  ])

  const checkedInAtByParticipant = new Map(
    attendanceRows.map((row) => [row.participant_id, row.checked_in_at])
  )

  const rows: ParticipantAttendance[] = participantRows.map((row) => {
    const checkedInAt = checkedInAtByParticipant.get(row.id) ?? null
    return {
      ...toCheckedInParticipant(row),
      email: row.email ?? null,
      studentId: row.student_id,
      qrToken: row.qr_token,
      status: checkedInAt ? 'checked_in' : 'not_checked_in',
      checkedInAt,
    }
  })

  return {
    rows,
    filtered: sortParticipants(
      filterParticipants(rows, {
        search: options.search,
        status: options.status,
        role: options.role,
        group: options.group,
      }),
      options.sort ?? 'name'
    ),
    // Totals come from the whole roster, so the cards do not shift as someone
    // types in the search box.
    summary: summarizeAttendance(rows),
    roles: availableRoles(rows),
    hasSpeakers: hasSpeakers(rows),
  }
}

/** One participant for the organizer pass view, authorized against the event. */
export async function getParticipantPass(
  eventId: string,
  participantId: string
): Promise<{ event: EventRow; participant: CheckedInParticipant; qrToken: string }> {
  const organizer = await requireOrganizer()
  const client = await createClient()

  const event = await selectOwnedEvent(client, eventId, organizer.id)
  if (!event) {
    throw new AppError(
      ACTION_ERROR_CODES.NOT_FOUND,
      'That event does not exist, or it belongs to another organizer.'
    )
  }

  const participant = await selectEventParticipant(client, eventId, participantId)
  if (!participant) {
    throw new AppError(ACTION_ERROR_CODES.NOT_FOUND, 'That participant is not on this event.')
  }

  return {
    event,
    participant: toCheckedInParticipant(participant),
    qrToken: participant.qr_token,
  }
}

/**
 * Checks one participant in from a scanned token.
 *
 * The order matters. Ownership of the event is proved first, then the token is
 * matched, then the token is proved to belong to *this* event, and only then is
 * anything written. A client that lies about the event id cannot check a
 * stranger's participant in, because the participant lookup is scoped by the
 * organizer and the event comparison is server-side.
 *
 * Throws `INVALID_QR` or `WRONG_EVENT` for a scan that cannot proceed; both are
 * documented in `docs/api/errors.md` and are ordinary outcomes, not faults.
 */
export async function checkInByToken(eventId: string, rawToken: string): Promise<CheckInOutcome> {
  const organizer = await requireOrganizer()
  const client = await createClient()

  const event = await selectOwnedEvent(client, eventId, organizer.id)
  if (!event) {
    // Not FORBIDDEN: a design or attendance page must not confirm that somebody
    // else's event exists.
    throw new AppError(
      ACTION_ERROR_CODES.NOT_FOUND,
      'That event does not exist, or it belongs to another organizer.'
    )
  }

  const token = normalizeQrToken(rawToken)
  if (!token) {
    throw new AppError(ACTION_ERROR_CODES.INVALID_QR, 'Invalid QR code.')
  }

  const participant = await selectParticipantByToken(client, token)
  const match = classifyTokenMatch(participant?.event_id ?? null, eventId)

  if (match === 'invalid') {
    throw new AppError(ACTION_ERROR_CODES.INVALID_QR, 'Invalid QR code.')
  }

  if (match === 'wrong_event') {
    throw new AppError(
      ACTION_ERROR_CODES.WRONG_EVENT,
      'This QR code is not registered for this event.'
    )
  }

  if (!participant) {
    // Unreachable while the match is `match`, but the type needs it and a
    // missing participant must never fall through into a write.
    throw new AppError(ACTION_ERROR_CODES.INVALID_QR, 'Invalid QR code.')
  }

  const inserted = await insertAttendanceIgnoreDuplicate(client, {
    event_id: eventId,
    participant_id: participant.id,
  })

  if (inserted.length > 0) {
    const created = inserted[0]
    if (!created) throw new AppError(ACTION_ERROR_CODES.INTERNAL_ERROR, 'Check-in failed.')

    return buildCheckInOutcome({
      participant: toCheckedInParticipant(participant),
      record: { participantId: participant.id, checkedInAt: created.checked_in_at },
      createdNow: true,
    })
  }

  // The insert was absorbed by the unique index, so somebody — possibly a
  // concurrent scan of the same phone — already wrote this row. Read it back for
  // the real timestamp rather than reporting the moment of the rescan.
  const existing = await selectAttendanceForParticipant(client, eventId, participant.id)
  if (!existing) {
    throw new AppError(ACTION_ERROR_CODES.INTERNAL_ERROR, 'Check-in failed.')
  }

  return buildCheckInOutcome({
    participant: toCheckedInParticipant(participant),
    record: existing,
    createdNow: false,
  })
}

/**
 * Registers a participant through the `register_participant()` function, which is
 * a `SECURITY DEFINER` entry point that carries its own authorization.
 *
 * Using the function rather than an insert keeps `anon` write-free on the
 * `participants` table, centralises validation next to the table constraints,
 * and mints the `qr_token` from its column default so a registrant can never
 * choose their own.
 */
export async function registerParticipant(
  values: RegistrationValues
): Promise<{ participantId: string; qrToken: string; event: EventRow }> {
  const client = await createClient()
  const event = await selectVisibleEvent(client, values.eventId)

  if (!event) {
    throw new AppError(ACTION_ERROR_CODES.NOT_FOUND, 'That event does not exist.')
  }

  if (!event.registration_open) {
    throw new AppError(ACTION_ERROR_CODES.CONFLICT, 'Registration for this event is closed.')
  }

  const { data, error } = await client.rpc('register_participant', {
    p_event_id: values.eventId,
    p_name: values.name,
    // The function wraps every optional argument in `nullif(btrim(...), '')`, so
    // an empty string is already how a blank is expressed.
    p_student_id: values.studentId,
    p_course: values.course,
    p_year_section: values.yearSection,
    p_email: values.email,
  })

  if (error) {
    // The unique index on (event_id, lower(student_id)) refuses a second
    // registration for the same student. That is a normal outcome on a public
    // form, not a fault, so it gets its own message instead of a generic apology.
    if (error.code === '23505') {
      throw new AppError(
        ACTION_ERROR_CODES.CONFLICT,
        'That student ID is already registered for this event.'
      )
    }

    // Anything else is a genuine failure. `toActionResult` logs the detail and
    // returns a safe message, so nothing internal crosses the boundary.
    throw error
  }

  const row = data?.[0]
  if (!row) {
    throw new AppError(ACTION_ERROR_CODES.INTERNAL_ERROR, 'Registration failed. Please try again.')
  }

  return { participantId: row.id, qrToken: row.qr_token, event }
}
