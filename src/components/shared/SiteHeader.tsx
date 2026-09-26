import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EventKitLogo } from '@/components/shared/EventKitLogo'

const NAV_LINKS = [
  { href: '/#toolkit', label: 'Toolkit' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#demo-flow', label: 'Demo' },
]

export function SiteHeader() {
  return (
    <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-lg focus-visible:ring-ring focus-visible:ring-3">
          <EventKitLogo />
          <span className="sr-only">EventKit home</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/events/new">Create event</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
