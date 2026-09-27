import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getOwnedEvent } from '@/features/events/services/eventService'
import { getEventRoster } from '@/features/attendance/services/attendanceService'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import { toParticipantType, type ParticipantType } from '@/lib/participantType'
import {
  insertCertificate,
  selectCertificateForParticipant,
  selectEventCertificates,
  updateCertificate,
} from '@/features/certificates/repositories/certificateRepository'
import type { IssuedCertificate } from '@/features/certificates/lib/eligibility'
import type { IssueCertificatesValues } from '@/features/certificates/schemas/certificate.schema'
import type { CertificateType } from '@/features/design/types'

/**
 * Certificate issuance.
 *
 * The pipeline is deliberately ordered: authorize the event, load the roster,
 * reconcile the requested recipients against who is actually eligible, write the
 * records, and only then hand the tokens back for rendering. Records come first
 * because the verification QR is derived from a real token — a certificate drawn
 * against a token that does not exist would produce a QR that verifies nothing.
 *
 * Regeneration is defined by the table's `unique (event_id, participant_id)`:
 * one record per person per event, updated in place. The `verification_token` is
 * never rotated, so a QR somebody already printed keeps verifying after the
 * wording changes.
 */

/** Certificates already issued for an event, so the UI can label a regeneration. */
export async function listIssuedCertificates(eventId: string): Promise<IssuedCertificate[]> {
  await getOwnedEvent(eventId)
  return selectEventCertificates(await createClient(), eventId)
}

export type IssuedCertificateToken = {
  participantId: string
  /** The opaque token the certificate's verification QR encodes. */
  verificationToken: string
  certificateType: CertificateType
  /** True when this run updated an existing record rather than creating one. */
  regenerated: boolean
}

export type IssueCertificatesOutcome = {
  issued: IssuedCertificateToken[]
  regeneratedCount: number
  /**
   * Requested ids that were refused, keyed by why. Reported to the organizer
   * rather than silently dropped, so a run can never quietly produce fewer
   * certificates than the selection implied.
   */
  skipped: { notInGroup: string[]; notCheckedIn: string[]; unknown: string[] }
}

export async function issueCertificates(
  values: IssueCertificatesValues
): Promise<IssueCertificatesOutcome> {
  const event = await getOwnedEvent(values.eventId)
  const client = await createClient()
  const requestedType: ParticipantType = values.type

  // Eligibility is re-derived from the authoritative roster rather than trusted
  // from the payload. `rows` is the unfiltered roster; a crafted request naming
  // a stranger's participant id cannot slip past this.
  const { rows } = await getEventRoster(event.id, { sort: 'name' })

  const requested = [...new Set(values.participantIds)]

  const unknown: string[] = []
  const notInGroup: string[] = []
  const notCheckedIn: string[] = []
  const issuable: string[] = []

  for (const id of requested) {
    const row = rows.find((candidate) => candidate.id === id)

    if (!row) {
      unknown.push(id)
      continue
    }
    if (toParticipantType(row.role) !== requestedType) {
      notInGroup.push(id)
      continue
    }
    // A certificate asserts attendance, and the `certificates` RLS insert policy
    // enforces the same rule in the database. Refusing here turns what would be
    // a raw policy violation into a message the organizer can act on.
    if (row.status !== 'checked_in') {
      notCheckedIn.push(id)
      continue
    }
    issuable.push(id)
  }

  const skipped = { notInGroup, notCheckedIn, unknown }

  if (issuable.length === 0) {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      'None of the selected recipients can be issued a certificate.'
    )
  }

  const issued: IssuedCertificateToken[] = []

  for (const participantId of issuable) {
    const existing = await selectCertificateForParticipant(client, event.id, participantId)

    if (existing) {
      const updated = await updateCertificate(client, existing.id, {
        certificateType: values.certificateType,
        award: values.award,
        signatory: values.signatory,
      })
      issued.push({
        participantId,
        verificationToken: updated.verification_token,
        certificateType: values.certificateType,
        regenerated: true,
      })
      continue
    }

    const created = await insertCertificate(client, {
      eventId: event.id,
      participantId,
      certificateType: values.certificateType,
      award: values.award,
      signatory: values.signatory,
    })
    issued.push({
      participantId,
      verificationToken: created.verification_token,
      certificateType: values.certificateType,
      regenerated: false,
    })
  }

  return {
    issued,
    regeneratedCount: issued.filter((entry) => entry.regenerated).length,
    skipped,
  }
}
