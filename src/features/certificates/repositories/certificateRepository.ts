import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { IssuedCertificate } from '@/features/certificates/lib/eligibility'

type Client = SupabaseClient<Database>
type CertificateRow = Database['public']['Tables']['certificates']['Row']

/**
 * Certificate persistence.
 *
 * Reads and writes are organizer-scoped by RLS; the service authorizes the event
 * first regardless, so a policy change cannot silently become the only
 * authorization. The insert path deliberately goes through the plain table
 * rather than a stored procedure so the existing `certificates_insert_organizer`
 * policy — which refuses a recipient with no attendance row — is the thing that
 * enforces the eligibility rule.
 */

const CERTIFICATE_COLUMNS =
  'id, event_id, participant_id, certificate_type, award, signatory, verification_token, issued_at' as const

export async function selectEventCertificates(
  client: Client,
  eventId: string
): Promise<IssuedCertificate[]> {
  const { data, error } = await client
    .from('certificates')
    .select(CERTIFICATE_COLUMNS)
    .eq('event_id', eventId)

  if (error) throw error

  return (data as CertificateRow[]).map((row) => ({
    participantId: row.participant_id,
    certificateType: row.certificate_type,
    issuedAt: row.issued_at,
    verificationToken: row.verification_token,
  }))
}

/**
 * Finds the existing record for one recipient, if there is one.
 *
 * Read before the write so regeneration can preserve `verification_token`. A QR
 * somebody has already printed or framed keeps working; only the wording of the
 * certificate changes.
 */
export async function selectCertificateForParticipant(
  client: Client,
  eventId: string,
  participantId: string
): Promise<CertificateRow | null> {
  const { data, error } = await client
    .from('certificates')
    .select(CERTIFICATE_COLUMNS)
    .eq('event_id', eventId)
    .eq('participant_id', participantId)
    .maybeSingle()

  if (error) throw error

  // `maybeSingle()` returns a row or null. Normalised here anyway: an empty
  // array is truthy, so a list-shaped empty result would otherwise be treated as
  // an existing certificate and silently take the regeneration path.
  const row = Array.isArray(data) ? (data[0] ?? null) : data
  return (row as CertificateRow | null) ?? null
}

export async function insertCertificate(
  client: Client,
  values: {
    eventId: string
    participantId: string
    certificateType: string
    award?: string
    signatory?: string
  }
): Promise<CertificateRow> {
  const { data, error } = await client
    .from('certificates')
    .insert({
      event_id: values.eventId,
      participant_id: values.participantId,
      certificate_type: values.certificateType,
      award: values.award ?? '',
      signatory: values.signatory ?? '',
    })
    .select(CERTIFICATE_COLUMNS)
    .single()

  if (error) throw error
  return data as CertificateRow
}

/**
 * Updates an existing record in place.
 *
 * `verification_token` is deliberately absent from the update. It is the
 * certificate's public identity: rotating it would silently invalidate every
 * printed copy, so it only ever changes if the row is deleted and reissued.
 */
export async function updateCertificate(
  client: Client,
  id: string,
  values: { certificateType: string; award?: string; signatory?: string }
): Promise<CertificateRow> {
  const { data, error } = await client
    .from('certificates')
    .update({
      certificate_type: values.certificateType,
      award: values.award ?? '',
      signatory: values.signatory ?? '',
    })
    .eq('id', id)
    .select(CERTIFICATE_COLUMNS)
    .single()

  if (error) throw error
  return data as CertificateRow
}
