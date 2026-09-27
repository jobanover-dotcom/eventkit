import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/features/auth/services/getCurrentOrganizer'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import { selectOwnedEvent, type EventRow } from '@/features/events/repositories/eventRepository'
import { getPublicEvent } from '@/features/events/services/eventService'
import { readHeaderBytes, sniffAcceptedImageType } from '@/features/info/lib/imageType'
import {
  insertRule,
  insertScheduleItem,
  nextRuleSortOrder,
  nextScheduleSortOrder,
  selectEventRules,
  selectEventSchedules,
} from '@/features/info/repositories/infoRepository'
import {
  groupIntoSlots,
  sortRules,
  sortScheduleItems,
  type ScheduleSlot,
} from '@/features/info/lib/sort'
import type { PublicRule, PublicScheduleItem, PublicVenue } from '@/features/info/types'
import {
  MAP_IMAGE_TYPES,
  MAX_MAP_BYTES,
  type MapImageType,
  type RuleValues,
  type ScheduleItemValues,
} from '@/features/info/schemas/info.schema'

/**
 * The participant-facing Info pages, plus the owner-only commands that fill them.
 *
 * Every read goes through `getPublicEvent` first, so a page for a closed or
 * nonexistent event 404s rather than rendering an empty list that looks like
 * "nothing published yet". That distinction matters: a participant following a
 * stale link should not be told the schedule is empty.
 */

/**
 * Each read carries `isOrganizer` so a page needs one call rather than an event
 * read and a separate ownership check. It is the same value `getPublicEvent`
 * computes, not a second opinion.
 */
export type PublicSchedule = {
  event: Pick<EventRow, 'id' | 'name' | 'date'>
  items: PublicScheduleItem[]
  slots: ScheduleSlot[]
  isOrganizer: boolean
}

export type PublicRules = {
  event: Pick<EventRow, 'id' | 'name'>
  rules: PublicRule[]
  isOrganizer: boolean
}

export type PublicMap = {
  event: Pick<EventRow, 'id' | 'name' | 'date' | 'start_time' | 'end_time' | 'organizer_name'>
  venue: PublicVenue
  isOrganizer: boolean
}

export async function getPublicSchedule(eventId: string): Promise<PublicSchedule> {
  const { event, isOrganizer } = await getPublicEventOrThrow(eventId)
  const items = sortScheduleItems(await selectEventSchedules(await createClient(), eventId))

  return {
    event: { id: event.id, name: event.name, date: event.date },
    items,
    slots: groupIntoSlots(items),
    isOrganizer,
  }
}

export async function getPublicRules(eventId: string): Promise<PublicRules> {
  const { event, isOrganizer } = await getPublicEventOrThrow(eventId)
  const rules = sortRules(await selectEventRules(await createClient(), eventId))

  return { event: { id: event.id, name: event.name }, rules, isOrganizer }
}

export async function getPublicMap(eventId: string): Promise<PublicMap> {
  const { event, isOrganizer } = await getPublicEventOrThrow(eventId)

  return {
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      start_time: event.start_time,
      end_time: event.end_time,
      organizer_name: event.organizer_name,
    },
    venue: { name: event.name, venue: event.venue, mapUrl: event.map_url },
    isOrganizer,
  }
}

/**
 * Loads the event through the public reader so an unpublished event raises
 * NOT_FOUND. Callers are Server Components, which turn that into a 404.
 */
async function getPublicEventOrThrow(eventId: string) {
  return getPublicEvent(eventId)
}

// --- owner-only authoring ---------------------------------------------------

/**
 * Every command below re-authorizes from scratch: a hidden form is a
 * convenience, never the control. The `eventId` in the payload is treated as
 * untrusted and matched against the session's organizer.
 */
async function requireOwnedEvent(eventId: string): Promise<EventRow> {
  const organizer = await requireOrganizer()
  const event = await selectOwnedEvent(await createClient(), eventId, organizer.id)

  if (!event) {
    // NOT_FOUND, not FORBIDDEN: a public page must not confirm that somebody
    // else's event exists.
    throw new AppError(
      ACTION_ERROR_CODES.NOT_FOUND,
      'That event does not exist, or it belongs to another organizer.'
    )
  }

  return event
}

export async function addScheduleItem(values: ScheduleItemValues): Promise<PublicScheduleItem> {
  const event = await requireOwnedEvent(values.eventId)
  const client = await createClient()
  const sortOrder = await nextScheduleSortOrder(client, event.id)

  const created = await insertScheduleItem(client, {
    event_id: event.id,
    title: values.title,
    description: '',
    start_time: values.startTime,
    end_time: values.endTime,
    location: values.location,
    sort_order: sortOrder,
  })

  return {
    id: created.id,
    title: created.title,
    description: created.description,
    startTime: created.start_time,
    endTime: created.end_time,
    location: created.location,
    sortOrder: created.sort_order,
  }
}

export async function addRule(values: RuleValues): Promise<PublicRule> {
  const event = await requireOwnedEvent(values.eventId)
  const client = await createClient()
  const sortOrder = await nextRuleSortOrder(client, event.id)

  const created = await insertRule(client, {
    event_id: event.id,
    title: values.title,
    content: values.content,
    sort_order: sortOrder,
  })

  return {
    id: created.id,
    title: created.title,
    content: created.content,
    sortOrder: created.sort_order,
  }
}

// --- map image --------------------------------------------------------------

/** Keyed by the sniffed type, never by the client-declared one. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * Uploads an event map and points `events.map_url` at it.
 *
 * The file lands in the existing `event-assets` bucket, which is already public
 * so participants can read it, and whose write policies require the first path
 * segment to be the caller's uid — the documented `{organizer_id}/{event_id}/…`
 * convention. No new bucket and no migration.
 *
 * The upload uses the caller's own session, never a service-role key, so the
 * storage policy is a real second check rather than a bypassed one.
 */
export async function uploadEventMap(eventId: string, file: File): Promise<{ mapUrl: string }> {
  const event = await requireOwnedEvent(eventId)
  const client = await createClient()

  if (!MAP_IMAGE_TYPES.includes(file.type as MapImageType)) {
    throw new AppError(
      ACTION_ERROR_CODES.UPLOAD_REJECTED,
      'Choose a PNG, JPEG, WebP, or GIF image.'
    )
  }

  if (file.size === 0) {
    throw new AppError(ACTION_ERROR_CODES.UPLOAD_REJECTED, 'That file is empty.')
  }

  if (file.size > MAX_MAP_BYTES) {
    throw new AppError(ACTION_ERROR_CODES.UPLOAD_REJECTED, 'The map image must be 5 MB or smaller.')
  }

  // The declared type is client-supplied, so the bytes decide. This is also the
  // only check that works here: a Server Action handles the file on the server,
  // where `createImageBitmap` does not exist in Node.
  const header = await readHeaderBytes(file)
  const actualType = sniffAcceptedImageType(header)

  if (!actualType) {
    throw new AppError(
      ACTION_ERROR_CODES.UPLOAD_REJECTED,
      'That file is not a PNG, JPEG, WebP, or GIF image.'
    )
  }

  // A declared type that disagrees with the bytes means a renamed file, which is
  // never a legitimate upload.
  if (file.type && file.type !== actualType) {
    throw new AppError(ACTION_ERROR_CODES.UPLOAD_REJECTED, 'That file is not a valid image.')
  }

  const extension = EXTENSION_BY_TYPE[actualType]
  const objectPath = `${event.organizer_id}/${event.id}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await client.storage
    .from('event-assets')
    .upload(objectPath, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    // The detail is logged rather than returned: storage errors can carry bucket
    // policy text that has no business in front of a participant.
    throw new AppError(
      ACTION_ERROR_CODES.UPLOAD_REJECTED,
      'The map image could not be uploaded. Please try again.'
    )
  }

  // `getPublicUrl` is synchronous and cannot fail: it builds the URL for a
  // public bucket. The bucket is `public: true`, so participants can fetch this
  // without a session and no SELECT policy is needed.
  const { data: urlData } = client.storage.from('event-assets').getPublicUrl(objectPath)
  const publicUrl = urlData.publicUrl

  if (!publicUrl) {
    await client.storage
      .from('event-assets')
      .remove([objectPath])
      .catch(() => undefined)
    throw new AppError(ACTION_ERROR_CODES.INTERNAL_ERROR, 'The map image could not be published.')
  }

  const { error: updateError } = await client
    .from('events')
    .update({ map_url: publicUrl })
    .eq('id', event.id)

  if (updateError) {
    // Do not leave an orphaned object behind if the row could not be pointed at it.
    await client.storage
      .from('event-assets')
      .remove([objectPath])
      .catch(() => undefined)
    throw new AppError(ACTION_ERROR_CODES.INTERNAL_ERROR, 'The map image could not be saved.')
  }

  // Best effort: the previous map is superseded, but a failure here must not
  // fail an otherwise successful upload.
  if (event.map_url) await removeSupersededMap(client, event.map_url, event.organizer_id)

  return { mapUrl: publicUrl }
}

/**
 * Deletes the object behind a previous `map_url`, ignoring any failure.
 *
 * The path is re-derived from the URL and then checked against the organizer's
 * own prefix, so a hand-edited `map_url` pointing at somebody else's object can
 * never turn a replace into a delete of another organizer's file.
 */
async function removeSupersededMap(
  client: Awaited<ReturnType<typeof createClient>>,
  previousUrl: string,
  organizerId: string
): Promise<void> {
  const marker = '/object/public/event-assets/'
  const index = previousUrl.indexOf(marker)
  if (index === -1) return

  let path: string
  try {
    path = decodeURIComponent(previousUrl.slice(index + marker.length))
  } catch {
    return
  }

  if (!path.startsWith(`${organizerId}/`)) return
  if (path.includes('..')) return

  await client.storage
    .from('event-assets')
    .remove([path])
    .catch(() => undefined)
}
