/**
 * Colour-key detection for custom photo frames.
 *
 * A custom frame is a finished PNG that the organizer coloured one area
 * `#22ff00`. That area is not a shape this module knows about: it is whatever
 * pixels match. Nothing here inspects connectivity, so a rectangle, a circle, a
 * star, a hand-drawn outline and several separated cut-outs all work through
 * the same rule, and the stored artwork is never modified.
 *
 * Pure arithmetic over a pixel grid, so it runs anywhere and is unit-testable
 * without a browser. Turning a mask into a canvas lives in the renderer.
 */

import { parseHex, type Rgb } from './color'

/**
 * The key colour is fixed by the product contract, not an organizer setting:
 * pure chroma key green, the colour a designer reaches for first when told
 * "fill the photo area with a key colour".
 */
export const PHOTO_PLACEHOLDER_HEX = '#22ff00'

export const PHOTO_PLACEHOLDER_KEY: Rgb = parseHex(PHOTO_PLACEHOLDER_HEX)

/**
 * Euclidean RGB distance, out of a maximum of ~441.
 *
 * Two numbers worth keeping in mind when this needs adjusting:
 *
 * - An anti-aliased edge pixel is `#22ff00` blended toward whatever it sits on.
 *   Blending toward white is the worst case at `~337`, so a tolerance of 32
 *   still matches a pixel that is at least ~90% key colour. That covers the
 *   obvious blends, and `MASK_DILATE_PX` covers the outer ring geometrically
 *   rather than by widening this.
 * - A real brand green has to stay out. Tailwind's `green-500` (`#22c55e`) sits
 *   110 away, which is 3.4x this tolerance.
 */
export const COLOR_KEY_TOLERANCE = 32

/**
 * Grows the detected mask by this many pixels in every direction.
 *
 * Detection is thresholded, so the anti-aliased ring right at the edge of the
 * shape usually falls outside it. Widening the mask covers that ring as a
 * geometric operation, which keeps the tolerance tight enough to ignore nearby
 * brand colours. 1px is enough to hide the fringe without eating into the
 * artwork the frame is actually made of.
 */
export const MASK_DILATE_PX = 1

/** The subset of `ImageData` this module needs, so callers need not build one. */
export type PixelGrid = {
  readonly data: ArrayLike<number>
  readonly width: number
  readonly height: number
}

export type MaskBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ColorKeyDetection = {
  /** Whether at least one pixel matched, i.e. the frame has a photo area. */
  found: boolean
  /** One byte per pixel, in row-major order: 1 where the pixel matched. */
  mask: Uint8Array
  width: number
  height: number
  /** Union box of every matched pixel, or `null` when nothing matched. */
  bounds: MaskBounds | null
  pixelCount: number
}

/** Squared Euclidean distance, so comparisons can skip the square root. */
function distanceSquared(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

function emptyDetection(width: number, height: number): ColorKeyDetection {
  return {
    found: false,
    mask: new Uint8Array(Math.max(0, width * height)),
    width,
    height,
    bounds: null,
    pixelCount: 0,
  }
}

/**
 * Flags every pixel within `tolerance` of `key`, and reports the box they all
 * fall inside.
 *
 * Connectivity is deliberately ignored: a shape is whatever the organizer
 * painted, so one mask covers a single cut-out and several separated ones
 * alike. Fully transparent pixels are skipped, so an invisible keyed region
 * cannot stretch the bounds.
 */
export function detectColorKey(
  pixels: PixelGrid,
  key: Rgb = PHOTO_PLACEHOLDER_KEY,
  tolerance: number = COLOR_KEY_TOLERANCE
): ColorKeyDetection {
  const { data, width, height } = pixels
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return emptyDetection(width, height)
  }

  const limit = Math.max(0, tolerance) ** 2
  const mask = new Uint8Array(width * height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let pixelCount = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4

      // An alpha of zero is invisible in the frame; letting it count would
      // move the photo box without changing a single rendered pixel.
      if ((data[i + 3] as number) === 0) continue

      const pixel: Rgb = {
        r: data[i] as number,
        g: data[i + 1] as number,
        b: data[i + 2] as number,
      }
      if (distanceSquared(pixel, key) > limit) continue

      mask[y * width + x] = 1
      pixelCount += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (pixelCount === 0) return { found: false, mask, width, height, bounds: null, pixelCount: 0 }

  return {
    found: true,
    mask,
    width,
    height,
    pixelCount,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  }
}

/** Copies the first `length` entries, so a longer or shorter input is clamped. */
function copyMask(mask: ArrayLike<number>, length: number): Uint8Array {
  const copy = new Uint8Array(length)
  const count = Math.min(length, mask.length)
  for (let i = 0; i < count; i += 1) copy[i] = mask[i] as number
  return copy
}

/**
 * Grows a mask by `px` in every direction, 8-connected, so a one-pixel ring of
 * anti-aliased fringe falls inside it.
 *
 * Reads from a snapshot and writes to a fresh buffer, so a pixel added early in
 * the sweep cannot grow again and drift further than `px`.
 */
export function dilateMask(
  mask: ArrayLike<number>,
  width: number,
  height: number,
  px: number = MASK_DILATE_PX
): Uint8Array {
  const radius = Math.max(0, Math.floor(px))
  const length = Math.max(0, width * height)
  if (radius === 0 || length === 0) return copyMask(mask, length)

  const source = copyMask(mask, length)
  const grown = new Uint8Array(length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = false

      for (let dy = -radius; dy <= radius && !hit; dy += 1) {
        const sy = y + dy
        if (sy < 0 || sy >= height) continue

        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = x + dx
          if (sx < 0 || sx >= width) continue

          if (source[sy * width + sx] === 1) {
            hit = true
            break
          }
        }
      }

      if (hit) grown[y * width + x] = 1
    }
  }

  return grown
}
