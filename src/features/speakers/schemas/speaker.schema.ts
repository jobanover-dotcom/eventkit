import { z } from 'zod'

/**
 * Validation for the organizer-only "add a speaker" command.
 *
 * Note what is *absent*: there is no `role` field. A speaker is a participant
 * whose role the server sets to `Speaker`, and no client value participates in
 * that decision. Public registration cannot reach this schema at all — it goes
 * through `register_participant()`, which takes no role argument — so there is
 * no form a member of the public can submit that produces a speaker.
 *
 * Bounds mirror the `participants` CHECK constraints so a value Postgres would
 * reject is caught here first with a message a person can act on.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

const optionalShortText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep the ${label} under ${max} characters`)
    .optional()
    .default('')
    .transform((value) => (value.length === 0 ? null : value))

export const speakerSchema = z.object({
  eventId: z.uuid('That event link is not valid.'),
  name: z
    .string()
    .trim()
    .min(1, 'Give the speaker a name')
    .max(120, 'Keep the name under 120 characters'),
  // `participants.email` is nullable and already validated by a CHECK.
  email: z
    .string()
    .trim()
    .max(254, 'Keep the email under 254 characters')
    .optional()
    .default('')
    .transform((value) => (value.length === 0 ? null : value))
    .refine((value) => value === null || EMAIL_PATTERN.test(value), {
      message: 'That email address does not look right',
      path: ['email'],
    }),
  // `participants.organization` and `title` are new nullable columns added by
  // 20260926000002. Both are free text: "Keynote Speaker" does not fit the
  // six-value role enum, and that is the point.
  organization: optionalShortText('organization', 120),
  title: optionalShortText('title', 120),
})

export type SpeakerInput = z.input<typeof speakerSchema>
export type SpeakerValues = z.output<typeof speakerSchema>
