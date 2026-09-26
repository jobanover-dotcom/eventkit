import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/features/auth/services/getCurrentOrganizer'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import {
  countCheckedIn,
  countParticipants,
  insertEvent,
  selectOrganizerEvents,
  selectOwnedEvent,
  type EventRow,
  type EventSummary,
} from '@/features/events/repositories/eventRepository'
import type { EventValues } from '@/features/events/schemas/event.schema'

export type EventStats = {
  totalParticipants: number
  checkedIn: number
  notCheckedIn: number
}

export type OwnedEvent = EventRow & { stats: EventStats }

export async function createEvent(input: EventValues): Promise<EventRow> {
  const organizer = await requireOrganizer()
  const client = await createClient()

  const created = await insertEvent(client, {
    organizer_id: organizer.id,
    name: input.name.trim(),
    description: input.description.trim(),
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    venue: input.venue.trim(),
    organizer_name: input.organizerName.trim(),
    theme: input.theme,
    registration_open: input.registrationOpen,
  })

  if (!created) {
    throw new AppError(
      ACTION_ERROR_CODES.CONFLICT,
      'The event could not be created. Please try again.'
    )
  }

  return created
}

export async function listOrganizerEvents(): Promise<EventSummary[]> {
  const organizer = await requireOrganizer()
  return selectOrganizerEvents(await createClient(), organizer.id)
}

/**
 * Returns the event plus its live attendance counts.
 *
 * An event owned by somebody else is reported as NOT_FOUND rather than
 * FORBIDDEN so the dashboard does not confirm that the event exists.
 */
export async function getOwnedEventWithStats(eventId: string): Promise<OwnedEvent> {
  const organizer = await requireOrganizer()
  const client = await createClient()

  const event = await selectOwnedEvent(client, eventId, organizer.id)
  if (!event) {
    throw new AppError(
      ACTION_ERROR_CODES.NOT_FOUND,
      'That event does not exist, or it belongs to another organizer.'
    )
  }

  const [totalParticipants, checkedIn] = await Promise.all([
    countParticipants(client, eventId),
    countCheckedIn(client, eventId),
  ])

  return {
    ...event,
    stats: {
      totalParticipants,
      checkedIn,
      notCheckedIn: Math.max(0, totalParticipants - checkedIn),
    },
  }
}
