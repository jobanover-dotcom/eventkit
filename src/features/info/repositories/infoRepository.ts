import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesInsert } from '@/types/database.types'
import type { PublicRule, PublicScheduleItem } from '@/features/info/types'

type Client = SupabaseClient<Database>

/**
 * Reads and writes for the Info tables.
 *
 * The public reads carry **no** organizer filter on purpose:
 * `schedules_select_visible` and `rules_select_visible` already grant `anon` a
 * read when the event is published, and adding a filter here would hide the
 * pages from exactly the participants they exist for. A closed event returns
 * nothing, which is the intended behaviour.
 *
 * The inserts are organizer-scoped by RLS, but the service authorizes ownership
 * first regardless.
 */

type ScheduleRow = Database['public']['Tables']['schedules']['Row']
type RuleRow = Database['public']['Tables']['rules']['Row']

export async function selectEventSchedules(
  client: Client,
  eventId: string
): Promise<PublicScheduleItem[]> {
  const { data, error } = await client
    .from('schedules')
    .select('id, event_id, title, description, start_time, end_time, location, sort_order')
    .eq('event_id', eventId)

  if (error) throw error

  return (data as ScheduleRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    sortOrder: row.sort_order,
  }))
}

export async function selectEventRules(client: Client, eventId: string): Promise<PublicRule[]> {
  const { data, error } = await client
    .from('rules')
    .select('id, event_id, title, content, sort_order')
    .eq('event_id', eventId)

  if (error) throw error

  return (data as RuleRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    sortOrder: row.sort_order,
  }))
}

export async function insertScheduleItem(
  client: Client,
  values: TablesInsert<'schedules'>
): Promise<ScheduleRow> {
  const { data, error } = await client.from('schedules').insert(values).select().single()

  if (error) throw error
  return data
}

export async function insertRule(client: Client, values: TablesInsert<'rules'>): Promise<RuleRow> {
  const { data, error } = await client.from('rules').insert(values).select().single()

  if (error) throw error
  return data
}

/** The highest `sort_order` in use, so a new item lands at the end by default. */
async function nextSortOrder(
  client: Client,
  table: 'schedules' | 'rules',
  eventId: string
): Promise<number> {
  const { data, error } = await client
    .from(table)
    .select('sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: false })
    .limit(1)

  if (error) throw error

  const first = (data as { sort_order: number }[])[0]
  return first ? first.sort_order + 1 : 0
}

export function nextScheduleSortOrder(client: Client, eventId: string): Promise<number> {
  return nextSortOrder(client, 'schedules', eventId)
}

export function nextRuleSortOrder(client: Client, eventId: string): Promise<number> {
  return nextSortOrder(client, 'rules', eventId)
}
