import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getOwnedEvent } from '@/features/events/services/eventService'
import {
  insertSpeaker,
  selectEventSpeakers,
} from '@/features/speakers/repositories/speakerRepository'
import type { SpeakerValues } from '@/features/speakers/schemas/speaker.schema'
import type { SpeakerSummary } from '@/features/speakers/types'

/**
 * Organizer-only speaker commands.
 *
 * Speakers are not a separate population. They are participants with
 * `role = 'Speaker'`, which means they inherit the existing QR token, the
 * existing check-in scanner, the existing attendance rows, and the existing
 * pass — none of which knows or cares that a speaker is a different kind of
 * person at the door.
 *
 * The one rule that matters here: only an organizer can create one. Public
 * registration goes through `register_participant()`, which takes no role
 * argument, so a member of the public has no path to a speaker at all. This
 * service adds a second, independent check on top of that.
 */

export async function addSpeaker(values: SpeakerValues): Promise<SpeakerSummary> {
  // Ownership is proved before the write, and `eventId` is treated as
  // untrusted input rather than as proof of anything.
  await getOwnedEvent(values.eventId)

  return insertSpeaker(await createClient(), {
    eventId: values.eventId,
    name: values.name,
    email: values.email,
    organization: values.organization,
    title: values.title,
  })
}

export async function listEventSpeakers(eventId: string): Promise<SpeakerSummary[]> {
  await getOwnedEvent(eventId)
  return selectEventSpeakers(await createClient(), eventId)
}
