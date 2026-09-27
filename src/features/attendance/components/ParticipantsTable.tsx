import Link from 'next/link'
import { formatCheckInTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ParticipantAttendance } from '@/features/attendance/types'

/**
 * The roster table, shared by the Participants and Attendance pages.
 *
 * Status is never signalled by colour alone: every row carries a text badge, so
 * it still reads on a projector, in print, and for a colour-blind organizer.
 */
export function ParticipantsTable({
  rows,
  eventId,
  emptyMessage,
}: {
  rows: readonly ParticipantAttendance[]
  eventId: string
  emptyMessage: string
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Checked in</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                <span className="block max-w-48 truncate" title={row.name}>
                  {row.name}
                </span>
                {row.email && (
                  <span className="text-muted-foreground block max-w-48 truncate text-xs">
                    {row.email}
                  </span>
                )}
              </TableCell>

              <TableCell className="font-mono text-xs">{row.code}</TableCell>

              <TableCell>
                <Badge variant="secondary">{row.role}</Badge>
              </TableCell>

              <TableCell>
                {row.status === 'checked_in' ? (
                  <Badge>Checked in</Badge>
                ) : (
                  <Badge variant="outline">Not checked in</Badge>
                )}
              </TableCell>

              <TableCell className="text-muted-foreground tabular-nums">
                {row.checkedInAt ? formatCheckInTime(row.checkedInAt) : '—'}
              </TableCell>

              <TableCell className="text-right">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/events/${eventId}/participants/${row.id}`}>
                    View pass
                    <span className="sr-only"> for {row.name}</span>
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
