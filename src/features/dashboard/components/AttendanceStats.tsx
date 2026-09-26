import { CheckCircle2, Clock, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { EventStats } from '@/features/events/services/eventService'

type AttendanceStatsProps = {
  stats: EventStats
}

const TILES = [
  {
    key: 'totalParticipants' as const,
    label: 'Participants',
    icon: Users,
    tone: 'text-foreground',
  },
  {
    key: 'checkedIn' as const,
    label: 'Checked in',
    icon: CheckCircle2,
    tone: 'text-chart-4',
  },
  {
    key: 'notCheckedIn' as const,
    label: 'Not checked in',
    icon: Clock,
    tone: 'text-muted-foreground',
  },
]

/** §7 headline numbers. Not colour alone: each tile pairs an icon with a label. */
export function AttendanceStats({ stats }: AttendanceStatsProps) {
  const rate =
    stats.totalParticipants === 0
      ? 0
      : Math.round((stats.checkedIn / stats.totalParticipants) * 100)

  return (
    <section aria-label="Attendance at a glance" className="flex flex-col gap-3">
      <dl className="grid gap-4 sm:grid-cols-3">
        {TILES.map((tile) => (
          <Card key={tile.key}>
            <CardContent className="flex flex-col gap-1">
              <dt className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <tile.icon className={`size-4 ${tile.tone}`} aria-hidden="true" />
                {tile.label}
              </dt>
              <dd className="font-heading text-3xl font-extrabold tabular-nums">
                {stats[tile.key]}
              </dd>
            </CardContent>
          </Card>
        ))}
      </dl>
      <p className="text-muted-foreground text-sm">
        {stats.totalParticipants === 0
          ? 'No registrations yet. Share the participant link to start.'
          : `${rate}% of registered participants have checked in.`}
      </p>
    </section>
  )
}
