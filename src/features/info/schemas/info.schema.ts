import { z } from 'zod'

/**
 * Validation for the owner-only Info authoring commands.
 *
 * Every bound mirrors a `schedules` or `rules` CHECK constraint, so a value that
 * Postgres would reject is caught here first with a message a person can act on.
 * These schemas run on the server, because the forms are Server Actions and
 * therefore public endpoints.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Map upload limits, mirroring the `event-assets` bucket: 5 MB and these four
 * types. Declared here rather than in the service so the client form and the
 * server check share one definition — importing them from the `server-only`
 * service would pull privileged code into the browser bundle.
 */
export const MAX_MAP_BYTES = 5 * 1024 * 1024

export const MAP_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export type MapImageType = (typeof MAP_IMAGE_TYPES)[number]

export const scheduleItemSchema = z
  .object({
    eventId: z.uuid('That event link is not valid.'),
    title: z
      .string()
      .trim()
      .min(1, 'Give the activity a title')
      .max(160, 'Keep the title under 160 characters'),
    startTime: z.string().regex(TIME_PATTERN, 'Choose a start time'),
    endTime: z.string().regex(TIME_PATTERN, 'Choose an end time'),
    // `schedules.location` is `not null default ''`, so blank is meaningful.
    location: z
      .string()
      .trim()
      .max(160, 'Keep the location under 160 characters')
      .optional()
      .default(''),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  })

export type ScheduleItemInput = z.input<typeof scheduleItemSchema>
export type ScheduleItemValues = z.output<typeof scheduleItemSchema>

export const ruleSchema = z.object({
  eventId: z.uuid('That event link is not valid.'),
  title: z
    .string()
    .trim()
    .min(1, 'Give the rule a title')
    .max(160, 'Keep the title under 160 characters'),
  content: z
    .string()
    .trim()
    .min(1, 'Write the rule')
    .max(4000, 'Keep the rule under 4000 characters'),
})

export type RuleInput = z.input<typeof ruleSchema>
export type RuleValues = z.output<typeof ruleSchema>

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
