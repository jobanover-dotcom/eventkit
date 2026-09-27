import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { SPEAKER_ROLE } from '@/lib/participantType'
import type { SpeakerSummary } from '@/features/speakers/types'

type Client = SupabaseClient<Database>
type ParticipantRow = Database['public']['Tables']['participants']['Row']

/**
 * Speaker persistence.
 *
 * A speaker is a participant row, so the insert goes through the same table,
 * the same RLS, and the same database-generated `qr_token` as everybody else.
 * That is deliberate: a speaker must be scannable by the existing check-in
 * scanner without a parallel identity system.
 */

const SPEAKER_COLUMNS = 'id, name, email, organization, title, qr_token, role' as const

function toSummary(row: ParticipantRow): SpeakerSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organization: row.organization,
    title: row.title,
    qrToken: row.qr_token,
    participantType: 'SPEAKER',
  }
}

/**
 * Creates a speaker.
 *
 * `role` is hardcoded here and is not a parameter. RLS on `participants` already
 * refuses an insert for an event the caller does not own, and the service
 * authorizes ownership first regardless, so the only way to reach a
 * `role = 'Speaker'` row is an organizer acting on their own event.
 */
export async function insertSpeaker(
  client: Client,
  values: {
    eventId: string
    name: string
    email: string | null
    organization: string | null
    title: string | null
  }
): Promise<SpeakerSummary> {
  const { data, error } = await client
    .from('participants')
    .insert({
      event_id: values.eventId,
      name: values.name,
      email: values.email,
      organization: values.organization,
      title: values.title,
      role: SPEAKER_ROLE,
    })
    .select(SPEAKER_COLUMNS)
    .single()

  if (error) throw error

  return toSummary(data as ParticipantRow)
}

export async function selectEventSpeakers(
  client: Client,
  eventId: string
): Promise<SpeakerSummary[]> {
  const { data, error } = await client
    .from('participants')
    .select(SPEAKER_COLUMNS)
    .eq('event_id', eventId)
    .eq('role', SPEAKER_ROLE)
    .order('name', { ascending: true })

  if (error) throw error

  return (data as ParticipantRow[]).map(toSummary)
}
