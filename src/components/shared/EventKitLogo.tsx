import { TicketCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EventKitMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'from-primary to-chart-2 inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-primary-foreground shadow-sm',
        className
      )}
    >
      <TicketCheck className="size-5" strokeWidth={2.25} />
    </span>
  )
}

export function EventKitLogo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <EventKitMark />
      <span className="font-heading text-lg font-extrabold tracking-tight">EventKit</span>
    </span>
  )
}
