import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Award,
  CalendarDays,
  ClipboardCheck,
  FileBadge,
  IdCard,
  Image,
  MapPin,
  QrCode,
  ScanLine,
  ScrollText,
  Users,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EventHeader } from '@/components/shared/EventHeader'
import { AttendanceStats } from '@/features/dashboard/components/AttendanceStats'
import { getOwnedEventWithStats } from '@/features/events/services/eventService'
import { notFound } from 'next/navigation'

type EventDashboardPageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Event dashboard' }
}

type ToolGroup = {
  title: string
  description: string
  items: { label: string; detail: string; href: string; icon: typeof IdCard; ready: boolean }[]
}

export default async function EventDashboardPage({ params }: EventDashboardPageProps) {
  const { eventId } = await params

  let event
  try {
    event = await getOwnedEventWithStats(eventId)
  } catch {
    // An event owned by somebody else is indistinguishable from a missing one.
    notFound()
  }

  const base = `/events/${event.id}`
  const groups: ToolGroup[] = [
    {
      title: 'Design',
      description: 'Generate from templates. No design editor.',
      items: [
        {
          label: 'Badge',
          detail: 'Roles, logo, QR',
          href: `${base}/design/badge`,
          icon: IdCard,
          ready: false,
        },
        {
          label: 'Certificate',
          detail: 'Five types, PDF',
          href: `${base}/design/certificate`,
          icon: Award,
          ready: false,
        },
        {
          label: 'Poster',
          detail: 'Announce, remind, thank you',
          href: `${base}/design/poster`,
          icon: FileBadge,
          ready: false,
        },
        {
          label: 'Photo frame',
          detail: 'Upload a photo, get PNG',
          href: `${base}/design/photo-frame`,
          icon: Image,
          ready: false,
        },
      ],
    },
    {
      title: 'Attendance',
      description: 'Registration through check-in.',
      items: [
        {
          label: 'Participants',
          detail: 'Everyone registered',
          href: `${base}/participants`,
          icon: Users,
          ready: false,
        },
        {
          label: 'QR codes',
          detail: 'One pass per person',
          href: `${base}/participants`,
          icon: QrCode,
          ready: false,
        },
        {
          label: 'Scan QR',
          detail: 'Check in from a phone',
          href: `${base}/check-in`,
          icon: ScanLine,
          ready: false,
        },
        {
          label: 'Attendance',
          detail: 'Filters and CSV',
          href: `${base}/attendance`,
          icon: ClipboardCheck,
          ready: false,
        },
      ],
    },
    {
      title: 'Info',
      description: 'What participants read on their phone.',
      items: [
        {
          label: 'Schedule',
          detail: 'Programme items',
          href: `${base}/schedule`,
          icon: CalendarDays,
          ready: false,
        },
        {
          label: 'Map & venue',
          detail: 'Upload a map image',
          href: `${base}/rules`,
          icon: MapPin,
          ready: false,
        },
        {
          label: 'Rules',
          detail: 'Guideline sections',
          href: `${base}/rules`,
          icon: ScrollText,
          ready: false,
        },
        {
          label: 'Participant page',
          detail: 'Open the public page',
          href: base,
          icon: IdCard,
          ready: true,
        },
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <EventHeader event={event} sharePath={`/events/${event.id}`} />

      <AttendanceStats stats={event.stats} />

      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-xl font-bold">{group.title}</h2>
            <p className="text-muted-foreground text-sm">{group.description}</p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {group.items.map((item) => (
              <li key={item.label}>
                {item.ready ? (
                  <Link
                    href={item.href}
                    className="hover:border-primary/50 focus-visible:ring-ring block h-full rounded-xl border transition-colors focus-visible:ring-3"
                  >
                    <Card className="h-full border-0 shadow-none">
                      <CardContent className="flex h-full flex-col gap-2">
                        <item.icon className="text-primary size-5" aria-hidden="true" />
                        <span className="text-sm font-semibold">{item.label}</span>
                        <span className="text-muted-foreground text-sm">{item.detail}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ) : (
                  <Card className="h-full border-dashed opacity-70">
                    <CardContent className="flex h-full flex-col gap-2">
                      <item.icon className="text-muted-foreground size-5" aria-hidden="true" />
                      <span className="text-sm font-semibold">{item.label}</span>
                      <span className="text-muted-foreground text-sm">
                        {item.detail} · coming next
                      </span>
                    </CardContent>
                  </Card>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
