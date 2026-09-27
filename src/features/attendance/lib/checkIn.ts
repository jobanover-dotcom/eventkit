import type { AttendanceRecord, CheckedInParticipant } from '@/features/attendance/types'

/**
 * The check-in decision, as a pure function.
 *
 * Every branch that decides what a scan *means* lives here rather than in the
 * service, so the behaviour can be asserted without a database. The service
 * supplies the facts: who the participant is, what the stored row says, and
 * whether this request is the one that created it.
 */

export type CheckInOutcome = {
  kind: 'checked_in' | 'already_checked_in'
  participant: CheckedInParticipant
  /** Always the row's own `checked_in_at`; a rescan never invents a new time. */
  checkedInAt: string
}

export function buildCheckInOutcome(input: {
  participant: CheckedInParticipant
  record: AttendanceRecord
  /**
   * True when this request wrote the row. A duplicate insert is absorbed by the
   * `(event_id, participant_id)` unique index, so the service knows which case it
   * is from the insert result rather than from a read-then-write guess.
   */
  createdNow: boolean
}): CheckInOutcome {
  return {
    kind: input.createdNow ? 'checked_in' : 'already_checked_in',
    participant: input.participant,
    // `attendance` has no UPDATE policy, so a check-in is immutable. Reporting
    // the stored timestamp on a rescan is the only honest answer.
    checkedInAt: input.record.checkedInAt,
  }
}
