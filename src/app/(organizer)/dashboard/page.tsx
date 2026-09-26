import Link from 'next/link'
import { CalendarDays, MapPin, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listOrganizerEvents } from '@/features/events/services/eventService'
import { formatEventDate } from '@/lib/format'

export default async function OrganizerDashboardPage() {
  const events = await listOrganizerEvents()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Your events</h1>
          <p className="text-muted-foreground">
            {events.length === 0
              ? 'Nothing here yet. Create your first event to get started.'
              : `${events.length} event${events.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button asChild>
          <Link href="/events/new">
            <Plus aria-hidden="true" />
            Create event
          </Link>
        </Button>
      </header>

      {events.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-4 py-12">
            <h2 className="font-heading text-xl font-bold">No events yet</h2>
            <p className="text-muted-foreground max-w-prose">
              An event holds the name, date, venue, and branding that every badge, certificate,
              poster, and participant page reuses.
            </p>
            <Button asChild>
              <Link href="/events/new">
                <Plus aria-hidden="true" />
                Create your first event
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}/dashboard`}
                className="hover:border-primary/40 focus-visible:ring-ring block h-full rounded-2xl border transition-colors focus-visible:ring-3"
              >
                <Card className="h-full border-0 shadow-none">
                  <span
                    aria-hidden="true"
                    className="block h-1.5 w-full rounded-t-2xl"
                    style={{ backgroundColor: event.theme }}
                  />
                  <CardContent className="flex h-full flex-col gap-3 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-heading leading-tight font-bold">{event.name}</h2>
                      {!event.registrationOpen && (
                        <Badge variant="secondary" className="shrink-0">
                          Closed
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                      {formatEventDate(event.date)}
                    </p>
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <MapPin className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{event.venue}</span>
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
