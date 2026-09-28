/**
 * Custom photo frames.
 *
 * A custom frame is the organizer's own PNG, stored untouched. One area of it
 * is `#22ff00`; that area is where the attendee's photo goes, and its shape is
 * whatever pixels happen to match, so a rectangle, a star and two separated
 * cut-outs all work without this module knowing any shapes.
 *
 * Detection happens in `canvas/colorKey.ts`. This file turns a detected mask
 * into a drawable layer, and draws the frame with the photo showing only
 * through that mask. The stored artwork is never modified: the mask is derived
 * at render time from the PNG that is actually loaded, so a template whose
 * stored configuration claims a photo area it does not have simply renders
 * with no photo rather than trusting the claim.
 */

import {
  PHOTO_PLACEHOLDER_HEX,
  detectColorKey,
  dilateMask,
  type MaskBounds,
  type PixelGrid,
} from '@/features/design/lib/canvas/colorKey'
import { buildPalette } from '@/features/design/lib/canvas/color'
import { drawCover, sourceSize } from '@/features/design/lib/canvas/image'
import type { PhotoFrameData } from '@/features/design/types'
import type { DesignImages, DesignTemplate, DrawContext } from '@/features/design/lib/types'

export type PhotoFrameMask = {
  /** One byte per pixel, 1 where the photo shows through. */
  mask: PixelGrid
  width: number
  height: number
  /** Union box of the mask, or `null` when no qualifying pixel was found. */
  bounds: MaskBounds | null
  found: boolean
}

/** The artifacts a built custom template needs to draw itself. */
export type CustomPhotoFrameSource = {
  /** The organizer's PNG, drawn as the untouched base. */
  frame: CanvasImageSource
  /** Alpha-only layer at frame dimensions: opaque where the photo shows. */
  mask: CanvasImageSource
  width: number
  height: number
  bounds: MaskBounds | null
}

function createLayer(width: number, height: number): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas.getContext('2d')
}

/** Rasterises any image source to a pixel grid, whatever kind of source it is. */
function toPixelGrid(source: CanvasImageSource): PixelGrid | null {
  const size = sourceSize(source)
  if (!size || size.width === 0 || size.height === 0) return null

  const context = createLayer(size.width, size.height)
  if (!context) return null

  context.drawImage(source, 0, 0, size.width, size.height)
  return context.getImageData(0, 0, size.width, size.height)
}

/**
 * Detects the key colour in the frame as loaded, then widens the mask to take
 * in the anti-aliased edge.
 *
 * The grid is whatever `loadImage` returned, which is a downscaled canvas for
 * anything over its size limit. Detecting against the file's own pixel grid
 * instead would leave the mask misaligned with the artwork being drawn.
 */
export function detectPhotoFrameMask(frame: CanvasImageSource): PhotoFrameMask | null {
  const pixels = toPixelGrid(frame)
  if (!pixels) return null

  const detected = detectColorKey(pixels)
  const mask = dilateMask(detected.mask, detected.width, detected.height)

  return {
    mask: { data: mask, width: detected.width, height: detected.height },
    width: detected.width,
    height: detected.height,
    // `found` comes from the undilated detection, so it reports real key pixels
    // rather than the dilation inventing a photo area out of nothing.
    found: detected.found,
    bounds: detected.bounds,
  }
}

/** Renders a mask as an alpha-only layer: opaque where the photo shows. */
export function createMaskCanvas(mask: PhotoFrameMask): HTMLCanvasElement | null {
  const context = createLayer(mask.width, mask.height)
  const canvas = context?.canvas
  if (!context || !canvas) return null

  const image = context.createImageData(mask.width, mask.height)
  for (let i = 0; i < mask.mask.width * mask.mask.height; i += 1) {
    const alpha = mask.mask.data[i as number] === 1 ? 255 : 0
    image.data[i * 4 + 3] = alpha
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/**
 * Draws the photo, cover-cropped into the masked area, and keeps only the
 * pixels the mask covers.
 *
 * The `destination-in` is applied to a layer rather than to the frame, because
 * it acts on everything already drawn: run against the frame it would erase
 * the frame outside the mask too. The layer starts empty outside the photo
 * area, so masking it leaves the photo exactly where the artwork allows.
 */
export function drawMaskedPhoto(
  ctx: DrawContext,
  data: PhotoFrameData,
  images: DesignImages,
  source: CustomPhotoFrameSource
): void {
  const { bounds, mask, width, height } = source
  if (!bounds) return

  ctx.save()

  if (images.photo) {
    drawCover(ctx, images.photo, bounds)
  } else {
    // A frame is still usable before a photo is chosen, so the masked area gets
    // a neutral fill rather than leaving the key colour on screen.
    ctx.fillStyle = buildPalette(data.event.theme).wash
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)
  }

  // Set after the cover-crop, which saves and restores its own state.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'

  ctx.restore()
}

function renderCustomPhotoFrame(
  ctx: DrawContext,
  data: PhotoFrameData,
  images: DesignImages,
  source: CustomPhotoFrameSource
): void {
  ctx.drawImage(source.frame, 0, 0, source.width, source.height)
  if (!source.bounds) return

  const context = createLayer(source.width, source.height)
  const layer = context?.canvas
  if (!context || !layer) return

  drawMaskedPhoto(context, data, images, source)
  ctx.drawImage(layer, 0, 0, source.width, source.height)
}

export function buildCustomPhotoFrameTemplate(options: {
  id: string
  name: string
  frame: CanvasImageSource
  width: number
  height: number
  /** `null` when the artwork holds no key colour, so no photo will show. */
  mask: PhotoFrameMask | null
}): DesignTemplate<PhotoFrameData> {
  const { id, name, frame, width, height, mask } = options
  const maskCanvas = mask ? createMaskCanvas(mask) : null

  const source: CustomPhotoFrameSource = {
    frame,
    mask: maskCanvas ?? frame,
    width,
    height,
    bounds: mask?.bounds ?? null,
  }

  return {
    id,
    kind: 'photo_frame',
    name,
    blurb: `Custom artwork. The ${PHOTO_PLACEHOLDER_HEX} area is filled by the photo.`,
    width,
    height,
    outputs: ['png'],
    draw: (ctx, data, images) => renderCustomPhotoFrame(ctx, data, images, source),
  }
}
