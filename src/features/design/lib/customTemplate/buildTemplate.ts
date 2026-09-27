import { FONT_HEADING, FONT_SANS } from '@/config/fonts'
import type {
  AnyDesignData,
  CertificateData,
  DesignKind,
  EventBrand,
  ParticipantInfo,
} from '@/features/design/types'
import type { DesignImages, DesignTemplate, DrawContext } from '@/features/design/lib/types'
import { fontString, layoutText } from '@/features/design/lib/canvas/text'
import { drawCover } from '@/features/design/lib/canvas/image'
import { drawQr } from '@/features/design/lib/canvas/qr'
import { fillRect } from '@/features/design/lib/canvas/shape'
import { readableOn } from '@/features/design/lib/canvas/color'
import { templateFieldsFor, type TemplateField } from '@/features/design/lib/customTemplate/fields'
import type { PlaceholderRect } from '@/features/design/lib/customTemplate/placeholder'

/**
 * Turns an uploaded PNG plus a saved field mapping into a real `DesignTemplate`.
 *
 * This is the seam that makes custom templates a feature rather than a fork. A
 * custom template is not a special case anywhere downstream: the picker shows it,
 * the preview renders it, the exporter writes it, and the bulk generator loops
 * over it exactly as it would the built-in templates. The only thing that differs
 * is where its `draw` came from.
 *
 * The green never survives into the output. Every mapped slot is filled with a
 * background colour sampled from the design itself, and the content is drawn on
 * top, so the placeholder colour is not merely covered by content that might be
 * absent — it is covered unconditionally.
 */

export type TemplatePlaceholder = {
  rect: PlaceholderRect
  field: TemplateField | null
}

export type CustomTemplateConfig = {
  id: string
  name: string
  kind: DesignKind
  width: number
  height: number
  placeholders: readonly TemplatePlaceholder[]
  /** Decoded template artwork. The draw closure holds it directly. */
  image: CanvasImageSource
  /**
   * Background painted over each placeholder. Sampled from the artwork so the
   * slot blends in; a designer's own paper colour is a far better guess than
   * any constant EventKit could pick.
   */
  slotBackground?: string
}

const HEADING = { family: FONT_HEADING, weight: '700' } as const
const SANS = { family: FONT_SANS, weight: '500' } as const

/** Padding inside a slot, so text does not touch the designer's edge. */
const SLOT_PADDING_RATIO = 0.06

export type ResolvedFieldValue = {
  text?: string
  photo?: CanvasImageSource
  qr?: CanvasImageSource
}

/**
 * Resolves one template field to a concrete value for one recipient.
 *
 * Optional fields resolve to an empty string rather than to `undefined`, so a
 * participant with no organization prints nothing instead of "undefined" — the
 * behaviour the brief calls for explicitly.
 */
export function resolveFieldValue(
  field: TemplateField,
  input: {
    event: EventBrand
    participant: ParticipantInfo | null
    certificateType?: string
    images: DesignImages
  }
): ResolvedFieldValue {
  const { event, participant, images } = input

  switch (field) {
    case 'recipient_name':
      return { text: participant?.name ?? '' }
    case 'event_name':
      return { text: event.name }
    case 'event_date':
      return { text: event.date }
    case 'event_venue':
      return { text: event.venue }
    case 'certificate_type':
      return { text: input.certificateType ?? '' }
    case 'role':
      return { text: participant?.sourceRole ?? '' }
    case 'title':
      // Null for an ordinary participant, which resolves to an empty slot
      // rather than to the word "undefined" on a printed certificate.
      return { text: participant?.title ?? '' }
    case 'organization':
      return { text: participant?.organization ?? '' }
    case 'recipient_photo':
      return images.photo ? { photo: images.photo } : {}
    case 'verification_qr':
      return images.qr ? { qr: images.qr } : {}
    default:
      return {}
  }
}

function certificateTypeOf(data: AnyDesignData): string | undefined {
  return 'certificateType' in data ? data.certificateType : undefined
}

/**
 * Builds the template.
 *
 * `draw` is synchronous and pure, exactly like a built-in template's, so it can
 * be asserted in jsdom against the recording fake context like every other
 * template in the project.
 */
export function buildCustomTemplate(config: CustomTemplateConfig): DesignTemplate<CertificateData> {
  const { width, height, image, placeholders, slotBackground = '#ffffff' } = config
  const kind: DesignKind = config.kind

  return {
    id: `custom:${config.id}`,
    kind,
    name: config.name,
    blurb: 'Your uploaded template. Green rectangles are filled with event data.',
    width,
    height,
    outputs: ['png', 'pdf'],
    draw: (ctx: DrawContext, data: CertificateData, images: DesignImages) => {
      // The designer's artwork is the base layer, at its natural size.
      ctx.drawImage(image, 0, 0, width, height)

      const certificateType = certificateTypeOf(data)

      for (const placeholder of placeholders) {
        const { rect, field } = placeholder

        // Cover the green first, unconditionally and before anything else. An
        // unmapped placeholder, or one whose value turned out to be empty, must
        // still lose its placeholder colour — that is the whole promise of the
        // reserved colour, and it cannot depend on there being content to show.
        fillRect(ctx, rect, slotBackground)

        if (!field) continue

        const value = resolveFieldValue(field, {
          event: data.event,
          participant: 'recipient' in data ? data.recipient : null,
          certificateType,
          images,
        })

        if (value.qr) {
          drawQrSlot(ctx, value.qr, rect)
          continue
        }

        if (value.photo) {
          drawPhotoSlot(ctx, value.photo, rect)
          continue
        }

        if (value.text) {
          drawTextSlot(ctx, value.text, rect, kind, slotBackground)
        }
      }
    },
  }
}

function paddingFor(rect: PlaceholderRect): number {
  return Math.max(0, Math.min(rect.width, rect.height) * SLOT_PADDING_RATIO)
}

/**
 * Text is centred in the slot and shrunk until it fits.
 *
 * `layoutText` walks the font size down and truncates with an ellipsis as a last
 * resort, so a long name cannot spill over the designer's artwork.
 */
function drawTextSlot(
  ctx: DrawContext,
  text: string,
  rect: PlaceholderRect,
  kind: DesignKind,
  slotBackground: string
): void {
  const padding = paddingFor(rect)
  const maxWidth = Math.max(1, rect.width - padding * 2)
  const maxHeight = Math.max(1, rect.height - padding * 2)

  const layout = layoutText(ctx, text, {
    // A recipient name on a badge is a supporting line under a larger name;
    // on a certificate it is the headline.
    font: kind === 'badge' ? HEADING : SANS,
    maxWidth,
    maxHeight,
    maxSize: Math.round(maxHeight * (kind === 'badge' ? 0.5 : 0.62)),
    minSize: 10,
    maxLines: kind === 'photo_frame' ? 1 : 3,
  })

  ctx.save()
  ctx.font = fontString(layout.font, layout.fontSize)
  ctx.textAlign = 'center'
  // 'top' rather than 'middle', so the y below is the block's real top edge and
  // the drawn box is exactly the box that was fitted. Every built-in template
  // draws the same way, which keeps the geometry assertable.
  ctx.textBaseline = 'top'
  // Contrast is derived from the background the organizer actually chose, so
  // text stays readable on a dark template as well as a light one.
  ctx.fillStyle = readableOn(slotBackground)

  const top = rect.y + (rect.height - layout.height) / 2
  for (const [index, line] of layout.lines.entries()) {
    ctx.fillText(line, rect.x + rect.width / 2, top + index * layout.lineHeight)
  }
  ctx.restore()
}

/**
 * Photos fill the slot with an object-cover crop, so a portrait does not end up
 * letterboxed inside a landscape window.
 */
function drawPhotoSlot(ctx: DrawContext, photo: CanvasImageSource, rect: PlaceholderRect): void {
  const padding = paddingFor(rect)
  drawCover(ctx, photo, {
    x: rect.x + padding,
    y: rect.y + padding,
    width: Math.max(1, rect.width - padding * 2),
    height: Math.max(1, rect.height - padding * 2),
  })
}

/**
 * A QR inside a non-square slot.
 *
 * The code is drawn at the largest square that fits, centred, because stretching
 * one to a rectangle stops it scanning. `drawQr` supplies the white quiet zone.
 */
function drawQrSlot(ctx: DrawContext, qr: CanvasImageSource, rect: PlaceholderRect): void {
  const padding = paddingFor(rect)
  const available = Math.max(1, Math.min(rect.width, rect.height) - padding * 2)
  const size = Math.floor(available)

  drawQr(ctx, qr, {
    x: rect.x + (rect.width - size) / 2,
    y: rect.y + (rect.height - size) / 2,
    size,
  })
}

export { templateFieldsFor }
