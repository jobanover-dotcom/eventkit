import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The shell every Info page shares: a back link to the event, the event name,
 * and the page's own heading.
 *
 * Mobile-first, because the whole point is a participant standing at the venue
 * with one hand on their phone. The back link is the first thing in the
 * document, so it sits above the heading on a narrow screen.
 */
export function InfoPageShell({
  eventId,
  eventName,
  title,
  description,
  children,
}: {
  eventId: string
  eventName: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link href={`/events/${eventId}`}>
          <ArrowLeft aria-hidden="true" />
          {eventName}
        </Link>
      </Button>

      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </header>

      {children}
    </div>
  )
}

/** The friendly nothing-here state, used by all three pages. */
export function InfoEmptyState({ message }: { message: string }) {
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
      {message}
    </p>
  )
}
