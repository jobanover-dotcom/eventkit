import { z } from 'zod'
import { isCertificateFontKey } from '@/config/fonts'
import {
  HORIZONTAL_ALIGNS,
  TEXT_LAYER_FIELDS,
  VERTICAL_ALIGNS,
  type CertificateDesignConfig,
  type TextLayer,
} from '@/features/certificates/templates/types'

/**
 * Server-side validation for a template's text-layer configuration.
 *
 * The configuration is the source of truth for every generated certificate, and a
 * `jsonb` column accepts anything. This is where "anything" stops: the renderer
 * must never be handed a negative width, a font size of zero, a coordinate
 * outside the artwork, or a colour string that canvas will reject.
 *
 * Pure, so the editor and the server apply the identical rules — a layout that
 * previews correctly but is rejected on save would be maddening to debug.
 */

export const LIMITS = {
  /** Smallest usable text box, in original PNG pixels. */
  minLayerSize: 24,
  /** Guards against a hostile client asking for an enormous canvas. */
  maxEdge: 8000,
  minFontSize: 8,
  maxFontSize: 400,
  minLetterSpacing: -20,
  maxLetterSpacing: 40,
  minLineHeight: 0.8,
  maxLineHeight: 3,
  /**
   * How many text boxes one template may hold.
   *
   * A custom certificate is one name written on a finished piece of artwork, so
   * the honest expectation is one box. The ceiling exists to bound the work a
   * single stored configuration can ask the renderer to do, not to suggest a
   * feature: a dozen name boxes all print the same name.
   */
  maxTextLayers: 20,
} as const

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export const textLayerSchema = z.object({
  id: z.string().min(1).max(64),
  field: z.enum(TEXT_LAYER_FIELDS),
  x: z.number().int().min(0).max(LIMITS.maxEdge),
  y: z.number().int().min(0).max(LIMITS.maxEdge),
  width: z.number().int().min(LIMITS.minLayerSize).max(LIMITS.maxEdge),
  height: z.number().int().min(LIMITS.minLayerSize).max(LIMITS.maxEdge),
  fontFamily: z.string().refine(isCertificateFontKey, 'Choose an available font.'),
  fontSize: z.number().int().min(LIMITS.minFontSize).max(LIMITS.maxFontSize),
  fontWeight: z.union([z.literal(400), z.literal(700)]),
  italic: z.boolean(),
  color: z.string().regex(HEX_COLOR, 'Choose a colour like #111111.'),
  horizontalAlign: z.enum(HORIZONTAL_ALIGNS),
  verticalAlign: z.enum(VERTICAL_ALIGNS),
  letterSpacing: z.number().min(LIMITS.minLetterSpacing).max(LIMITS.maxLetterSpacing),
  lineHeight: z.number().min(LIMITS.minLineHeight).max(LIMITS.maxLineHeight),
})

/**
 * The two keys migration 0003's CHECK requires, optional on read.
 *
 * They are written on every save to satisfy that constraint and are read by
 * nothing. See `CertificateDesignConfig` for why they are still here.
 */
const vestigialLayerKey = z.object({}).passthrough().optional()

export const certificateDesignConfigSchema = z.object({
  recipientName: vestigialLayerKey,
  certificateType: vestigialLayerKey,
  textLayers: z.array(textLayerSchema).max(LIMITS.maxTextLayers),
})

export type CertificateDesignConfigInput = z.input<typeof certificateDesignConfigSchema>
export type CertificateDesignConfigOutput = z.output<typeof certificateDesignConfigSchema>

/**
 * Wraps a layer error so it names the field the editor knows it by.
 *
 * A list means the path is positional, so the index is part of the key:
 * `textLayers.0.fontSize`. The editor maps that back to the layer it is holding.
 */
export function toLayerFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const path = issue.path
    if (path.length === 0) continue
    const field = path.join('.')
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message]
  }
  return fieldErrors
}

/**
 * Narrows a validated value to the domain type.
 *
 * The schema validates `fontFamily` with a refine, which TypeScript cannot carry
 * into the inferred output type, so the narrowing happens here once rather than
 * at every call site.
 */
export function toDesignConfig(parsed: CertificateDesignConfigOutput): CertificateDesignConfig {
  return {
    recipientName: {},
    certificateType: {},
    textLayers: parsed.textLayers.map((layer) => ({
      ...layer,
      fontFamily: layer.fontFamily as TextLayer['fontFamily'],
    })),
  }
}

/**
 * Parses a stored `jsonb` value, returning null rather than throwing.
 *
 * A row written by an older build, or edited by hand in the dashboard, must not
 * be able to take down the certificate page. Returning null lets the caller treat
 * it as "no usable template" and carry on with the built-ins. A row in the
 * pre-text-layer shape has no `textLayers` at all and lands here too.
 */
export function parseDesignConfig(value: unknown): CertificateDesignConfig | null {
  const parsed = certificateDesignConfigSchema.safeParse(value)
  return parsed.success ? toDesignConfig(parsed.data) : null
}
