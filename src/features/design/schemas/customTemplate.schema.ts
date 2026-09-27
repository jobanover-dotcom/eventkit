import { z } from 'zod'
import { TEMPLATE_FIELDS, type TemplateField } from '@/features/design/lib/customTemplate/fields'
import { DESIGN_KINDS } from '@/features/design/types'
import { PLACEHOLDER_HEX } from '@/features/design/lib/customTemplate/placeholder'

/**
 * Validation for organizer-owned custom templates.
 *
 * The artwork itself is validated in the service by sniffing the PNG signature
 * rather than trusting `File.type`, which is a value the browser supplies. What
 * is declared here is everything about the *mapping* — the part a client could
 * plausibly get wrong, and the part that decides what a generated certificate
 * prints.
 */

/** Mirrors the private `event-templates` bucket: 5 MB, PNG only. */
export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024

export const TEMPLATE_MIME = 'image/png' as const

const placeholderSchema = z.object({
  x: z.number().int().min(0).max(8000),
  y: z.number().int().min(0).max(8000),
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000),
  field: z.enum(TEMPLATE_FIELDS).nullable(),
})

/** A stored template, as the organizer sees it in the picker. */
export type CustomTemplateRecord = {
  id: string
  name: string
  kind: (typeof DESIGN_KINDS)[number]
  imageWidth: number
  imageHeight: number
  placeholders: {
    x: number
    y: number
    width: number
    height: number
    field: TemplateField | null
  }[]
  /** Short-lived URL for the private artwork. Never a public bucket URL. */
  signedUrl: string
  createdAt: string
}

export const saveTemplateConfigSchema = z.object({
  eventId: z.uuid('That event link is not valid.'),
  templateId: z.uuid('That template does not exist.'),
  placeholders: z
    .array(placeholderSchema)
    .max(64, 'A template may not have that many placeholders.'),
})

export type SaveTemplateConfigInput = z.input<typeof saveTemplateConfigSchema>
export type SaveTemplateConfigValues = z.output<typeof saveTemplateConfigSchema>

export const uploadTemplateSchema = z.object({
  eventId: z.uuid('That event link is not valid.'),
  kind: z.enum(DESIGN_KINDS, { message: 'Choose what this template is for.' }),
  name: z
    .string()
    .trim()
    .min(1, 'Give the template a name')
    .max(80, 'Keep the name under 80 characters'),
  placeholders: z
    .array(placeholderSchema)
    .max(64, 'A template may not have that many placeholders.'),
})

export type UploadTemplateInput = z.input<typeof uploadTemplateSchema>
export type UploadTemplateValues = z.output<typeof uploadTemplateSchema>

/** Instruction shown to organizers who are about to author a template. */
export const PLACEHOLDER_INSTRUCTIONS = [
  `Draw a rectangle and fill it with exactly ${PLACEHOLDER_HEX}.`,
  'Use that one colour for placeholders only, never as artwork.',
  'Each filled rectangle becomes one slot. Map every slot to a field before saving.',
  'Export the finished design as a PNG and upload it here.',
] as const
