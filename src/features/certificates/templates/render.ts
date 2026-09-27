import { certificateFontFamily } from '@/config/fonts'
import { LIMITS } from '@/features/certificates/templates/configSchema'
import type { CertificateDesignConfig, TextLayer } from '@/features/certificates/templates/types'
import { layoutText, type TextLayout } from '@/features/design/lib/canvas/text'
import { drawQr, type QrBox } from '@/features/design/lib/canvas/qr'
import type { DesignImages, DrawContext, PdfPage } from '@/features/design/lib/types'
import type { DesignTemplate } from '@/features/design/lib/types'
import { encodeQr } from '@/lib/qr'
import type { CertificateData } from '@/features/design/types'

/**
 * The one renderer for a custom certificate template.
 *
 * Both the editor's live preview and the exported PDF call `renderCertificate`.
 * That is deliberate and is the whole reason a template can be trusted: there is
 * no second code path, so a certificate cannot look right in the editor and
 * shift when it is generated. Anything that differs between the two surfaces
 * would be a bug waiting to be printed.
 *
 * The saved `design_config` is the source of truth, and the background is the
 * designer's PNG byte for byte: it is drawn once, full size, and nothing is
 * painted over it. The only thing drawn on top is the recipient's name, once per
 * configured text layer.
 */

/** A4 landscape, matching the built-in certificate templates. */
const CERTIFICATE_PAGE: PdfPage = { format: 'a4', orientation: 'landscape' }

/**
 * Where the verification code sits on a custom template.
 *
 * The uploaded design is arbitrary, so there is no reliable "safe" area to find
 * without the organizer placing it by hand. One consistent position is used
 * instead, and bottom right is the convention on printed certificates and the
 * least likely to sit over a name. It is composited over the artwork, which is
 * why a designer should leave that corner clear.
 */
export const QR_INSET_RATIO = 0.045

export function qrBoxFor(width: number, height: number): QrBox {
  const size = Math.round(Math.min(width, height) * 0.16)
  const inset = Math.round(Math.min(width, height) * QR_INSET_RATIO)
  return {
    x: width - inset - size,
    y: height - inset - size,
    size,
  }
}

export type CertificateTemplateConfig = {
  id: string
  name: string
  width: number
  height: number
  /** The designer's PNG, exactly as uploaded. Never redrawn or altered. */
  background: CanvasImageSource
  designConfig: CertificateDesignConfig
}

function textAnchorX(layer: TextLayer): number {
  if (layer.horizontalAlign === 'left') return layer.x
  if (layer.horizontalAlign === 'right') return layer.x + layer.width
  return layer.x + layer.width / 2
}

function canvasTextAlign(layer: TextLayer): CanvasTextAlign {
  if (layer.horizontalAlign === 'left') return 'left'
  if (layer.horizontalAlign === 'right') return 'right'
  return 'center'
}

/**
 * Fits a string into a layer and reports what it actually used.
 *
 * The order is wrap, then shrink, then give up on whole pixels. Auto-fit runs to
 * half the configured size before anything is truncated, because a certificate
 * that silently shortened somebody's name is worse than one with a name a
 * little smaller than the organizer previewed.
 */
export function fitLayerText(
  ctx: DrawContext,
  text: string,
  layer: TextLayer
): TextLayout & { overflows: boolean } {
  const font = { family: certificateFontFamily(layer.fontFamily), weight: String(layer.fontWeight) }

  // Enough lines to fill the box at the floor size. A tall box should let a long
  // name wrap rather than shrink, which is what the organizer sized it for.
  const floor = Math.max(LIMITS.minFontSize, Math.round(layer.fontSize * 0.5))
  const maxLines = Math.max(1, Math.floor(layer.height / (floor * layer.lineHeight)))

  const layout = layoutText(ctx, text, {
    font,
    maxWidth: layer.width,
    maxHeight: layer.height,
    maxSize: layer.fontSize,
    minSize: floor,
    maxLines,
    lineHeightFactor: layer.lineHeight,
  })

  return {
    ...layout,
    overflows: layout.truncated || layout.height > layer.height || layout.width > layer.width,
  }
}

/**
 * Draws one text layer inside its box.
 *
 * Exported so the editor overlay can measure the same layout the PDF will use,
 * rather than approximating it with DOM text and hoping they agree. Text is
 * wrapped to the box and then shrunk to fit; the box itself is never resized on
 * the organizer's behalf, because a wider box and larger type are separate
 * decisions.
 */
export function drawTextLayer(
  ctx: DrawContext,
  text: string,
  layer: TextLayer
): TextLayout & { overflows: boolean } {
  const layout = fitLayerText(ctx, text, layer)

  ctx.save()
  // Letter spacing is applied per layer and restored on the way out. Browsers
  // that do not implement it ignore the assignment.
  ctx.letterSpacing = `${layer.letterSpacing}px`
  ctx.font = `${layer.italic ? 'italic ' : ''}${layer.fontWeight} ${layout.fontSize}px ${certificateFontFamily(layer.fontFamily)}`
  ctx.textAlign = canvasTextAlign(layer)
  ctx.textBaseline = 'top'
  ctx.fillStyle = layer.color

  const blockHeight = layout.lines.length * layout.lineHeight
  let top = layer.y

  if (layer.verticalAlign === 'middle') top = layer.y + (layer.height - blockHeight) / 2
  else if (layer.verticalAlign === 'bottom') top = layer.y + layer.height - blockHeight

  for (const [index, line] of layout.lines.entries()) {
    ctx.fillText(line, textAnchorX(layer), top + index * layout.lineHeight)
  }

  ctx.restore()
  return layout
}

/**
 * Builds a `DesignTemplate` from a saved configuration.
 *
 * Returning the project's own template type is what lets a custom certificate
 * drop into the existing picker, preview, exporter, and bulk generator with no
 * special casing anywhere.
 */
export function buildCertificateTemplate(
  config: CertificateTemplateConfig
): DesignTemplate<CertificateData> {
  return {
    id: `custom:${config.id}`,
    kind: 'certificate',
    name: config.name,
    blurb: 'Your uploaded design. Your text boxes are placed by you.',
    width: config.width,
    height: config.height,
    page: CERTIFICATE_PAGE,
    outputs: ['png', 'pdf'],
    draw: (ctx: DrawContext, data: CertificateData, images: DesignImages) => {
      // The artwork, untouched. Everything after this is drawn on top of it.
      ctx.drawImage(config.background, 0, 0, config.width, config.height)

      for (const layer of config.designConfig.textLayers) {
        // Every layer is a recipient-name box, so every one prints the same name.
        drawTextLayer(ctx, data.recipient.name, layer)
      }

      drawQr(ctx, images.qr, qrBoxFor(config.width, config.height))
    },
  }
}

/**
 * Resolves the images a custom certificate needs.
 *
 * Only the QR: the artwork already carries the design, and there is no logo or
 * cover to fetch. The payload is the certificate's own verification URL, which
 * is a different secret from the recipient's check-in token.
 */
export async function resolveCertificateImages(options: {
  origin: string
  verificationToken: string
}): Promise<DesignImages> {
  const { origin, verificationToken } = options
  if (!verificationToken) return {}

  const url = `${origin.replace(/\/+$/, '')}/verify/certificate/${verificationToken}`
  const qr = await encodeQr(url, { size: 512 })
  return qr ? { qr } : {}
}
