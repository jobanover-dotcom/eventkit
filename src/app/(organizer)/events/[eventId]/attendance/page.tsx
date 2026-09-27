import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EventHeader } from '@/components/shared/EventHeader'
import { AttendanceStats } from '@/features/dashboard/components/AttendanceStats'
import { ParticipantFilterBar } from '@/features/attendance/components/ParticipantFilterBar'
import { ParticipantsTable } from '@/features/attendance/components/ParticipantsTable'
import { ExportCsvButton } from '@/features/attendance/components/ExportCsvButton'
import { attendanceFilename } from '@/features/attendance/lib/csv'
import { getEventRoster } from '@/features/attendance/services/attendanceService'
import { getOwnedEvent } from '@/features/events/services/eventService'
import type { EventStats } from '@/features/events/services/eventService'
import { isEventId } from '@/features/design/services/designService'
import { notFoundUnlessHidden } from '@/lib/page-errors'
import {
  isAttendanceFilter,
  isAttendanceGroup,
  isParticipantRole,
  isParticipantSort,
  type AttendanceFilter,
  type AttendanceGroup,
  type ParticipantSort,
} from '@/features/attendance/types'

type AttendancePageProps = {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{
    q?: string
    status?: string
    role?: string
    group?: string
    sort?: string
  }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Attendance' }
}

/**
 * Who has actually turned up.
 *
 * One authorized read feeds both the summary cards and the table, so the totals
 * can never disagree with the rows. After a check-in the scanner calls
 * `router.refresh()`, which re-runs this Server Component — simple revalidation
 * rather than a realtime subscription, which would be the wrong weight for a
 * single-organizer event.
 *
 * The `group` filter splits the door into participants and speakers, which is
 * the same distinction the certificate flow uses to keep the two apart.
 */
export default async function AttendancePage({ params, searchParams }: AttendancePageProps) {
  const { eventId } = await params
  const { q, status, role, group, sort } = await searchParams

  if (!isEventId(eventId)) notFound()

  const statusFilter: AttendanceFilter = isAttendanceFilter(status) ? status : 'all'
  const roleFilter = isParticipantRole(role) ? role : ''
  const groupFilter: AttendanceGroup = isAttendanceGroup(group) ? group : 'all'
  const sortOrder: ParticipantSort = isParticipantSort(sort) ? sort : 'checked_in_at'

  let event
  let roster
  try {
    ;[event, roster] = await Promise.all([
      getOwnedEvent(eventId),
      getEventRoster(eventId, {
        search: q,
        status: statusFilter,
        role: roleFilter,
        group: groupFilter,
        sort: sortOrder,
      }),
    ])
  } catch (error) {
    // An event owned by somebody else is indistinguishable from a missing one.
    // Anything else is a real fault and must not masquerade as a 404.
    notFoundUnlessHidden(error)
  }

  const stats: EventStats = {
    totalParticipants: roster.summary.total,
    checkedIn: roster.summary.checkedIn,
    notCheckedIn: roster.summary.notCheckedIn,
  }

  const basePath = `/events/${eventId}/attendance`

  return (
    <div className="flex flex-col gap-8">
      <EventHeader event={event} sharePath={`/events/${event.id}`} />

      <AttendanceStats stats={stats} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-bold">Attendance</h2>
          <p className="text-muted-foreground text-sm">
            {roster.summary.checkedIn} of {roster.summary.total} checked in ·{' '}
            {roster.summary.notCheckedIn} still to arrive
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ExportCsvButton rows={roster.rows} filename={attendanceFilename(event.name, event.id)} />
        </div>

        <ParticipantFilterBar
          basePath={basePath}
          search={q ?? ''}
          status={statusFilter}
          role={roleFilter}
          roles={roster.roles}
          showRoleFilter
          group={groupFilter}
          showGroupFilter={roster.hasSpeakers}
        />

        <ParticipantsTable
          rows={roster.filtered}
          eventId={eventId}
          emptyMessage={
            roster.summary.total === 0
              ? 'Nobody has registered yet.'
              : 'No participants match these filters.'
          }
        />
      </section>
    </div>
  )
}
