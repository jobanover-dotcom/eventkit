import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/features/auth/services/getCurrentOrganizer'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import { selectOwnedEvent, type EventRow } from '@/features/events/repositories/eventRepository'
import {
  selectEventParticipants,
  type ParticipantRow,
} from '@/features/participants/repositories/participantRepository'
import { selectEventAttendance } from '@/features/attendance/repositories/attendanceRepository'
import type { EventBrand, ParticipantInfo } from '@/features/design/types'
import {
  listCertificateTemplates,
  type CertificateTemplate,
} from '@/features/certificates/services/certificateTemplateService'
import {
  listPhotoFrameTemplates,
  type PhotoFrameTemplate,
} from '@/features/design/services/photoFrameTemplateService'

/**
 * Everything the Design module needs, loaded once per page and authorized once.
 *
 * The whole module is read-only: templates are static, generation happens in the
 * browser, and nothing here writes. That is deliberate for the MVP — there is no
 * privileged operation for a Server Action to guard, and no new table.
 */

export type DesignContext = {
  eventId: string
  event: EventBrand
  participants: ParticipantInfo[]
  checkedInCount: number
  /**
   * Organizer-uploaded certificate templates, as plain records. The artwork URL
   * is a short-lived signed link from the private bucket; nothing here is a
   * public asset URL.
   */
  customTemplates: CertificateTemplate[]
  /**
   * Organizer-uploaded photo frames, as plain records. Same private signed link
   * as certificates; the photo area is found in the artwork when it is loaded to
   * render, so nothing about it travels through this object.
   */
  customPhotoFrames: PhotoFrameTemplate[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isEventId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * The event fields a design may draw.
 *
 * Exported because two authorization levels need it: the organizer's design
 * pages and the public photo-frame page both render the same frames from the
 * same event row. Keeping one mapping is what stops a public frame showing
 * different text from the one its organizer sees.
 *
 * `EventRow` is the only field an `EventBrand` is built from, so an event is
 * readable by both `getDesignContext` and `getPublicEvent` and this function
 * needs no source of its own.
 */
export function toEventBrand(event: EventRow): EventBrand {
  return {
    name: event.name,
    theme: event.theme,
    logoUrl: event.logo_url,
    coverImageUrl: event.cover_image_url,
    date: event.date,
    startTime: event.start_time,
    endTime: event.end_time,
    venue: event.venue,
    organizerName: event.organizer_name,
    description: event.description,
  }
}

function toParticipantInfo(
  row: ParticipantRow,
  checkedInParticipantIds: ReadonlySet<string>
): ParticipantInfo {
  // `student_id` is the participant's own code. It is nullable, so fall back to
  // a short slice of the opaque id rather than showing an empty field.
  const code = row.student_id?.trim() || row.id.slice(0, 8).toUpperCase()

  return {
    id: row.id,
    name: row.name,
    code,
    course: row.course,
    yearSection: row.year_section,
    sourceRole: row.role,
    // Speaker credentials. Null for an ordinary participant, which is what a
    // template renders as an empty slot rather than a placeholder string.
    title: row.title,
    organization: row.organization,
    // The token is what a badge QR encodes. It never leaves this object in any
    // other form, and never travels to a client that is not the owner.
    qrToken: row.qr_token,
    checkedIn: checkedInParticipantIds.has(row.id),
  }
}

/**
 * Authorizes the caller, then loads the event and its participants.
 *
 * An event owned by somebody else raises NOT_FOUND rather than FORBIDDEN, so
 * the design pages cannot be used to confirm that an event exists.
 */
export async function getDesignContext(eventId: string): Promise<DesignContext> {
  if (!isEventId(eventId)) {
    throw new AppError(ACTION_ERROR_CODES.NOT_FOUND, 'That event does not exist.')
  }

  const organizer = await requireOrganizer()
  const client = await createClient()

  const event = await selectOwnedEvent(client, eventId, organizer.id)
  if (!event) {
    throw new AppError(
      ACTION_ERROR_CODES.NOT_FOUND,
      'That event does not exist, or it belongs to another organizer.'
    )
  }

  const [participantRows, attendance, customTemplates, customPhotoFrames] = await Promise.all([
    selectEventParticipants(client, eventId),
    selectEventAttendance(client, eventId),
    // A failure here must not take the whole page down: the built-in templates
    // still work, so custom templates are treated as an optional extra.
    listCertificateTemplates(event.id).catch(() => [] as CertificateTemplate[]),
    listPhotoFrameTemplates(event.id).catch(() => [] as PhotoFrameTemplate[]),
  ])

  const checkedInParticipantIds = new Set(attendance.map((row) => row.participant_id))

  return {
    eventId: event.id,
    event: toEventBrand(event),
    participants: participantRows.map((row) => toParticipantInfo(row, checkedInParticipantIds)),
    checkedInCount: checkedInParticipantIds.size,
    customTemplates,
    customPhotoFrames,
  }
}
