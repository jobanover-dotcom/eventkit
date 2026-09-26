import Link from 'next/link'
import { ArrowRight, QrCode } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EventPassPreview } from '@/features/landing/components/EventPassPreview'

const PROOF_POINTS = [
  { value: '4', label: 'material generators' },
  { value: '1', label: 'event record' },
  { value: '0', label: 'spreadsheets' },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="surface-grid absolute inset-0 -z-10 opacity-40" />

      <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-[0.8rem]">
            <QrCode className="size-3.5" aria-hidden="true" />
            Built for school &amp; campus events
          </Badge>

          <h1 className="font-heading text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Create an event once.
            <span className="from-primary to-chart-2 bg-gradient-to-r bg-clip-text text-transparent">
              {' '}
              Reuse it everywhere.
            </span>
          </h1>

          <p className="text-muted-foreground max-w-xl text-lg leading-relaxed text-pretty">
            Enter your event name, date, venue, and logo once. EventKit turns them into badges,
            certificates, posters, and photo frames, handles participant registration with unique QR
            codes, and tracks check-in as people walk in.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/events/new">
                Create your event
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in as organizer</Link>
            </Button>
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-10 gap-y-4">
            {PROOF_POINTS.map((point) => (
              <div key={point.label} className="flex flex-col">
                <dt className="sr-only">{point.label}</dt>
                <dd className="font-heading text-3xl font-extrabold">{point.value}</dd>
                <dd className="text-muted-foreground text-sm">{point.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <EventPassPreview />
      </div>
    </section>
  )
}
