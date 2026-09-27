import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

type Client = SupabaseClient<Database>

/**
 * Participant reads for organizer-only surfaces.
 *
 * The `participants` table grants nothing to `anon` and RLS scopes every read to
 * the owning organizer, but the repository still filters by event explicitly so
 * a query never depends on policy alone.
 */

const PARTICIPANT_COLUMNS =
  'id, event_id, name, student_id, email, course, year_section, role, organization, title, qr_token, created_at' as const

export type ParticipantRow = {
  id: string
  event_id: string
  name: string
  student_id: string | null
  email: string | null
  course: string | null
  year_section: string | null
  role: string
  /** Speaker affiliation. Null for an ordinary participant. */
  organization: string | null
  /** Free-text speaker title, e.g. "Keynote Speaker". Null for an ordinary participant. */
  title: string | null
  qr_token: string
  created_at: string
}

export async function selectEventParticipants(
  client: Client,
  eventId: string
): Promise<ParticipantRow[]> {
  const { data, error } = await client
    .from('participants')
    .select(PARTICIPANT_COLUMNS)
    .eq('event_id', eventId)
    .order('name', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Looks a participant up by their QR token, with no event filter.
 *
 * RLS already limits the result to the calling organizer's own participants, so
 * a token belonging to a stranger's event matches nothing at all. The
 * `event_id` is returned rather than filtered so the caller can tell "not
 * registered for this event" apart from "no such code" — both of which are
 * ordinary at a door and are reported differently.
 */
export async function selectParticipantByToken(
  client: Client,
  token: string
): Promise<ParticipantRow | null> {
  const { data, error } = await client
    .from('participants')
    .select(PARTICIPANT_COLUMNS)
    .eq('qr_token', token)
    .maybeSingle()

  if (error) throw error
  return data
}

/** One participant scoped to an event, used by the organizer pass view. */
export async function selectEventParticipant(
  client: Client,
  eventId: string,
  participantId: string
): Promise<ParticipantRow | null> {
  const { data, error } = await client
    .from('participants')
    .select(PARTICIPANT_COLUMNS)
    .eq('event_id', eventId)
    .eq('id', participantId)
    .maybeSingle()

  if (error) throw error
  return data
}
