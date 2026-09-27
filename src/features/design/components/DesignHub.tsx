import Link from 'next/link'
import { Award, FileBadge, IdCard, Image as ImageIcon, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { templateCountFor } from '@/features/design/lib/templates'
import { DESIGN_KIND_META } from '@/features/design/types'

const ICONS: Record<(typeof DESIGN_KIND_META)[number]['icon'], LucideIcon> = {
  badge: IdCard,
  certificate: Award,
  poster: FileBadge,
  'photo-frame': ImageIcon,
}

type DesignHubProps = {
  eventId: string
}

/**
 * The Design module entry point. Four kinds, each counting its own templates
 * from the static catalogue so the count can never drift from what is actually
 * selectable.
 */
export function DesignHub({ eventId }: DesignHubProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">Design</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Turn this event&rsquo;s details into something you can print. Pick a design, choose a
          template, and download it. There is no editor to learn.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {DESIGN_KIND_META.map((meta) => {
          const Icon = ICONS[meta.icon]
          const count = templateCountFor(meta.kind)

          return (
            <li key={meta.kind}>
              <Link
                href={`/events/${eventId}/design/${meta.slug}`}
                className="hover:border-primary/50 focus-visible:ring-ring block h-full rounded-xl border transition-colors focus-visible:ring-3"
              >
                <Card className="h-full border-0 shadow-none">
                  <CardContent className="flex h-full flex-col gap-3">
                    <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>

                    <span className="flex flex-col gap-1">
                      {/*
                        A real heading, not a styled span: these four are the
                        page's sections, and a screen-reader user needs to be
                        able to jump between them.
                      */}
                      <h2 className="font-heading text-lg font-bold">{meta.title}</h2>
                      <span className="text-muted-foreground text-sm">{meta.description}</span>
                    </span>

                    <span className="mt-auto flex items-center justify-between pt-2">
                      <Badge variant="secondary">
                        {count} template{count === 1 ? '' : 's'}
                      </Badge>
                      <span className="text-primary text-sm font-semibold">Create</span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
