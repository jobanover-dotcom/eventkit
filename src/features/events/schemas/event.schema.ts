import { z } from 'zod'

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export const DEFAULT_THEME = '#6d28d9'

/**
 * A `date` column cannot hold February 31st, but `Date.parse` silently rolls it
 * over to March. Comparing the round-tripped value rejects it.
 */
const isRealCalendarDate = (value: string): boolean => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * §8 event form. Logo, cover image, and map are uploaded separately once
 * `POST /api/uploads` exists, so they are not part of this payload.
 *
 * Every text field is trimmed during validation, so a value made only of
 * spaces fails `min(1)` here instead of being rejected later by a database
 * CHECK constraint.
 */
export const eventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Give the event a name')
      .max(120, 'Keep the name under 120 characters'),
    description: z.string().trim().max(2000, 'Keep the description under 2000 characters'),
    date: z
      .string()
      .regex(DATE_PATTERN, 'Choose a date')
      .refine(isRealCalendarDate, 'That date does not exist'),
    startTime: z.string().regex(TIME_PATTERN, 'Choose a start time'),
    endTime: z.string().regex(TIME_PATTERN, 'Choose an end time'),
    venue: z
      .string()
      .trim()
      .min(1, 'Where is the event held?')
      .max(160, 'Keep the venue under 160 characters'),
    organizerName: z
      .string()
      .trim()
      .min(1, 'Which department or person is organizing?')
      .max(120, 'Keep the organizer name under 120 characters'),
    theme: z
      .string()
      .regex(HEX_COLOR_PATTERN, 'Use a hex colour such as #6d28d9')
      .default(DEFAULT_THEME),
    registrationOpen: z.boolean().default(true),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  })

/** Validated, fully-defaulted values handed to the service. */
export type EventValues = z.output<typeof eventSchema>

/** Shape the form holds before validation; `theme` and `registrationOpen` are optional. */
export type EventInput = z.input<typeof eventSchema>

/** Field-level messages, keyed for `ActionResult.fieldErrors`. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key !== 'string') continue
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
  }
  return fieldErrors
}
