import type { Metadata } from 'next'
import Link from 'next/link'
import { EventHeader } from '@/components/shared/EventHeader'
import { AddSpeakerForm } from '@/features/speakers/components/AddSpeakerForm'
import { listEventSpeakers } from '@/features/speakers/services/speakerService'
import { ParticipantFilterBar } from '@/features/attendance/components/ParticipantFilterBar'
import { ParticipantsTable } from '@/features/attendance/components/ParticipantsTable'
import { getEventRoster } from '@/features/attendance/services/attendanceService'
import { getOwnedEvent } from '@/features/events/services/eventService'
import {
  isAttendanceFilter,
  isAttendanceGroup,
  isParticipantRole,
  type AttendanceFilter,
  type AttendanceGroup,
} from '@/features/attendance/types'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type ParticipantsPageProps = {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ q?: string; status?: string; role?: string; group?: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Participants' }
}

/**
 * Everyone registered for this event, plus the speaker list and the form that
 * adds to it.
 *
 * Filtering runs on the server against a single authorized read, so the browser
 * never holds rows it should not see and there is only one data path. Filter
 * state lives in the URL, which makes a filtered roster shareable and the back
 * button behave.
 *
 * Speakers are participants with a role, so they appear in the same roster and
 * can be filtered with the same control. Adding one is a separate, organizer-only
 * form because public registration has no way to create a speaker.
 */
export default async function ParticipantsPage({ params, searchParams }: ParticipantsPageProps) {
  const { eventId } = await params
  const { q, status, role, group } = await searchParams

  const statusFilter: AttendanceFilter = isAttendanceFilter(status) ? status : 'all'
  const roleFilter = isParticipantRole(role) ? role : ''
  const groupFilter: AttendanceGroup = isAttendanceGroup(group) ? group : 'all'

  let event
  let roster
  let speakers
  try {
    ;[event, roster, speakers] = await Promise.all([
      getOwnedEvent(eventId),
      getEventRoster(eventId, {
        search: q,
        status: statusFilter,
        role: roleFilter,
        group: groupFilter,
        sort: 'name',
      }),
      listEventSpeakers(eventId),
    ])
  } catch (error) {
    // An event owned by somebody else is indistinguishable from a missing one.
    // A database or code fault is not, and must surface as a 500.
    notFoundUnlessHidden(error)
  }

  const basePath = `/events/${eventId}/participants`

  return (
    <div className="flex flex-col gap-8">
      <EventHeader event={event} sharePath={`/events/${event.id}`} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-bold">Participants</h2>
          <p className="text-muted-foreground text-sm">
            {roster.summary.total === 0
              ? 'Nobody has registered yet. Share the event link to get started.'
              : `${roster.filtered.length} of ${roster.summary.total} shown · ${roster.summary.checkedIn} checked in`}
          </p>
        </div>

        <ParticipantFilterBar
          basePath={basePath}
          search={q ?? ''}
          status={statusFilter}
          role={roleFilter}
          roles={roster.roles}
          group={groupFilter}
          showGroupFilter={roster.hasSpeakers}
        />

        <ParticipantsTable
          rows={roster.filtered}
          eventId={eventId}
          emptyMessage={
            roster.summary.total === 0
              ? 'No registrations yet.'
              : 'No participants match these filters.'
          }
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-bold">Speakers</h2>
          <p className="text-muted-foreground text-sm">
            {speakers.length === 0
              ? 'No speakers yet. Add one below to give them a pass.'
              : `${speakers.length} speaker${speakers.length === 1 ? '' : 's'} added. They check in with the same scanner as everybody else.`}
          </p>
        </div>

        {speakers.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {speakers.map((speaker) => (
              <li key={speaker.id}>
                <Link
                  href={`/events/${eventId}/participants/${speaker.id}`}
                  className="hover:border-primary/50 flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{speaker.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {[speaker.title, speaker.organization].filter(Boolean).join(' · ') || 'Speaker'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <AddSpeakerForm eventId={eventId} />
      </section>
    </div>
  )
}
