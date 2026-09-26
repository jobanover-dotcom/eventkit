import { ArrowRight, Award, CalendarDays, IdCard, Image, MapPin, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionHeading } from '@/features/landing/components/SectionHeading'

const EVENT_FIELDS = [
  { icon: IdCard, label: 'Event name', value: 'IT FEST 2026' },
  { icon: CalendarDays, label: 'Date', value: 'November 5, 2026' },
  { icon: MapPin, label: 'Venue', value: 'Assumption College' },
  { icon: Users, label: 'Organizer', value: 'BSIT Department' },
] as const

const MATERIALS = [
  { icon: IdCard, title: 'Badges', detail: 'Name, course, role, QR' },
  { icon: Award, title: 'Certificates', detail: 'Participation, winner, recognition' },
  { icon: Image, title: 'Photo frames', detail: 'Upload a photo, download PNG' },
  { icon: CalendarDays, title: 'Posters', detail: 'Announce, remind, thank you' },
] as const

export function ValueProp() {
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow="One source of truth"
          title="Stop retyping the same event details into five different files"
          description="EventKit stores your event once. Every material reads from that single record, so a date change updates your badge, certificate, poster, and participant page together."
        />

        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)]">
          <Card className="bg-card/70">
            <CardContent className="flex flex-col gap-4">
              <p className="text-muted-foreground text-xs font-bold tracking-[0.18em] uppercase">
                You enter
              </p>
              {EVENT_FIELDS.map((field) => (
                <div key={field.label} className="flex items-center gap-3">
                  <span className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <field.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="text-muted-foreground block text-xs">{field.label}</span>
                    <span className="block truncate font-medium">{field.value}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div
            aria-hidden="true"
            className="text-primary mx-auto hidden size-12 items-center justify-center rounded-full border-2 border-dashed lg:flex"
          >
            <ArrowRight className="size-6" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {MATERIALS.map((material) => (
              <Card
                key={material.title}
                className="hover:border-primary/40 hover:shadow-md transition-colors"
              >
                <CardContent className="flex flex-col gap-2">
                  <material.icon className="text-primary size-5" aria-hidden="true" />
                  <p className="font-heading font-bold">{material.title}</p>
                  <p className="text-muted-foreground text-sm">{material.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
