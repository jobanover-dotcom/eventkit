import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert } from '@/types/database.types'

type Client = SupabaseClient<Database>

export type EventRow = Tables<'events'>

export type EventSummary = {
  id: string
  name: string
  date: string
  venue: string
  theme: string
  registrationOpen: boolean
}

const SUMMARY_COLUMNS = 'id, name, date, venue, theme, registration_open' as const

function toSummary(
  row: Pick<EventRow, 'id' | 'name' | 'date' | 'venue' | 'theme' | 'registration_open'>
): EventSummary {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    venue: row.venue,
    theme: row.theme,
    registrationOpen: row.registration_open,
  }
}

/**
 * Every organizer query filters by `organizer_id` explicitly. That is not
 * redundant with RLS: any authenticated user may read *published* events, so
 * without this filter the organizer's own event list would include other
 * people's events.
 */
export async function insertEvent(
  client: Client,
  values: TablesInsert<'events'>
): Promise<EventRow | null> {
  const { data, error } = await client.from('events').insert(values).select().single()
  if (error) throw error
  return data
}

export async function selectOrganizerEvents(
  client: Client,
  organizerId: string
): Promise<EventSummary[]> {
  const { data, error } = await client
    .from('events')
    .select(SUMMARY_COLUMNS)
    .eq('organizer_id', organizerId)
    .order('date', { ascending: false })

  if (error) throw error
  return data.map(toSummary)
}

/** Returns null when the event does not exist or is not owned by this organizer. */
export async function selectOwnedEvent(
  client: Client,
  eventId: string,
  organizerId: string
): Promise<EventRow | null> {
  const { data, error } = await client
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('organizer_id', organizerId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function countParticipants(client: Client, eventId: string): Promise<number> {
  const { count, error } = await client
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)

  if (error) throw error
  return count ?? 0
}

export async function countCheckedIn(client: Client, eventId: string): Promise<number> {
  const { count, error } = await client
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)

  if (error) throw error
  return count ?? 0
}
