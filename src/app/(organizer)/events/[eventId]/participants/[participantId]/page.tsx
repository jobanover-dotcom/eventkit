import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ParticipantPassCard } from '@/features/attendance/components/ParticipantPassCard'
import { getParticipantPass } from '@/features/attendance/services/attendanceService'
import { isEventId } from '@/features/design/services/designService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type ParticipantPassPageProps = {
  params: Promise<{ eventId: string; participantId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Participant pass' }
}

/**
 * One participant's check-in pass, for the organizer to display or print.
 *
 * The full token is shown here and nowhere else. It is safe on this page because
 * the route is behind the same ownership check as the roster, and it is what makes
 * the scanner's manual entry usable on a laptop with no working camera. It is
 * deliberately not reachable from a public URL.
 */
export default async function ParticipantPassPage({ params }: ParticipantPassPageProps) {
  const { eventId, participantId } = await params

  if (!isEventId(eventId)) notFound()

  let pass
  try {
    pass = await getParticipantPass(eventId, participantId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  const { event, participant, qrToken } = pass

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
          <Link href={`/events/${eventId}/participants`}>
            <ArrowLeft aria-hidden="true" />
            All participants
          </Link>
        </Button>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          {participant.name}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <ParticipantPassCard
          event={{
            name: event.name,
            date: event.date,
            startTime: event.start_time,
            endTime: event.end_time,
            venue: event.venue,
            organizerName: event.organizer_name,
          }}
          participant={participant}
          qrToken={qrToken}
        />

        <Card>
          <CardHeader>
            <CardTitle>Check-in code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              For checking somebody in from a laptop, or when a phone camera will not focus. This is
              the only place the full code is shown.
            </p>

            <code
              data-testid="checkin-code"
              className="bg-muted block rounded-lg px-3 py-2 font-mono text-sm break-all select-all"
            >
              {qrToken}
            </code>

            <p className="text-muted-foreground text-xs">
              Anyone holding this code can check {participant.name} in. Do not share the screen.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
