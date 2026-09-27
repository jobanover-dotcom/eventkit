import Link from 'next/link'
import { CalendarDays, MapPin, ScrollText, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/**
 * The participant's way into the Info pages, shown on the public event page.
 *
 * Cards rather than tabs, because on a phone this is a jump between pages, not
 * a switch between panels, and each one deserves a URL a participant can share
 * or reopen.
 */

const LINKS = [
  {
    slug: 'schedule',
    title: 'Schedule',
    description: 'What is on, and when.',
    icon: CalendarDays,
  },
  {
    slug: 'map',
    title: 'Map & Venue',
    description: 'Where to go, and where things are.',
    icon: MapPin,
  },
  {
    slug: 'rules',
    title: 'Rules',
    description: 'What to know before you arrive.',
    icon: ScrollText,
  },
] as const satisfies readonly {
  slug: string
  title: string
  description: string
  icon: LucideIcon
}[]

export function EventInfoNav({ eventId }: { eventId: string }) {
  return (
    <nav aria-label="Event information">
      <ul className="grid gap-3 sm:grid-cols-3">
        {LINKS.map((link) => (
          <li key={link.slug}>
            <Link
              href={`/events/${eventId}/${link.slug}`}
              className="hover:border-primary/50 focus-visible:ring-ring block h-full rounded-xl border transition-colors focus-visible:ring-3"
            >
              <Card className="h-full border-0 shadow-none">
                <CardContent className="flex h-full flex-col gap-2">
                  <link.icon className="text-primary size-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">{link.title}</span>
                  <span className="text-muted-foreground text-sm">{link.description}</span>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
