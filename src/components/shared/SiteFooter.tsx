import Link from 'next/link'
import { EventKitLogo } from '@/components/shared/EventKitLogo'

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <EventKitLogo className="text-foreground" />
          <p>A simple toolkit for school and campus events.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-4">
          <Link href="/login" className="hover:text-foreground transition-colors">
            Organizer log in
          </Link>
          <Link href="/events/new" className="hover:text-foreground transition-colors">
            Create an event
          </Link>
        </nav>
      </div>
    </footer>
  )
}
