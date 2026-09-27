/**
 * Placeholder detection for custom templates.
 *
 * An organizer draws a rectangle in Canva or Photoshop, fills it with exactly
 * `#00B140`, and exports a PNG. EventKit finds those rectangles and treats each
 * one as a slot for dynamic content.
 *
 * Two decisions matter here.
 *
 * **Contiguous regions, not individual pixels.** Replacing matching pixels
 * in place would shred any design that legitimately uses the colour — an
 * antialiased edge, a gradient — and would leave holes. So the colour is used
 * only to build a mask, and the mask is reduced to connected rectangular
 * regions before anything is drawn.
 *
 * **A region that is not a rectangle is reported, not guessed.** A designer who
 * draws an L-shape or a ring has almost certainly made a mistake, and silently
 * treating it as a rectangle would produce a certificate with content spilling
 * across their artwork. The caller gets a warning instead.
 *
 * Matching is exact. A tolerance would let near-misses — a colour a designer
 * picked to be "close to green" — be silently consumed as a placeholder, which
 * is the worse failure of the two.
 */

/** The one colour reserved for placeholders. RGB (0, 177, 64). */
export const PLACEHOLDER_HEX = '#00B140'

export const PLACEHOLDER_RGB = { r: 0, g: 177, b: 64 } as const

/** Regions smaller than this are noise: a stray pixel or a hairline. */
export const MIN_PLACEHOLDER_AREA = 64

/** A QR has to stay scannable; a placeholder narrower than this is unusable. */
export const MIN_QR_SIZE = 72

export type PlaceholderRect = {
  x: number
  y: number
  width: number
  height: number
}

export type DetectionResult = {
  placeholders: PlaceholderRect[]
  /**
   * Regions matching the colour that are not solid rectangles. Surfaced to the
   * organizer rather than being rendered, because guessing here produces a wrong
   * certificate silently.
   */
  warnings: string[]
  /** Template pixel dimensions, needed to build a template at the right size. */
  width: number
  height: number
}

/** Pixel buffer, kept as a plain object so detection is testable without a canvas. */
export type PixelBuffer = {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, row-major — exactly what `getImageData` returns. */
  data: Uint8ClampedArray | number[]
}

function isPlaceholderPixel(buffer: PixelBuffer, index: number): boolean {
  const offset = index * 4
  return (
    buffer.data[offset] === PLACEHOLDER_RGB.r &&
    buffer.data[offset + 1] === PLACEHOLDER_RGB.g &&
    buffer.data[offset + 2] === PLACEHOLDER_RGB.b
  )
}

type Component = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  count: number
  /** True when every pixel inside the bounding box is the placeholder colour. */
  solid: boolean
}

/**
 * Flood-fills the placeholder mask into connected components.
 *
 * Iterative with an explicit stack, not recursive: a full-width placeholder
 * across a 4000px template is a component of millions of pixels, and recursion
 * at that depth blows the JavaScript call stack.
 *
 * The stack holds linear indices; each is decoded to x/y on pop.
 */
function findComponents(buffer: PixelBuffer): Component[] {
  const { width, height } = buffer
  const total = width * height
  const seen = new Uint8Array(total)
  const components: Component[] = []
  const stack: number[] = []

  for (let start = 0; start < total; start += 1) {
    if (seen[start] === 1) continue
    if (!isPlaceholderPixel(buffer, start)) continue

    seen[start] = 1
    stack.push(start)

    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    let count = 0

    while (stack.length > 0) {
      const index = stack.pop() as number
      const x = index % width
      const y = (index - x) / width

      count += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y

      if (x > 0) {
        const neighbour = index - 1
        if (seen[neighbour] === 0 && isPlaceholderPixel(buffer, neighbour)) {
          seen[neighbour] = 1
          stack.push(neighbour)
        }
      }
      if (x < width - 1) {
        const neighbour = index + 1
        if (seen[neighbour] === 0 && isPlaceholderPixel(buffer, neighbour)) {
          seen[neighbour] = 1
          stack.push(neighbour)
        }
      }
      if (y > 0) {
        const neighbour = index - width
        if (seen[neighbour] === 0 && isPlaceholderPixel(buffer, neighbour)) {
          seen[neighbour] = 1
          stack.push(neighbour)
        }
      }
      if (y < height - 1) {
        const neighbour = index + width
        if (seen[neighbour] === 0 && isPlaceholderPixel(buffer, neighbour)) {
          seen[neighbour] = 1
          stack.push(neighbour)
        }
      }
    }

    components.push({ minX, minY, maxX, maxY, count, solid: false })
  }

  return components
}

/** True when every pixel of a component's bounding box is the placeholder colour. */
function isSolidRectangle(buffer: PixelBuffer, component: Component): boolean {
  const { width } = buffer
  const boxWidth = component.maxX - component.minX + 1
  const boxHeight = component.maxY - component.minY + 1

  if (component.count !== boxWidth * boxHeight) return false

  for (let y = component.minY; y <= component.maxY; y += 1) {
    const rowStart = y * width + component.minX
    for (let x = 0; x < boxWidth; x += 1) {
      if (!isPlaceholderPixel(buffer, rowStart + x)) return false
    }
  }

  return true
}

/**
 * Finds the placeholder rectangles in a decoded PNG.
 *
 * Returns them in reading order — top to bottom, then left to right — so the
 * mapping UI lists placeholders the way they appear on the page rather than in
 * an arbitrary flood-fill order.
 */
export function detectPlaceholders(buffer: PixelBuffer): DetectionResult {
  const { width, height } = buffer
  const placeholders: PlaceholderRect[] = []
  const warnings: string[] = []

  for (const component of findComponents(buffer)) {
    const rect: PlaceholderRect = {
      x: component.minX,
      y: component.minY,
      width: component.maxX - component.minX + 1,
      height: component.maxY - component.minY + 1,
    }

    if (!isSolidRectangle(buffer, component)) {
      warnings.push(
        `A shape near (${rect.x}, ${rect.y}) uses ${PLACEHOLDER_HEX} but is not a solid ` +
          'rectangle, so it was skipped. Only filled rectangles become placeholders.'
      )
      continue
    }

    if (rect.width * rect.height < MIN_PLACEHOLDER_AREA) {
      warnings.push(
        `A ${rect.width}×${rect.height} shape near (${rect.x}, ${rect.y}) is too small to ` +
          'hold content and was skipped.'
      )
      continue
    }

    placeholders.push(rect)
  }

  placeholders.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

  return { placeholders, warnings, width, height }
}

/**
 * Decodes a PNG into pixels and detects its placeholders.
 *
 * Browser-only. Kept separate from the detection itself so the interesting part
 * can be tested in jsdom, which has no canvas.
 */
export async function detectPlaceholdersFromImage(
  image: HTMLImageElement
): Promise<DetectionResult> {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('This browser could not provide a 2D canvas context.')
  }

  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)

  return detectPlaceholders({ width: canvas.width, height: canvas.height, data })
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = match[1] as string
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}
