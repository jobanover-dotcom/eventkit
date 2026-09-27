import { encodeQr } from '@/lib/qr'
import type { AnyDesignData } from '@/features/design/types'
import type { DesignImages, DesignTemplate, DrawContext } from '@/features/design/lib/types'

/**
 * The browser adapter between a template and a real canvas.
 *
 * All asynchronous work happens here — fonts, image decoding, QR encoding — so
 * that `template.draw` stays synchronous and pure. That split is what makes the
 * visual layer testable in jsdom, where no canvas implementation exists.
 *
 * This module touches `document` and therefore only runs in the browser. It is
 * imported from Client Components and never from a Server Component.
 */

export type RenderScale = number

export type RenderDesignOptions = {
  /** Multiplies the template's export size. 1 is full export resolution. */
  scale?: RenderScale
  /** Waits for webfonts before measuring text. Defaults to true. */
  waitForFonts?: boolean
}

export type ResolveImagesInput<TData extends AnyDesignData> = {
  data: TData
  /** Set false for kinds with no QR (poster when hidden, photo frame). */
  includeQr: boolean
  /** A locally chosen photo, as an object URL or data URL. */
  photoUrl?: string | null
  /**
   * Overrides what the QR encodes.
   *
   * The default is the person's check-in token, which is right for a badge and
   * wrong for a certificate: a certificate's QR has to carry that certificate's
   * verification token, and the two must never be the same secret. Badges leave
   * this unset.
   */
  qrPayload?: string | null
}

const MAX_IMAGE_EDGE = 2400

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Decodes an image and downscales it. A 12MP phone photo would otherwise be
 * drawn at full size and bloat the exported PNG for no visible benefit at print
 * sizes.
 */
export async function loadImage(url: string): Promise<CanvasImageSource | null> {
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url

    await image.decode()

    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight)
    if (longestEdge <= MAX_IMAGE_EDGE) return image

    const scale = MAX_IMAGE_EDGE / longestEdge
    const canvas = createCanvas(
      Math.max(1, Math.round(image.naturalWidth * scale)),
      Math.max(1, Math.round(image.naturalHeight * scale))
    )
    const context = canvas.getContext('2d')
    if (!context) return image

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } catch {
    // A logo or cover that will not load must not fail the whole design; the
    // templates fall back to a monogram or a plain panel.
    return null
  }
}

export async function resolveDesignImages<TData extends AnyDesignData>(
  input: ResolveImagesInput<TData>
): Promise<DesignImages> {
  const { data, includeQr, photoUrl, qrPayload } = input
  const event = data.event
  const token =
    'participant' in data
      ? data.participant.qrToken
      : 'recipient' in data
        ? data.recipient.qrToken
        : null

  // An explicit payload wins, and a blank one means "no QR" rather than falling
  // back to the check-in token — a certificate without a record yet must not
  // silently print somebody's door code.
  const qrText = qrPayload?.trim() ? qrPayload.trim() : token

  const [logo, cover, photo, qr] = await Promise.all([
    event.logoUrl ? loadImage(event.logoUrl) : Promise.resolve(null),
    event.coverImageUrl ? loadImage(event.coverImageUrl) : Promise.resolve(null),
    photoUrl ? loadImage(photoUrl) : Promise.resolve(null),
    // The payload is an opaque token or a verification URL and nothing else.
    includeQr && qrText ? encodeQr(qrText, { size: 512 }) : Promise.resolve(null),
  ])

  const images: DesignImages = {}
  if (logo) images.logo = logo
  if (cover) images.cover = cover
  if (photo) images.photo = photo
  if (qr) images.qr = qr
  return images
}

async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await document.fonts.ready
  } catch {
    // Fall back to the fallback stack in the font shorthand rather than
    // rendering with invisible text.
  }
}

export async function renderDesign<TData extends AnyDesignData>(
  template: DesignTemplate<TData>,
  data: TData,
  images: DesignImages,
  options: RenderDesignOptions = {}
): Promise<HTMLCanvasElement> {
  const scale = options.scale ?? 1

  if (options.waitForFonts !== false) await ensureFonts()

  const canvas = createCanvas(
    Math.max(1, Math.round(template.width * scale)),
    Math.max(1, Math.round(template.height * scale))
  )

  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not provide a 2D canvas context.')

  // Templates draw in export units; the scale transform handles the rest.
  context.scale(scale, scale)
  template.draw(context as unknown as DrawContext, data, images)

  return canvas
}

/** Rasterises to a PNG data URL, which is what the preview and jsPDF consume. */
export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}
