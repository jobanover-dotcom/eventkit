import type { Metadata } from 'next'
import { InfoEmptyState, InfoPageShell } from '@/features/info/components/InfoPageShell'
import { ScheduleList } from '@/features/info/components/ScheduleList'
import { AddScheduleItemForm } from '@/features/info/components/AddScheduleItemForm'
import { getPublicSchedule } from '@/features/info/services/infoService'
import { formatEventDate } from '@/lib/format'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type SchedulePageProps = {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = {
  title: 'Schedule',
  description: 'The programme for this event.',
}

/**
 * The public programme.
 *
 * Readable with no session, which is why `/schedule` is deliberately absent from
 * the organizer route pattern in `src/lib/auth/routes.ts` — the proxy would
 * otherwise redirect participants to the login page before this rendered.
 *
 * The owner-only form is a convenience; `addScheduleItemAction` authorizes
 * ownership independently, so hiding it is not the control.
 */
export default async function SchedulePage({ params }: SchedulePageProps) {
  const { eventId } = await params

  let schedule
  try {
    schedule = await getPublicSchedule(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  return (
    <InfoPageShell
      eventId={schedule.event.id}
      eventName={schedule.event.name}
      title="Schedule"
      description={`Programme for ${formatEventDate(schedule.event.date)}.`}
    >
      {schedule.items.length > 0 ? (
        <ScheduleList slots={schedule.slots} />
      ) : (
        <InfoEmptyState message="No schedule has been published yet." />
      )}

      {schedule.isOrganizer && (
        <section aria-label="Organizer tools" className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">Organizer</h2>
          <AddScheduleItemForm eventId={schedule.event.id} />
        </section>
      )}
    </InfoPageShell>
  )
}
