import { CERTIFICATE_FONT_KEYS, type CertificateFontKey } from '@/config/fonts'

/**
 * The shape of a custom certificate template.
 *
 * A template is a PNG the organizer designed elsewhere, used **exactly as
 * uploaded**, plus any number of dynamic text layers placed over it. EventKit does
 * not touch the artwork: there is no placeholder colour, no region detection, and
 * no image processing of any kind. Everything static — the certificate title, the
 * event name, the date, the signatures, the borders — is the designer's pixels.
 * EventKit's only job is to write the recipient's name on top.
 *
 * Every coordinate is in **original PNG pixels**, never screen pixels. The editor
 * is scaled to fit the browser; storing its measurements would make one template
 * render differently at different sizes. `geometry.ts` converts on the way in and
 * out.
 */

export const HORIZONTAL_ALIGNS = ['left', 'center', 'right'] as const
export type HorizontalAlign = (typeof HORIZONTAL_ALIGNS)[number]

export const VERTICAL_ALIGNS = ['top', 'middle', 'bottom'] as const
export type VerticalAlign = (typeof VERTICAL_ALIGNS)[number]

/** Only two weights. A certificate does not need a nine-step scale, and each
 *  extra weight is another thing to get subtly wrong in the PDF. */
export const FONT_WEIGHTS = [400, 700] as const
export type FontWeight = (typeof FONT_WEIGHTS)[number]

/**
 * The dynamic fields a custom certificate supports.
 *
 * One, for now. A custom certificate is a finished piece of artwork with a hole
 * for the name, so the certificate type is *part of the artwork* rather than
 * something EventKit chooses. A second field would be added here, deliberately,
 * when there is a second thing that genuinely varies per recipient.
 */
export const TEXT_LAYER_FIELDS = ['recipientName'] as const
export type TextLayerField = (typeof TEXT_LAYER_FIELDS)[number]

/** One placed text box. */
export type TextLayer = {
  /** Stable across edits, so selection and deletion address the right box. */
  id: string
  /** Which value is written into this box. */
  field: TextLayerField
  x: number
  y: number
  width: number
  height: number
  fontFamily: CertificateFontKey
  fontSize: number
  fontWeight: FontWeight
  italic: boolean
  color: string
  horizontalAlign: HorizontalAlign
  verticalAlign: VerticalAlign
  /** Extra spacing between characters, in pixels. Negative tightens. */
  letterSpacing: number
  /** Multiplier of font size. Matters once a name wraps. */
  lineHeight: number
}

/** The name shown in the editor while the organizer is arranging boxes. */
export const SAMPLE_RECIPIENT_NAME = 'Juan Dela Cruz'

/**
 * A template's saved configuration, as stored in `design_config`.
 *
 * `textLayers` is the whole configuration. The two sibling keys are **vestigial**:
 * migration 0003 attached a CHECK to this column requiring `recipientName` and
 * `certificateType` to be present as objects, written when the template editor
 * still located two fixed placeholder rectangles. Nothing in the application
 * reads them. They are kept so the live constraint stays satisfied without a
 * database migration, and they are optional on read so a hand-edited row that
 * drops them still loads.
 */
export type CertificateDesignConfig = {
  recipientName: Record<string, never>
  certificateType: Record<string, never>
  textLayers: TextLayer[]
}

export type CertificateBounds = { width: number; height: number }

/** A bare box, used when seeding a layer and by the geometry helpers. */
export type LayerRect = { x: number; y: number; width: number; height: number }

export { CERTIFICATE_FONT_KEYS, type CertificateFontKey }
