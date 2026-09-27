'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadCsv, toCsv } from '@/features/attendance/lib/csv'
import type { ParticipantAttendance } from '@/features/attendance/types'

/**
 * Exports the roster the organizer is already looking at.
 *
 * The data is authorized and loaded, so this is a pure client-side step and needs
 * no extra endpoint. It deliberately exports the *filtered* view: an organizer
 * who filtered to "not checked in" wants the outstanding list, not everything.
 */
export function ExportCsvButton({
  rows,
  filename,
}: {
  rows: readonly ParticipantAttendance[]
  filename: string
}) {
  const [failed, setFailed] = useState(false)

  function onClick() {
    try {
      downloadCsv(toCsv(rows), filename)
      setFailed(false)
    } catch {
      // A blocked download is the realistic failure here, and it is the
      // organizer's browser refusing, not the server.
      setFailed(true)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={onClick} disabled={rows.length === 0}>
        <Download aria-hidden="true" />
        Export CSV
      </Button>
      {failed && (
        <p role="alert" className="text-destructive text-xs">
          The download was blocked by your browser.
        </p>
      )}
    </div>
  )
}
