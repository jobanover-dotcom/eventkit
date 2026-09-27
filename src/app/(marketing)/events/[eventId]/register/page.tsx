import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RegisterParticipantForm } from '@/features/attendance/components/RegisterParticipantForm'
import { getPublicEvent } from '@/features/events/services/eventService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type RegisterPageProps = {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = {
  title: 'Register',
  description: 'Register for an event and get your check-in code.',
}

/**
 * Public registration.
 *
 * No session, no participant account: the QR returned by
 * `register_participant()` is the whole credential. The pass is rendered on the
 * same screen so the registrant can hold up their phone, which means the token
 * never has to travel in a link.
 */
export default async function RegisterPage({ params }: RegisterPageProps) {
  const { eventId } = await params

  let data
  try {
    data = await getPublicEvent(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  const { event, isOrganizer, registrationOpen } = data

  // A visitor can only arrive here for an open event, because a closed one is not
  // readable by anonymous callers. The owner is allowed to look, and gets a
  // plain explanation instead of a form that would fail on submit.
  if (!registrationOpen && !isOrganizer) {
    notFound()
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit -ml-3">
          <Link href={`/events/${event.id}`}>
            <ArrowLeft aria-hidden="true" />
            {event.name}
          </Link>
        </Button>

        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          Register
        </h1>

        {!registrationOpen && (
          <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
            Registration for this event is closed.
          </p>
        )}
      </div>

      {registrationOpen && <RegisterParticipantForm eventId={event.id} />}
    </div>
  )
}
