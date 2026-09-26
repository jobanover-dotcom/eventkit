import { ArrowRight, PartyPopper, QrCode, ScanLine, Sparkles, Upload, UserPlus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionHeading } from '@/features/landing/components/SectionHeading'

const STEPS = [
  { icon: Sparkles, title: 'Create the event', detail: 'Name, date, venue, logo, theme color.' },
  { icon: UserPlus, title: 'Open registration', detail: 'Share the link. Students sign up.' },
  { icon: QrCode, title: 'Each QR is issued', detail: 'Every registrant gets a unique pass.' },
  { icon: ScanLine, title: 'Scan on arrival', detail: 'Attendance updates the moment they scan.' },
  { icon: Upload, title: 'Generate materials', detail: 'Badges, certificates, posters, frames.' },
  {
    icon: PartyPopper,
    title: 'Participants check',
    detail: 'Schedule, map, rules, and their pass.',
  },
] as const

export function DemoFlow() {
  return (
    <section id="demo-flow" className="scroll-mt-20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow="The demo path"
          title="From empty dashboard to a room full of checked-in participants"
          description="Six steps, one afternoon. This is the exact flow the app is built around."
        />

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="bg-secondary text-secondary-foreground flex size-9 items-center justify-center rounded-lg">
                      <step.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground/50 font-heading text-2xl font-extrabold"
                    >
                      {index + 1}
                    </span>
                  </div>
                  <p className="font-heading font-bold">{step.title}</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.detail}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>

        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          Registration needs no account. Participants only receive a private link to their own pass.
        </p>
      </div>
    </section>
  )
}
