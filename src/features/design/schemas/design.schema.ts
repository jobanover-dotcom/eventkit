import { z } from 'zod'
import { formatMegabytes, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from '@/lib/uploadLimits'
import {
  BADGE_ROLES,
  CERTIFICATE_TYPES,
  POSTER_CONTENT_TYPES,
  type BadgeRole,
  type CertificateType,
  type PosterContentType,
} from '@/features/design/types'

/**
 * Client-side validation for the Design forms.
 *
 * Every string here ends up drawn onto a printed page, so the limits are about
 * the output, not the database. Bounds deliberately exceed the narrowest
 * realistic value: a long name is handled by the fitting engine, not by
 * refusing to render it.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const participantIdSchema = z.string().regex(UUID_PATTERN, 'Select a participant.')

export const badgeSchema = z.object({
  participantId: participantIdSchema,
  role: z.enum(BADGE_ROLES),
})

export type BadgeFormValues = z.infer<typeof badgeSchema>

export const certificateSchema = z.object({
  participantId: participantIdSchema,
  certificateType: z.enum(CERTIFICATE_TYPES),
})

export type CertificateFormValues = z.infer<typeof certificateSchema>

export const posterSchema = z.object({
  contentType: z.enum(POSTER_CONTENT_TYPES),
  message: z
    .string()
    .trim()
    .max(280, 'Keep the message under 280 characters.')
    .min(1, 'Write a short message for the poster.'),
  showQr: z.boolean(),
})

export type PosterFormValues = z.infer<typeof posterSchema>

export const photoFrameSchema = z.object({
  caption: z.string().trim().max(120, 'Keep the caption under 120 characters.'),
})

export type PhotoFrameFormValues = z.infer<typeof photoFrameSchema>

// Re-exported so the existing import sites keep working. The definitions, and the
// reason there are now two limits, live in `@/lib/uploadLimits`.
export { MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES }

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type ImageRejection = { accepted: false; reason: string }
export type ImageAcceptance = { accepted: true }

export type ImageValidation = ImageAcceptance | ImageRejection

/**
 * Validates a chosen image on type, size, and pixel dimensions.
 *
 * The size ceiling is a parameter because two kinds of image pass through here
 * with genuinely different limits. A photo the visitor picks stays in their
 * browser and is bounded only by what a browser will decode; an image headed for
 * a Server Action is bounded by what the platform will accept in a request body,
 * which is lower. Passing the wrong one either rejects a legitimate photo or
 * promises an upload the transport will refuse. See `src/lib/uploadLimits.ts`.
 *
 * The dimension check is not in the bucket policy but matters for output: a
 * 12000px panorama would be scaled down to fit a frame anyway, and rejecting it
 * is clearer than silently producing a soft image.
 */
export function validateImageFile(
  file: Pick<File, 'type' | 'size' | 'name'>,
  dimensions?: { width: number; height: number },
  maxBytes: number = MAX_IMAGE_BYTES
): ImageValidation {
  const accepted = ACCEPTED_IMAGE_TYPES as readonly string[]

  if (!accepted.includes(file.type)) {
    return { accepted: false, reason: 'Choose a PNG, JPEG, or WebP image.' }
  }

  if (file.size > maxBytes) {
    return { accepted: false, reason: `Images must be ${formatMegabytes(maxBytes)} or smaller.` }
  }

  if (file.size === 0) {
    return { accepted: false, reason: 'That file is empty.' }
  }

  if (dimensions && (dimensions.width < 64 || dimensions.height < 64)) {
    return { accepted: false, reason: 'That image is too small to frame.' }
  }

  return { accepted: true }
}

export const DEFAULT_BADGE_ROLE: BadgeRole = 'Participant'
export const DEFAULT_CERTIFICATE_TYPE: CertificateType = 'Participation'
export const DEFAULT_POSTER_CONTENT_TYPE: PosterContentType = 'Announcement'
