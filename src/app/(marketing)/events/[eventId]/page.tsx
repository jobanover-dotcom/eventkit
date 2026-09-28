import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Frame, MapPin, UserCog } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatEventDate, formatEventTime } from '@/lib/format'
import { EventInfoNav } from '@/features/info/components/EventInfoNav'
import { getPublicEvent } from '@/features/events/services/eventService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type PublicEventPageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata({ params }: PublicEventPageProps): Promise<Metadata> {
  const { eventId } = await params
  try {
    const { event } = await getPublicEvent(eventId)
    return { title: event.name, description: event.description || undefined }
  } catch {
    return { title: 'Event' }
  }
}

/**
 * The public face of an event: the details a visitor needs, and one way to act.
 *
 * Intentionally minimal. Schedule, rules, and the venue map are separate
 * features with their own tables, so nothing is stubbed here and no navigation
 * promises a page that does not exist.
 *
 * `events_select_visible` is the whole authorization decision: a published event
 * is readable by anyone, a closed one only by its owner. A closed event therefore
 * 404s for a visitor and shows a clear notice for the organizer looking at their
 * own link.
 */
export default async function PublicEventPage({ params }: PublicEventPageProps) {
  const { eventId } = await params

  let data
  try {
    data = await getPublicEvent(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  const { event, isOrganizer, registrationOpen } = data
  const canRegister = registrationOpen || isOrganizer

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-3">
        <Badge variant="secondary" className="w-fit">
          {event.registration_open ? 'Registration open' : 'Registration closed'}
        </Badge>

        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
          {event.name}
        </h1>

        {event.description && (
          <p className="text-muted-foreground text-base">{event.description}</p>
        )}
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-start gap-3">
              <CalendarDays
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <dt className="sr-only">Date and time</dt>
                <dd>{formatEventDate(event.date)}</dd>
                <dd className="text-muted-foreground">
                  {formatEventTime(event.start_time)} – {formatEventTime(event.end_time)}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <dt className="sr-only">Venue</dt>
                <dd>{event.venue}</dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <UserCog
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <dt className="sr-only">Organizer</dt>
                <dd>{event.organizer_name}</dd>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* The three Info pages, then the primary action last: a participant
          usually arrives wanting the programme or the room, not the form. */}
      <EventInfoNav eventId={event.id} />

      {/* Registration is one of two ways to act. A photo frame is the other, and
          it needs no account and no registration, so it is offered either way. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {canRegister ? (
          <Button asChild size="lg">
            <Link href={`/events/${event.id}/register`}>
              Register
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">Registration is closed for this event.</p>
        )}

        <Button asChild size="lg" variant="outline">
          <Link href={`/events/${event.id}/photo-frame`}>
            <Frame aria-hidden="true" />
            Photo Frame
          </Link>
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">
        Registering shows a QR code on this device. Show it at the door to check in.
      </p>
    </div>
  )
}
