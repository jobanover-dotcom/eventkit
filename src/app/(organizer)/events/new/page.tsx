import type { Metadata } from 'next'
import { EventForm } from '@/features/events/components/EventForm'

export const metadata: Metadata = {
  title: 'Create an event',
  description: 'Set up a new EventKit event in a couple of minutes.',
}

export default function NewEventPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Create an event</h1>
        <p className="text-muted-foreground text-muted-foreground">
          Enter these once. Badges, certificates, posters, and the participant page all read from
          this record.
        </p>
      </header>

      <div className="max-w-3xl">
        <EventForm />
      </div>
    </div>
  )
}
