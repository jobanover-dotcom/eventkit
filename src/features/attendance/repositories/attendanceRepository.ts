import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database.types'
import type { AttendanceRecord } from '@/features/attendance/types'

type Client = SupabaseClient<Database>

/**
 * Attendance reads and the one write this module performs.
 *
 * The table has SELECT and INSERT policies for the owning organizer and
 * deliberately **no UPDATE or DELETE policy**: a check-in is immutable, so
 * attendance can only be appended, never rewritten. That is why the only
 * mutation here is an insert.
 */

export type AttendanceRow = Tables<'attendance'>

export async function selectEventAttendance(
  client: Client,
  eventId: string
): Promise<AttendanceRow[]> {
  const { data, error } = await client
    .from('attendance')
    .select('id, event_id, participant_id, checked_in_at')
    .eq('event_id', eventId)

  if (error) throw error
  return data
}

export async function selectAttendanceForParticipant(
  client: Client,
  eventId: string,
  participantId: string
): Promise<AttendanceRecord | null> {
  const { data, error } = await client
    .from('attendance')
    .select('participant_id, checked_in_at')
    .eq('event_id', eventId)
    .eq('participant_id', participantId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return { participantId: data.participant_id, checkedInAt: data.checked_in_at }
}

/**
 * Appends a check-in, absorbing a duplicate.
 *
 * `ignoreDuplicates` maps onto the `ON CONFLICT DO NOTHING` the migration
 * documents, so the `(event_id, participant_id)` unique index — not this
 * function — decides whether a row was written. The return value is how the
 * caller tells the two cases apart:
 *
 *   - one row  → this request created the check-in
 *   - no rows  → a concurrent scan already won; re-read for the real timestamp
 *
 * Returning an empty array rather than throwing on conflict is deliberate: a
 * rescan is a normal outcome at a busy door, not a failure.
 */
export async function insertAttendanceIgnoreDuplicate(
  client: Client,
  values: { event_id: string; participant_id: string }
): Promise<AttendanceRow[]> {
  const { data, error } = await client
    .from('attendance')
    .upsert(values, { onConflict: 'event_id,participant_id', ignoreDuplicates: true })
    .select('id, event_id, participant_id, checked_in_at')

  if (error) throw error
  return data ?? []
}
