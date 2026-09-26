import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { LogOut, Plus } from 'lucide-react'
import { getCurrentOrganizer } from '@/features/auth/services/getCurrentOrganizer'
import { signOutAction } from '@/features/auth/actions/signOut.action'
import { EventKitLogo } from '@/components/shared/EventKitLogo'
import { Button } from '@/components/ui/button'
import { LOGIN_PATH } from '@/lib/auth/routes'

/**
 * Defense in depth. `src/proxy.ts` already redirects unauthenticated visitors
 * for a smoother experience, but every protected page re-verifies here because
 * a layout redirect is not an authorization boundary.
 *
 * The redirect deliberately omits `next`: the proxy preserves the intended
 * destination, and a layout has no reliable view of the current path.
 */
export default async function OrganizerLayout({ children }: { children: ReactNode }) {
  const organizer = await getCurrentOrganizer()

  if (!organizer) {
    redirect(LOGIN_PATH)
  }

  const displayName = organizer.fullName ?? organizer.email

  return (
    <div className="bg-muted/30 flex min-h-dvh flex-col">
      <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="rounded-lg focus-visible:ring-ring focus-visible:ring-3"
            >
              <EventKitLogo />
              <span className="sr-only">EventKit dashboard</span>
            </Link>
            <nav
              aria-label="Organizer"
              className="text-muted-foreground hidden gap-1 text-sm sm:flex"
            >
              <Link
                href="/dashboard"
                className="hover:bg-muted hover:text-foreground rounded-lg px-3 py-2 font-medium"
              >
                My events
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden max-w-[16ch] truncate text-sm lg:block">
              {displayName}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href="/events/new">
                <Plus aria-hidden="true" />
                New event
              </Link>
            </Button>
            <form action={signOutAction}>
              <Button type="submit" size="sm" variant="ghost" aria-label="Log out">
                <LogOut aria-hidden="true" />
                <span className="hidden sm:inline">Log out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
