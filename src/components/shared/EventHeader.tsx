import { CalendarDays, MapPin, UserCog } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { EventRow } from '@/features/events/repositories/eventRepository'
import { formatEventDate, formatEventTime } from '@/lib/format'

type EventHeaderProps = {
  event: EventRow
  sharePath: string
}

/** §7 event header: name, date, venue, and how the participant page is reached. */
export function EventHeader({ event, sharePath }: EventHeaderProps) {
  return (
    <header className="flex flex-col gap-5">
      <div
        className="from-primary/12 to-chart-2/12 rounded-2xl border p-5 sm:p-6"
        style={{ borderLeftWidth: 6, borderLeftColor: event.theme }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
            {event.name}
          </h1>
          <Badge variant={event.registration_open ? 'default' : 'secondary'}>
            {event.registration_open ? 'Registration open' : 'Registration closed'}
          </Badge>
        </div>

        <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4" aria-hidden="true" />
            {formatEventDate(event.date)}
            <span className="text-muted-foreground/70">
              {formatEventTime(event.start_time)} – {formatEventTime(event.end_time)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <MapPin className="size-4" aria-hidden="true" />
            {event.venue}
          </span>
          <span className="flex items-center gap-2">
            <UserCog className="size-4" aria-hidden="true" />
            {event.organizer_name}
          </span>
        </p>
      </div>

      <p className="text-muted-foreground text-sm">
        Participant page:{' '}
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs break-all">{sharePath}</code>
      </p>
    </header>
  )
}
