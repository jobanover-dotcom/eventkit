import { CalendarDays, MapPin, QrCode, UserCog } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatEventDate, formatEventTime } from '@/lib/format'
import { ParticipantQr } from '@/features/attendance/components/ParticipantQr'

/**
 * The participant's check-in pass.
 *
 * Presentational and used in two places: the organizer's pass view, and the
 * confirmation shown on the registrant's own phone immediately after they sign
 * up. Same component, so the two can never drift apart.
 *
 * The QR is sized for scanning off a phone screen at arm's length, and the card
 * is deliberately light on chrome so it is readable in a bright hall.
 */

export type PassEvent = {
  name: string
  date: string
  startTime: string
  endTime: string
  venue: string
  organizerName: string
}

export type PassPerson = {
  name: string
  code: string
  role: string
  /** Free-text speaker title. Shown above the role when present. */
  title?: string | null
  /** Speaker affiliation. Shown when present. */
  organization?: string | null
}

export function ParticipantPassCard({
  event,
  participant,
  qrToken,
  qrSize = 300,
}: {
  event: PassEvent
  participant: PassPerson
  qrToken: string
  qrSize?: number
}) {
  // A speaker's own title and affiliation are the useful facts, so they lead
  // and the generic role word becomes the fallback rather than the headline.
  const credential = [participant.title, participant.organization].filter(Boolean).join(' · ')

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col gap-5">
        <header className="flex flex-col gap-1 text-center">
          <Badge variant="secondary" className="mx-auto w-fit">
            Event pass
          </Badge>
          <h2 className="font-heading text-2xl leading-tight font-extrabold">{event.name}</h2>
          <p className="text-muted-foreground text-sm">
            {formatEventDate(event.date)} · {formatEventTime(event.startTime)}–
            {formatEventTime(event.endTime)}
          </p>
        </header>

        <Separator />

        <div className="flex flex-col items-center gap-4">
          <ParticipantQr token={qrToken} size={qrSize} />

          <div className="flex flex-col items-center gap-1 text-center">
            <p className="font-heading text-xl font-bold">{participant.name}</p>
            <p className="text-muted-foreground text-sm">{participant.code}</p>
            {credential && <p className="text-muted-foreground text-sm">{credential}</p>}
            <Badge>{participant.role}</Badge>
          </div>
        </div>

        <Separator />

        <dl className="text-muted-foreground flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Venue</dt>
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <dd>{event.venue}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Organizer</dt>
            <UserCog className="size-4 shrink-0" aria-hidden="true" />
            <dd>{event.organizerName}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="sr-only">How to use</dt>
            <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <dd>Show this code at the door. One code per person, scanned once.</dd>
          </div>
        </dl>

        <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          Keep this screen open when you arrive.
        </p>
      </CardContent>
    </Card>
  )
}
