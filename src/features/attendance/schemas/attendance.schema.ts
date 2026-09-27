import { z } from 'zod'

/**
 * Validation for the two public and organizer entry points in this module.
 *
 * Server Actions are untrusted endpoints, so both schemas run again on the
 * server. The bounds mirror the table CHECK constraints where one exists, so a
 * value that would be rejected by Postgres is caught here first with a message
 * a person can act on.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

/**
 * Matches the `register_participant()` signature exactly. `role` is absent on
 * purpose: the function takes no role argument and the row defaults to
 * `Student`, so offering the field would imply control the organizer of a
 * public form does not have.
 */
export const registrationSchema = z.object({
  eventId: z.uuid('That event link is not valid.'),
  name: z.string().trim().min(1, 'Enter your name').max(120, 'Keep your name under 120 characters'),
  studentId: z
    .string()
    .trim()
    .max(40, 'Keep the student ID under 40 characters')
    .optional()
    .default(''),
  course: z.string().trim().max(80, 'Keep the course under 80 characters').optional().default(''),
  yearSection: z
    .string()
    .trim()
    .max(40, 'Keep the year and section under 40 characters')
    .optional()
    .default(''),
  email: z
    .string()
    .trim()
    .max(160, 'Keep the email under 160 characters')
    .refine((value) => value === '' || EMAIL_PATTERN.test(value), 'Enter a valid email address')
    .optional()
    .default(''),
})

export type RegistrationInput = z.input<typeof registrationSchema>
export type RegistrationValues = z.output<typeof registrationSchema>

/**
 * The scanner submits whatever it decoded. It is deliberately permissive — the
 * token itself is normalized and re-checked in `lib/token.ts`, which owns the
 * format rules — so this only guards against an empty or absurd payload.
 */
export const checkInSchema = z.object({
  eventId: z.uuid('That event link is not valid.'),
  token: z.string().trim().min(1, 'Scan a QR code first.').max(256),
})

export type CheckInInput = z.input<typeof checkInSchema>

export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key !== 'string') continue
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
  }
  return fieldErrors
}
