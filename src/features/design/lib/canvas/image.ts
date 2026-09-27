import { FONT_SANS } from '@/config/fonts'
import type { DrawContext } from '@/features/design/lib/types'

/** Drawing already-decoded images. Loading lives in render.ts, which is async. */

export type SourceSize = { width: number; height: number }

/**
 * Intrinsic size of a raster source. Canvas and image elements expose it
 * directly; anything else is duck-typed so the drawing helpers stay testable
 * without a real canvas.
 */
export function sourceSize(source: CanvasImageSource): SourceSize | null {
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height }
  }
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }

  const candidate = source as { width?: unknown; height?: unknown }
  if (typeof candidate.width === 'number' && typeof candidate.height === 'number') {
    return { width: candidate.width, height: candidate.height }
  }

  return null
}

export type ContainBox = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Fits a source inside a box without distorting it and without cropping, then
 * centres it. Returns the drawn rect so a caller can place a caption under the
 * exact bottom edge of the image.
 */
export function containRect(source: CanvasImageSource, box: ContainBox): ContainBox | null {
  const size = sourceSize(source)
  if (!size || size.width === 0 || size.height === 0) return null

  const scale = Math.min(box.width / size.width, box.height / size.height)
  const width = size.width * scale
  const height = size.height * scale

  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  }
}

export function drawContained(
  ctx: DrawContext,
  source: CanvasImageSource,
  box: ContainBox
): ContainBox | null {
  const rect = containRect(source, box)
  if (!rect) return null
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height)
  return rect
}

/**
 * Fills a box, cropping the overflow. Used for photo frames, where a portrait
 * photo should fill the window rather than float inside it.
 */
export function drawCover(ctx: DrawContext, source: CanvasImageSource, box: ContainBox): boolean {
  const size = sourceSize(source)
  if (!size || size.width === 0 || size.height === 0) return false

  const scale = Math.max(box.width / size.width, box.height / size.height)
  const width = size.width * scale
  const height = size.height * scale

  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.width, box.height)
  ctx.clip()
  ctx.drawImage(
    source,
    box.x + (box.width - width) / 2,
    box.y + (box.height - height) / 2,
    width,
    height
  )
  ctx.restore()
  return true
}

/**
 * Draws a logo centred in a box, or a themed monogram placeholder when the
 * event has no logo. Templates must never render an empty gap where a logo is
 * expected, so the fallback lives here rather than in each template.
 */
export function drawLogoOrMonogram(
  ctx: DrawContext,
  source: CanvasImageSource | undefined,
  box: ContainBox,
  options: { initials: string; color: string; textColor: string; radius: number }
): void {
  if (source) {
    const drawn = drawContained(ctx, source, box)
    if (drawn) return
  }

  const size = Math.min(box.width, box.height)
  const x = box.x + (box.width - size) / 2
  const y = box.y + (box.height - size) / 2

  ctx.fillStyle = options.color
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, options.radius)
  ctx.fill()

  ctx.save()
  ctx.fillStyle = options.textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${Math.round(size * 0.42)}px ${FONT_SANS}`
  ctx.fillText(options.initials, x + size / 2, y + size / 2)
  ctx.restore()
}
