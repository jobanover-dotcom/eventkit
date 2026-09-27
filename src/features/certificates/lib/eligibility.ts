import { toParticipantType, type ParticipantType } from '@/lib/participantType'
import { participantTypeLabel } from '@/lib/participantType'
import { CERTIFICATE_TYPES, type CertificateType } from '@/features/design/types'

/**
 * Certificate eligibility, as a pure function.
 *
 * The rule this encodes is that a certificate is a claim about attendance, so
 * the default candidate list is people who actually turned up. The organizer's
 * two populations — participants and speakers — are kept apart here rather than
 * in the component, so a bulk run cannot mix them by accident: picking
 * "Speakers" and generating for a participant is not a state the UI can reach.
 *
 * The override exists because real events have edge cases — a speaker who flew
 * in late, a sponsor who never registered. It is explicit and it is labelled.
 * It is also a convenience, not the control: the `certificates` table's RLS
 * refuses to store a certificate for somebody with no attendance row, so an
 * unchecked person cannot be issued one by any route.
 */

export type CertificateCandidate = {
  id: string
  name: string
  role: string
  type: ParticipantType
  title: string | null
  organization: string | null
  checkedIn: boolean
}

export const CERTIFICATE_TYPES_LIST = CERTIFICATE_TYPES

export type EligibilityOptions = {
  /** Which population to list. Participants and speakers are never mixed. */
  type: ParticipantType
  /**
   * When false (the default) only checked-in people are eligible. When true
   * everybody in the population is listed, and the unchecked are flagged so the
   * UI can warn before issuing.
   */
  includeNotCheckedIn?: boolean
}

export type EligibilityResult = {
  /** People who can be issued a certificate right now. */
  eligible: CertificateCandidate[]
  /** Checked-in people in this population, for the "N eligible" count. */
  eligibleCount: number
  /** Everyone in the population, eligible or not. */
  all: CertificateCandidate[]
  /** Checked-in people deliberately excluded because the override is off. */
  excludedNotCheckedIn: CertificateCandidate[]
  /**
   * True when the override is on and the selection includes somebody with no
   * attendance row. The UI must say so out loud rather than issuing silently.
   */
  includesUnchecked: boolean
  type: ParticipantType
}

function matchesType(candidate: CertificateCandidate, type: ParticipantType): boolean {
  // Derived from the stored role, so a speaker stays a speaker everywhere.
  return candidate.type === type || toParticipantType(candidate.role) === type
}

/**
 * Filters a roster down to one population, then applies the attendance default.
 *
 * `includeNotCheckedIn` widens rather than replaces: checked-in people are still
 * first, so a widened list never buries the people who genuinely attended.
 */
export function selectCertificateCandidates(
  candidates: readonly CertificateCandidate[],
  options: EligibilityOptions
): EligibilityResult {
  const { type } = options
  const includeNotCheckedIn = options.includeNotCheckedIn ?? false

  const population = candidates.filter((candidate) => matchesType(candidate, type))
  const eligible = population.filter((candidate) => candidate.checkedIn)
  const excludedNotCheckedIn = population.filter((candidate) => !candidate.checkedIn)

  return {
    eligible: includeNotCheckedIn ? population : eligible,
    eligibleCount: eligible.length,
    all: population,
    excludedNotCheckedIn,
    // Only warn when an unchecked person is actually in the selection.
    includesUnchecked: includeNotCheckedIn && excludedNotCheckedIn.length > 0,
    type,
  }
}

/**
 * Reconciles a selection against the eligible list.
 *
 * An id that is no longer eligible — a stale checkbox after a filter change, or
 * a crafted request — is dropped rather than issued. The RLS attendance guard
 * would refuse it anyway, but failing here gives the organizer a useful message
 * instead of a database error.
 */
export function reconcileSelection(
  selectedIds: readonly string[],
  eligible: readonly CertificateCandidate[]
): { ids: string[]; dropped: string[] } {
  const eligibleIds = new Set(eligible.map((candidate) => candidate.id))
  const ids: string[] = []
  const dropped: string[] = []
  const seen = new Set<string>()

  for (const id of selectedIds) {
    if (seen.has(id)) continue
    seen.add(id)
    if (eligibleIds.has(id)) ids.push(id)
    else dropped.push(id)
  }

  return { ids, dropped }
}

/** Certificates already issued, so a regenerated run does not read as new. */
export type IssuedCertificate = {
  participantId: string
  certificateType: string
  issuedAt: string
  verificationToken: string
}

export function isAlreadyIssued(
  issued: readonly IssuedCertificate[],
  candidate: CertificateCandidate,
  certificateType: CertificateType
): boolean {
  return issued.some(
    (record) => record.participantId === candidate.id && record.certificateType === certificateType
  )
}

export { participantTypeLabel }
