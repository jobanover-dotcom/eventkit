import { describe, expect, it } from 'vitest'
import {
  MIN_PLACEHOLDER_AREA,
  PLACEHOLDER_RGB,
  detectPlaceholders,
  hexToRgb,
  type PixelBuffer,
} from './placeholder'

/**
 * Builds a blank RGBA buffer and paints filled rectangles into it, so the
 * detection rules can be asserted without a canvas.
 */
function buffer(width: number, height: number, fill: [number, number, number] = [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = 255
  }
  return { width, height, data } satisfies PixelBuffer
}

function fillRect(
  target: PixelBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number] = [PLACEHOLDER_RGB.r, PLACEHOLDER_RGB.g, PLACEHOLDER_RGB.b]
) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const offset = (py * target.width + px) * 4
      target.data[offset] = color[0]
      target.data[offset + 1] = color[1]
      target.data[offset + 2] = color[2]
      target.data[offset + 3] = 255
    }
  }
  return target
}

describe('detectPlaceholders', () => {
  it('finds a single solid rectangle with exact bounds', () => {
    const image = fillRect(buffer(200, 200), 40, 60, 100, 50)
    const result = detectPlaceholders(image)

    expect(result.placeholders).toEqual([{ x: 40, y: 60, width: 100, height: 50 }])
    expect(result.warnings).toEqual([])
    expect(result.width).toBe(200)
    expect(result.height).toBe(200)
  })

  it('finds several rectangles', () => {
    const image = buffer(400, 300)
    fillRect(image, 10, 10, 120, 40)
    fillRect(image, 10, 80, 120, 40)
    fillRect(image, 200, 200, 150, 60)

    const result = detectPlaceholders(image)
    expect(result.placeholders).toHaveLength(3)
  })

  it('orders placeholders top to bottom then left to right', () => {
    const image = buffer(400, 400)
    fillRect(image, 200, 10, 100, 40) // top right
    fillRect(image, 10, 10, 100, 40) // top left
    fillRect(image, 10, 200, 100, 40) // bottom

    const result = detectPlaceholders(image)
    expect(result.placeholders.map((r) => [r.x, r.y])).toEqual([
      [10, 10],
      [200, 10],
      [10, 200],
    ])
  })

  it('finds a rectangle at the very edge of the image', () => {
    const image = fillRect(buffer(120, 120), 0, 0, 40, 40)
    expect(detectPlaceholders(image).placeholders).toEqual([{ x: 0, y: 0, width: 40, height: 40 }])
  })

  it('ignores a colour one channel away from the placeholder', () => {
    const image = fillRect(buffer(200, 200), 10, 10, 100, 50, [0, 178, 64])
    const result = detectPlaceholders(image)

    expect(result.placeholders).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('ignores other greens entirely', () => {
    const image = fillRect(buffer(200, 200), 10, 10, 100, 50, [34, 197, 94])
    expect(detectPlaceholders(image).placeholders).toEqual([])
  })

  it('ignores a non-solid shape and warns rather than guessing', () => {
    const image = buffer(200, 200)
    // An L shape: a ring around the bounding box that is not filled.
    fillRect(image, 10, 10, 100, 100)
    fillRect(image, 20, 20, 80, 80, [255, 255, 255])

    const result = detectPlaceholders(image)
    expect(result.placeholders).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('not a solid rectangle')
  })

  it('skips a sub-threshold region and says why', () => {
    const image = fillRect(buffer(200, 200), 10, 10, 4, 4)
    const result = detectPlaceholders(image)

    expect(result.placeholders).toEqual([])
    expect(result.warnings[0]).toContain('too small')
  })

  it('treats adjacent rectangles as one region', () => {
    // Two green boxes with no gap are one component, and the union is solid, so
    // it is legitimately one placeholder rather than two overlapping ones.
    const image = fillRect(buffer(300, 200), 10, 10, 100, 50)
    fillRect(image, 110, 10, 100, 50)

    const result = detectPlaceholders(image)
    expect(result.placeholders).toEqual([{ x: 10, y: 10, width: 200, height: 50 }])
  })

  it('keeps separated rectangles apart', () => {
    const image = fillRect(buffer(300, 200), 10, 10, 80, 50)
    fillRect(image, 200, 10, 80, 50)

    expect(detectPlaceholders(image).placeholders).toHaveLength(2)
  })

  it('merges a full-bleed placeholder split into stacked halves', () => {
    const image = buffer(60, 60)
    fillRect(image, 0, 0, 60, 30)
    fillRect(image, 0, 30, 60, 30)

    // The halves share an edge, so they are one component and one solid 60x60
    // box. Reporting two would make the organizer map the same area twice.
    expect(detectPlaceholders(image).placeholders).toEqual([{ x: 0, y: 0, width: 60, height: 60 }])
  })

  it('survives a region far larger than the call stack', () => {
    // A full-image placeholder is ~40k pixels; a recursive flood fill would
    // overflow. The iterative walk must not.
    const image = fillRect(buffer(200, 200), 0, 0, 200, 200)
    expect(detectPlaceholders(image).placeholders).toEqual([
      { x: 0, y: 0, width: 200, height: 200 },
    ])
  })

  it('returns nothing for a blank template', () => {
    const result = detectPlaceholders(buffer(200, 200))
    expect(result.placeholders).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('does not treat erased pixels as part of a placeholder', () => {
    // Erasing in Photoshop clears RGB to zero along with alpha, so a hole in a
    // green rectangle reads as a different colour and breaks the solid test.
    const image = fillRect(buffer(200, 200), 10, 10, 100, 50)
    for (let y = 20; y < 50; y += 1) {
      for (let x = 20; x < 100; x += 1) {
        const offset = (y * 200 + x) * 4
        image.data[offset] = 0
        image.data[offset + 1] = 0
        image.data[offset + 2] = 0
        image.data[offset + 3] = 0
      }
    }

    const result = detectPlaceholders(image)
    expect(result.placeholders).toEqual([])
    expect(result.warnings[0]).toContain('not a solid rectangle')
  })

  it('keeps a minimum area of 64 square pixels', () => {
    expect(MIN_PLACEHOLDER_AREA).toBe(64)
    // 8x8 = 64 is accepted, 7x7 = 49 is not.
    expect(detectPlaceholders(fillRect(buffer(100, 100), 10, 10, 8, 8)).placeholders).toHaveLength(
      1
    )
    expect(detectPlaceholders(fillRect(buffer(100, 100), 10, 10, 7, 7)).placeholders).toHaveLength(
      0
    )
  })
})

describe('hexToRgb', () => {
  it('parses the reserved placeholder colour', () => {
    expect(hexToRgb('#00B140')).toEqual({ r: 0, g: 177, b: 64 })
    expect(hexToRgb('00B140')).toEqual({ r: 0, g: 177, b: 64 })
  })

  it('is case insensitive', () => {
    expect(hexToRgb('#00b140')).toEqual({ r: 0, g: 177, b: 64 })
  })

  it('rejects malformed values', () => {
    for (const value of ['', '#00B14', '#00B1400', 'rgb(0,0,0)', '#GGGGGG']) {
      expect(hexToRgb(value)).toBeNull()
    }
  })
})
