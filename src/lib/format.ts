/**
 * Date and time formatting for organizer and participant surfaces.
 *
 * `timeZone: 'UTC'` is deliberate: Postgres `date` and `time` columns have no
 * zone, so formatting them in the viewer's zone would shift the event by a day
 * for anyone east or west of the organizer.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

const TIME_FORMAT = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
})

/** `2026-11-05` -> `November 5, 2026` */
export function formatEventDate(value: string): string {
  return DATE_FORMAT.format(new Date(`${value}T00:00:00Z`))
}

/** `2026-11-05` -> `Nov 5` */
export function formatEventDateShort(value: string): string {
  return SHORT_DATE_FORMAT.format(new Date(`${value}T00:00:00Z`))
}

/** `08:00:00` -> `8:00 AM` */
export function formatEventTime(value: string): string {
  const [hours = '0', minutes = '0'] = value.split(':')
  return TIME_FORMAT.format(new Date(Date.UTC(2000, 0, 1, Number(hours), Number(minutes))))
}

/** `2026-11-05T08:14:00Z` -> `9:14 AM` for a check-in time. */
export function formatCheckInTime(value: string): string {
  return TIME_FORMAT.format(new Date(value))
}
