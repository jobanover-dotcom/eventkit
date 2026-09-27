/**
 * The two kinds of person EventKit tracks.
 *
 * The database stores this as `participants.role`, a six-value enum that also
 * carries badge vocabulary like `Guest`, `Judge`, and `Staff`. Only `Speaker`
 * means speaker; every other value is an ordinary participant.
 *
 * This module exists so the rest of the application never re-derives that rule.
 * Hiding a select behind one function means "what is a speaker" is answered in
 * exactly one place, and a future role cannot quietly be classified as a
 * speaker in one module and not another.
 *
 * It is intentionally application-level only. No column, constraint, or
 * function signature depends on it, and the database remains the single source
 * of truth through `participants.role`.
 */

export const PARTICIPANT_TYPES = ['PARTICIPANT', 'SPEAKER'] as const

export type ParticipantType = (typeof PARTICIPANT_TYPES)[number]

/** The one `participants.role` value that denotes a speaker. */
export const SPEAKER_ROLE = 'Speaker'

/**
 * Classifies a stored role.
 *
 * Anything that is not exactly `Speaker` is a participant, including roles the
 * application does not know about. Defaulting to the ordinary case means an
 * unrecognised value can never be mistaken for a speaker and granted speaker
 * privileges or speaker-only certificate eligibility.
 */
export function toParticipantType(role: string | null | undefined): ParticipantType {
  return role === SPEAKER_ROLE ? 'SPEAKER' : 'PARTICIPANT'
}

export function isSpeaker(role: string | null | undefined): boolean {
  return toParticipantType(role) === 'SPEAKER'
}

export function isParticipant(role: string | null | undefined): boolean {
  return toParticipantType(role) === 'PARTICIPANT'
}

/**
 * Display label for the group, used by the certificate group toggle and the
 * check-in result.
 */
export const PARTICIPANT_TYPE_LABELS: Readonly<Record<ParticipantType, string>> = {
  PARTICIPANT: 'Participant',
  SPEAKER: 'Speaker',
}

export function participantTypeLabel(type: ParticipantType): string {
  return PARTICIPANT_TYPE_LABELS[type]
}

export function participantTypeLabelForRole(role: string | null | undefined): string {
  return participantTypeLabel(toParticipantType(role))
}
