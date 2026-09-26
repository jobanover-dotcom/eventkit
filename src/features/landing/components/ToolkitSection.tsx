import {
  Award,
  CalendarDays,
  ClipboardCheck,
  FileBadge,
  IdCard,
  Image,
  LayoutTemplate,
  MapPin,
  QrCode,
  ScanLine,
  ScrollText,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionHeading } from '@/features/landing/components/SectionHeading'

type ToolkitGroup = {
  title: string
  summary: string
  accent: string
  items: { icon: typeof IdCard; name: string; detail: string }[]
}

const GROUPS: ToolkitGroup[] = [
  {
    title: 'Design',
    summary: 'Generate from templates, no design editor.',
    accent: 'text-chart-1',
    items: [
      { icon: IdCard, name: 'Badge', detail: 'Six roles, logo, QR, PNG or PDF' },
      { icon: Award, name: 'Certificate', detail: 'Five types, signatory, A4 PDF' },
      { icon: Image, name: 'Photo frame', detail: 'Modern, retro, tech frames' },
      { icon: FileBadge, name: 'Poster', detail: 'Announce, remind, schedule, thanks' },
    ],
  },
  {
    title: 'Attendance',
    summary: 'Registration to check-in without paper.',
    accent: 'text-chart-4',
    items: [
      { icon: Users, name: 'Registration', detail: 'Public sign-up, no account needed' },
      { icon: QrCode, name: 'QR code', detail: 'Unique unguessable token per person' },
      { icon: ScanLine, name: 'Check-in', detail: 'Scan with a phone, no duplicates' },
      { icon: ClipboardCheck, name: 'Attendance', detail: 'Live totals, filters, CSV export' },
    ],
  },
  {
    title: 'Info',
    summary: 'What participants need on their phone.',
    accent: 'text-chart-2',
    items: [
      { icon: CalendarDays, name: 'Schedule', detail: 'Chronological programme' },
      { icon: MapPin, name: 'Venue & map', detail: 'Location and uploaded map image' },
      { icon: ScrollText, name: 'Rules', detail: 'Guidelines in clean sections' },
      { icon: LayoutTemplate, name: 'Participant page', detail: 'Pass, QR, and event details' },
    ],
  },
]

export function ToolkitSection() {
  return (
    <section id="toolkit" className="scroll-mt-20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow="The toolkit"
          title="Everything an organizer needs, nothing they don't"
          description="Three focused areas. Each one is a small set of screens instead of a settings maze."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {GROUPS.map((group) => (
            <Card key={group.title} className="flex flex-col">
              <CardHeader>
                <CardTitle className="font-heading text-xl">{group.title}</CardTitle>
                <p className="text-muted-foreground text-sm">{group.summary}</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <div
                    key={item.name}
                    className="hover:bg-muted/60 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors"
                  >
                    <item.icon
                      className={`mt-0.5 size-4 shrink-0 ${group.accent}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.name}</span>
                      <span className="text-muted-foreground block text-sm">{item.detail}</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
