import type { Metadata } from 'next'
import { CalendarDays, MapPin, UserCog } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { InfoPageShell } from '@/features/info/components/InfoPageShell'
import { UploadEventMapForm } from '@/features/info/components/UploadEventMapForm'
import { getPublicMap } from '@/features/info/services/infoService'
import { formatEventDate, formatEventTime } from '@/lib/format'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type MapPageProps = {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = {
  title: 'Map & venue',
  description: 'Where the event is held.',
}

/**
 * Where to go, and what the building looks like.
 *
 * A plain image of the venue, not a map: no tiles, no geolocation, no
 * directions API. A photograph or floor plan is what a school event actually
 * has, and it works with no network, no key, and no third party.
 */
export default async function MapPage({ params }: MapPageProps) {
  const { eventId } = await params

  let page
  try {
    page = await getPublicMap(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  const { event, venue, isOrganizer } = page

  return (
    <InfoPageShell
      eventId={event.id}
      eventName={event.name}
      title="Map & venue"
      description="Where to go, and what to look for."
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <dt className="sr-only">Venue</dt>
                <dd className="font-medium">{venue.venue}</dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CalendarDays
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <dt className="sr-only">When</dt>
                <dd>{formatEventDate(event.date)}</dd>
                <dd className="text-muted-foreground">
                  {formatEventTime(event.start_time)} – {formatEventTime(event.end_time)}
                </dd>
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

      {venue.mapUrl ? (
        <figure className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={venue.mapUrl}
            alt={`Map of ${venue.venue} for ${event.name}`}
            // Eager: this image is the page's reason to exist, and a participant
            // is probably opening it on a slow connection at the door.
            loading="eager"
            decoding="async"
            className="w-full rounded-xl border"
          />
          <figcaption className="text-muted-foreground text-xs">
            Venue map. Ask the front desk if you cannot find your room.
          </figcaption>
        </figure>
      ) : (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          No venue map has been uploaded yet.
        </p>
      )}

      {isOrganizer && (
        <section aria-label="Organizer tools" className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">Organizer</h2>
          <UploadEventMapForm eventId={event.id} />
        </section>
      )}
    </InfoPageShell>
  )
}
