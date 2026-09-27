import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EventHeader } from '@/components/shared/EventHeader'
import { QrScanner } from '@/features/attendance/components/QrScanner'
import { getOwnedEvent } from '@/features/events/services/eventService'
import { isEventId } from '@/features/design/services/designService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type CheckInPageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Check-in' }
}

/**
 * The door. Built for a phone held in one hand while the other hand holds a
 * participant's screen, so the camera fills the page and nothing else competes
 * for attention.
 */
export default async function CheckInPage({ params }: CheckInPageProps) {
  const { eventId } = await params

  if (!isEventId(eventId)) notFound()

  let event
  try {
    event = await getOwnedEvent(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  return (
    <div className="flex flex-col gap-6">
      <EventHeader event={event} sharePath={`/events/${event.id}`} />

      <section className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-bold">Check-in</h2>
        <p className="text-muted-foreground text-sm">
          Scan a participant&rsquo;s QR code. The result appears here and you can keep scanning
          without leaving this page.
        </p>
      </section>

      <QrScanner eventId={event.id} />
    </div>
  )
}
