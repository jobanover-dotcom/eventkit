import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DemoFlow } from '@/features/landing/components/DemoFlow'
import { Hero } from '@/features/landing/components/Hero'
import { ToolkitSection } from '@/features/landing/components/ToolkitSection'
import { ValueProp } from '@/features/landing/components/ValueProp'

const DESIGN_GUARANTEES = [
  'Works on the phone in your hand',
  'Row Level Security on every table',
  'No participant accounts to manage',
  'Export attendance to CSV any time',
] as const

export default function HomePage() {
  return (
    <>
      <Hero />

      <ValueProp />
      <ToolkitSection />
      <DemoFlow />

      <section className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <Card className="from-primary to-chart-2 overflow-hidden border-0 bg-gradient-to-br text-primary-foreground">
          <CardContent className="flex flex-col items-start gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3">
              <h2 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
                Your next event is one form away.
              </h2>
              <ul className="flex flex-col gap-1.5">
                {DESIGN_GUARANTEES.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm opacity-95">
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Button asChild size="lg" variant="secondary" className="shrink-0">
              <Link href="/events/new">
                Create an event
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </>
  )
}
