import { describe, expect, it } from 'vitest'
import {
  COLOR_KEY_TOLERANCE,
  PHOTO_PLACEHOLDER_KEY,
  detectColorKey,
  dilateMask,
  type PixelGrid,
} from '@/features/design/lib/canvas/colorKey'

const GREEN: [number, number, number] = [34, 255, 0]
const WHITE: [number, number, number] = [255, 255, 255]
const NAVY: [number, number, number] = [26, 32, 56]

/** Builds a pixel grid from a grid of colours, row-major. */
function grid(colors: [number, number, number][], width: number, height: number): PixelGrid {
  const data = new Uint8ClampedArray(width * height * 4)
  colors.forEach(([r, g, b], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  return { data, width, height }
}

/** A solid grid, with `at` painting single pixels in a colour. */
function canvas(
  width: number,
  height: number,
  fill: [number, number, number] = NAVY,
  at: Record<string, [number, number, number]> = {}
): PixelGrid {
  const colors: [number, number, number][] = Array.from({ length: width * height }, () => fill)
  for (const [position, color] of Object.entries(at)) {
    const [x, y] = position.split(',').map(Number) as [number, number]
    colors[y * width + x] = color
  }
  return grid(colors, width, height)
}

describe('detectColorKey', () => {
  it('uses the contract key colour', () => {
    expect(PHOTO_PLACEHOLDER_KEY).toEqual({ r: 34, g: 255, b: 0 })
  })

  it('matches the exact key colour', () => {
    const result = detectColorKey(canvas(3, 3, GREEN))
    expect(result.found).toBe(true)
    expect(result.pixelCount).toBe(9)
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 3, height: 3 })
  })

  it('matches a key colour blended toward white, as an anti-aliased edge is', () => {
    // #22ff00 at 95% over white: each channel is the key nudged 5% of the way.
    const blended: [number, number, number] = [47, 255, 13]
    const result = detectColorKey(canvas(2, 2, NAVY, { '0,0': blended }))
    expect(result.found).toBe(true)
    expect(result.pixelCount).toBe(1)
  })

  it('ignores a real brand green', () => {
    // Tailwind green-500, 110 away against a tolerance of 32.
    const result = detectColorKey(canvas(4, 4, [34, 197, 94]))
    expect(result.found).toBe(false)
    expect(result.pixelCount).toBe(0)
  })

  it('reports nothing found when no key colour is present', () => {
    const result = detectColorKey(canvas(5, 5, NAVY))
    expect(result.found).toBe(false)
    expect(result.bounds).toBeNull()
    expect(result.pixelCount).toBe(0)
    expect(result.mask.every((value) => value === 0)).toBe(true)
  })

  it('finds a rectangular placeholder', () => {
    const colors: [number, number, number][] = []
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const inside = x >= 2 && x <= 5 && y >= 3 && y <= 6
        colors.push(inside ? GREEN : NAVY)
      }
    }
    const result = detectColorKey(grid(colors, 8, 8))
    expect(result.bounds).toEqual({ x: 2, y: 3, width: 4, height: 4 })
    expect(result.pixelCount).toBe(16)
  })

  it('finds a circular placeholder without knowing what a circle is', () => {
    // A disc centred in a 21x21 grid, radius 7. Nothing in the implementation
    // knows the shape: 149 lattice points inside it match, corners of the 15x15
    // bounding box do not.
    const colors: [number, number, number][] = []
    for (let y = 0; y < 21; y += 1) {
      for (let x = 0; x < 21; x += 1) {
        const inside = (x - 10) ** 2 + (y - 10) ** 2 <= 7 ** 2
        colors.push(inside ? GREEN : NAVY)
      }
    }
    const result = detectColorKey(grid(colors, 21, 21))
    expect(result.found).toBe(true)
    expect(result.bounds).toEqual({ x: 3, y: 3, width: 15, height: 15 })
    // A disc, not the square around it: 149 of the 225 pixels in the box.
    expect(result.pixelCount).toBe(149)
    expect(result.pixelCount).toBeLessThan(15 * 15)
  })

  it('finds an irregular placeholder and leaves everything else alone', () => {
    // An open hook: a vertical stroke, a horizontal one, and a downward tail.
    const colors: [number, number, number][] = []
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        const inside = (x === 1 && y < 4) || (y === 4 && x < 4) || (x === 4 && y > 1)
        colors.push(inside ? GREEN : WHITE)
      }
    }
    const result = detectColorKey(grid(colors, 6, 6))
    expect(result.found).toBe(true)
    expect(result.pixelCount).toBe(12)
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 5, height: 6 })
  })

  it('covers several separated placeholders in one mask', () => {
    const result = detectColorKey(
      canvas(20, 20, NAVY, {
        '1,1': GREEN,
        '2,1': GREEN,
        '1,2': GREEN,
        '15,15': GREEN,
        '16,16': GREEN,
        '17,15': GREEN,
      })
    )
    // One mask, one union box, both regions counted.
    expect(result.pixelCount).toBe(6)
    expect(result.bounds).toEqual({ x: 1, y: 1, width: 17, height: 16 })
  })

  it('ignores fully transparent pixels so invisible regions cannot move the bounds', () => {
    const data = new Uint8ClampedArray(4 * 3 * 4)
    // A keyed but invisible pixel at (0,0); visible navy elsewhere.
    data[0] = 34
    data[1] = 255
    data[2] = 0
    data[3] = 0
    const result = detectColorKey({ data, width: 4, height: 3 })
    expect(result.found).toBe(false)
  })

  it('returns an empty detection for a zero-sized grid', () => {
    const result = detectColorKey({ data: new Uint8ClampedArray(0), width: 0, height: 0 })
    expect(result.found).toBe(false)
    expect(result.mask).toHaveLength(0)
  })

  it('returns an empty detection for a truncated pixel buffer', () => {
    const result = detectColorKey({ data: new Uint8ClampedArray(8), width: 4, height: 4 })
    expect(result.found).toBe(false)
    expect(result.pixelCount).toBe(0)
  })

  it('honours a custom tolerance and key', () => {
    // 50 away from the key: outside the default 32, inside a 64 tolerance.
    const pixels = canvas(2, 2, [34, 255, 50])
    expect(detectColorKey(pixels).found).toBe(false)
    expect(detectColorKey(pixels, PHOTO_PLACEHOLDER_KEY, 64).found).toBe(true)
    expect(detectColorKey(canvas(2, 2, GREEN), { r: 0, g: 0, b: 0 }, 0).found).toBe(false)
  })

  it('keeps the default tolerance well clear of a brand green', () => {
    // Guards the documented relationship rather than restating it.
    const brand = { r: 34, g: 197, b: 94 }
    const drift = Math.sqrt(
      (brand.r - PHOTO_PLACEHOLDER_KEY.r) ** 2 +
        (brand.g - PHOTO_PLACEHOLDER_KEY.g) ** 2 +
        (brand.b - PHOTO_PLACEHOLDER_KEY.b) ** 2
    )
    expect(drift).toBeGreaterThan(COLOR_KEY_TOLERANCE * 2)
  })
})

describe('dilateMask', () => {
  it('grows a single pixel into a filled 3x3 block', () => {
    const grown = dilateMask(new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]), 3, 3, 1)
    expect(grown).toEqual(new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1]))
  })

  it('grows diagonally, so a corner is covered', () => {
    // A pixel at (0,0) grows to the 2x2 block down-right of it, and no
    // further: (2,2) is two steps away.
    const grown = dilateMask(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 0]), 3, 3, 1)
    expect(grown).toEqual(new Uint8Array([1, 1, 0, 1, 1, 0, 0, 0, 0]))
  })

  it('stops at the image edge instead of wrapping', () => {
    const grown = dilateMask(new Uint8Array([1, 0, 0]), 3, 1, 1)
    expect(grown).toEqual(new Uint8Array([1, 1, 0]))
  })

  it('does not cascade: a grown pixel cannot grow again', () => {
    // A 1px grow of one pixel is 3x3, not the whole 5x5 grid.
    const mask = new Uint8Array(25)
    mask[12] = 1
    const grown = dilateMask(mask, 5, 5, 1)
    expect(grown.reduce((total, value) => total + value, 0)).toBe(9)
  })

  it('grows a detected mask past its detection bounds, covering the fringe', () => {
    // A 2x2 keyed block; dilation should reach the ring one pixel beyond it.
    const colors: [number, number, number][] = []
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        const inside = x >= 2 && x <= 3 && y >= 2 && y <= 3
        colors.push(inside ? GREEN : NAVY)
      }
    }
    const detected = detectColorKey(grid(colors, 6, 6))
    expect(detected.bounds).toEqual({ x: 2, y: 2, width: 2, height: 2 })

    const grown = dilateMask(detected.mask, 6, 6, 1)
    expect(grown[1 * 6 + 1]).toBe(1)
    expect(grown[4 * 6 + 4]).toBe(1)
    expect(grown[0]).toBe(0)
    expect(grown.reduce((total, value) => total + value, 0)).toBe(16)
  })

  it('returns an unchanged copy when the radius is zero', () => {
    const mask = new Uint8Array([0, 1, 0, 1, 0, 0])
    const grown = dilateMask(mask, 3, 2, 0)
    expect(grown).toEqual(new Uint8Array([0, 1, 0, 1, 0, 0]))
    expect(grown).not.toBe(mask)
  })

  it('leaves an empty mask empty', () => {
    expect(dilateMask(new Uint8Array(6), 3, 2, 1)).toEqual(new Uint8Array(6))
  })
})
