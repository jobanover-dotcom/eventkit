import { Clock, MapPin } from 'lucide-react'
import { formatEventTime } from '@/lib/format'
import type { ScheduleSlot } from '@/features/info/lib/sort'

/**
 * The programme.
 *
 * Rendered as time slots rather than a flat table: on a phone the question is
 * "what is on now?", and a left-hand time gutter with the activity beside it is
 * the shape people already read. Items that share a start time sit in one slot,
 * so a parallel session reads as a choice rather than a mistake in the data.
 */
export function ScheduleList({ slots }: { slots: readonly ScheduleSlot[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {slots.map((slot) => (
        <li key={`${slot.startTime}-${slot.items[0]?.id ?? 'empty'}`}>
          <div className="flex gap-4">
            {/* Fixed-width gutter so every activity lines up down the page. */}
            <div className="w-20 shrink-0 pt-1 text-right">
              <p className="font-heading text-sm font-bold tabular-nums">
                {formatEventTime(slot.startTime)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatEventTime(slot.endTime)}
              </p>
            </div>

            <div className="border-border flex min-w-0 flex-1 flex-col gap-2 border-l-2 pl-4">
              {slot.items.map((item) => (
                <article key={item.id} className="flex flex-col gap-1">
                  <h2 className="leading-snug font-semibold">{item.title}</h2>

                  {item.location && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      {item.location}
                    </p>
                  )}

                  {item.description && (
                    <p className="text-muted-foreground text-sm">{item.description}</p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** A one-line programme, for the public event page's summary. */
export function ScheduleSummary({ count }: { count: number }) {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      <Clock className="size-3.5" aria-hidden="true" />
      {count === 0
        ? 'No programme published yet.'
        : `${count} programme item${count === 1 ? '' : 's'}`}
    </p>
  )
}
