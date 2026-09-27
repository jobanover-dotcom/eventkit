'use client'

import { CheckCircle2, Clock, Info, TriangleAlert, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCheckInTime } from '@/lib/format'
import { participantTypeLabel, toParticipantType } from '@/lib/participantType'
import type { CheckInResult } from '@/features/attendance/actions/checkIn.action'
import type { ActionErrorCode } from '@/lib/errors'

/**
 * The result of one scan, shown over the camera so the organizer can read it
 * without leaving the page.
 *
 * Three outcomes are treated as normal rather than as faults: a fresh check-in, a
 * duplicate, and a code that does not belong here. All of them keep the scanner
 * usable, and only a genuine failure is styled as one.
 */

export function ScanResultCard({ result }: { result: CheckInResult }) {
  if (result.ok) {
    const { kind, participant, checkedInAt } = result.data
    const duplicate = kind === 'already_checked_in'
    const type = toParticipantType(participant.role)
    const groupLabel = participantTypeLabel(type)
    // A speaker's own title and affiliation, when the organizer recorded them.
    const credential = [participant.title, participant.organization].filter(Boolean).join(' · ')

    return (
      <div
        role="status"
        aria-live="polite"
        data-testid={duplicate ? 'scan-duplicate' : 'scan-checked-in'}
        data-participant-type={type}
        className={
          duplicate
            ? 'border-chart-3/40 bg-chart-3/10 flex flex-col gap-2 rounded-lg border px-4 py-4'
            : 'border-chart-4/40 bg-chart-4/10 flex flex-col gap-2 rounded-lg border px-4 py-4'
        }
      >
        <p className="flex items-center gap-2 font-heading text-lg font-bold">
          {duplicate ? (
            <>
              <Clock className="size-5" aria-hidden="true" />
              {groupLabel} already checked in
            </>
          ) : (
            <>
              <CheckCircle2 className="size-5" aria-hidden="true" />
              {groupLabel} checked in
            </>
          )}
        </p>

        <p className="font-medium">{participant.name}</p>

        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-mono text-xs">{participant.code}</span>
          {credential && <span>{credential}</span>}
          <Badge variant="secondary">{participant.role}</Badge>
        </p>

        <p className="text-muted-foreground text-sm">
          {duplicate ? 'Original check-in at' : 'Checked in at'}{' '}
          <span className="tabular-nums font-medium text-foreground">
            {formatCheckInTime(checkedInAt)}
          </span>
        </p>
      </div>
    )
  }

  const { Icon, heading, className: toneClass } = toneFor(result.error.code)

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="scan-rejected"
      className={`flex flex-col gap-2 rounded-lg border px-4 py-4 ${toneClass}`}
    >
      <p className="flex items-center gap-2 font-heading text-lg font-bold">
        <Icon className="size-5" aria-hidden="true" />
        {heading}
      </p>
      {/* The server already reduced this to a safe message. */}
      <p className="text-sm opacity-90">{result.error.message}</p>
    </div>
  )
}

type Tone = {
  Icon: typeof TriangleAlert
  heading: string
  className: string
}

function toneFor(code: ActionErrorCode): Tone {
  if (code === 'INVALID_QR' || code === 'NOT_FOUND') {
    return {
      Icon: UserX,
      heading: 'Invalid QR code',
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
    }
  }

  if (code === 'WRONG_EVENT') {
    return {
      Icon: TriangleAlert,
      heading: 'Wrong event',
      className: 'border-chart-3/40 bg-chart-3/10 text-foreground',
    }
  }

  if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') {
    return {
      Icon: TriangleAlert,
      heading: 'Not allowed',
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
    }
  }

  return {
    Icon: Info,
    heading: 'Could not check in',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  }
}
