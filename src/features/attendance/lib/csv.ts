import type { ParticipantAttendance } from '@/features/attendance/types'
import { sanitizeFilename } from '@/lib/filename'

/**
 * CSV export for the attendance sheet.
 *
 * RFC 4180 quoting, plus a guard against spreadsheet formula injection: a
 * participant name is public input, and a cell beginning `=`, `+`, `-`, or `@`
 * is executed as a formula by Excel and Sheets. Prefixing with an apostrophe
 * keeps the text as text. The single quote is inside the quoted field, so the
 * value still reads correctly.
 */

const RISKY_PREFIX = /^[=+\-@\t\r]/

const HEADERS = ['Name', 'Code', 'Role', 'Email', 'Student ID', 'Status', 'Checked In At'] as const

/**
 * Quotes a single field. Always quotes, which is simpler than detecting the
 * cases that need it and cannot be got wrong by a value that grows later.
 */
export function escapeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return '""'

  const text = String(value)
  const guarded = RISKY_PREFIX.test(text) ? `'${text}` : text
  // Doubling the quote character is how a literal quote is escaped.
  return `"${guarded.replace(/"/g, '""')}"`
}

export function toCsv(rows: readonly ParticipantAttendance[]): string {
  const lines = [HEADERS.map(escapeCsvValue).join(',')]

  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.code,
        row.role,
        row.email,
        row.studentId,
        row.status === 'checked_in' ? 'Checked in' : 'Not checked in',
        row.checkedInAt,
      ]
        .map(escapeCsvValue)
        .join(',')
    )
  }

  // A trailing newline keeps `wc -l` and spreadsheet importers happy.
  return `${lines.join('\r\n')}\r\n`
}

/** Lower-case, hyphen-separated, safe for a filename. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Prefers a readable event name and falls back to the id, so a download is
 * identifiable even when the event name is entirely non-alphanumeric.
 */
export function attendanceFilename(eventName: string, eventId: string): string {
  const slug = slugify(eventName)
  return sanitizeFilename(`eventkit-attendance-${slug || eventId}`, 'csv')
}

/** Triggers the browser download from an already-authorized client-side dataset. */
export function downloadCsv(csv: string, filename: string): void {
  // The BOM makes Excel read UTF-8, so names with diacritics survive the trip.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(url)
}
