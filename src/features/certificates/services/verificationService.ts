import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'
import { participantTypeLabelForRole } from '@/lib/participantType'
import { CERTIFICATE_PRESETS, type CertificateType } from '@/features/design/types'

/**
 * Public certificate verification.
 *
 * The read goes through `get_certificate_verification()`, a `SECURITY DEFINER`
 * function, rather than a table select. That is not a stylistic choice: `anon`
 * has a SELECT grant on `certificates` but no `anon` policy, so a direct select
 * would return nothing — and loosening the policy to make it work would expose
 * every certificate in the project. The function returns exactly the fields a
 * verifier is entitled to see, and nothing else: no email, no student id, no
 * check-in token.
 *
 * A caller who cannot guess a 256-bit token learns nothing, so an invalid token
 * is reported as "not found" rather than as a distinguishable error.
 */

type VerificationRow = {
  certificate_type: string
  award: string
  issued_at: string
  recipient_name: string
  recipient_role: string
  recipient_title: string
  recipient_organization: string
  event_id: string
  event_name: string
  event_venue: string
  event_date: string
}

export type CertificateVerification = {
  certificateType: string
  /** Human title, e.g. "Certificate of Appreciation". */
  certificateTitle: string
  award: string
  issuedAt: string
  recipientName: string
  /** The stored role, e.g. `Speaker`. */
  recipientRole: string
  recipientRoleLabel: string
  /** Free-text speaker title. Omitted when the recipient is not a speaker. */
  recipientTitle: string | null
  recipientOrganization: string | null
  eventId: string
  eventName: string
  eventVenue: string
  eventDate: string
}

function toTitle(certificateType: string): string {
  const preset = CERTIFICATE_PRESETS[certificateType as CertificateType]
  return preset ? preset.title : `Certificate of ${certificateType}`
}

/**
 * Resolves a verification token, or null when it does not exist.
 *
 * Null covers every failure — unknown token, deleted certificate, deleted
 * recipient, deleted event — because distinguishing them for an unauthenticated
 * caller would leak whether a certificate ever existed.
 */
export async function verifyCertificateToken(
  token: string
): Promise<CertificateVerification | null> {
  const trimmed = token.trim()
  // Cheap shape check before a round trip. The real check is the query.
  if (trimmed.length < 32) return null

  const client = await createClient()
  const { data, error } = await client.rpc('get_certificate_verification', {
    p_token: trimmed,
  })

  if (error) return null

  const row = (data as VerificationRow[] | null)?.[0]
  if (!row) return null

  return {
    certificateType: row.certificate_type,
    certificateTitle: toTitle(row.certificate_type),
    award: row.award?.trim() ?? '',
    issuedAt: row.issued_at,
    recipientName: row.recipient_name,
    recipientRole: row.recipient_role,
    recipientRoleLabel: participantTypeLabelForRole(row.recipient_role),
    // Empty string from SQL NULL handling, not a meaningful organization.
    recipientTitle: row.recipient_title?.trim() || null,
    recipientOrganization: row.recipient_organization?.trim() || null,
    eventId: row.event_id,
    eventName: row.event_name,
    eventVenue: row.event_venue,
    eventDate: row.event_date,
  }
}

export type { Database }
