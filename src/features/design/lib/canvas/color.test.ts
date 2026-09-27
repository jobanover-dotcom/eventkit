import { describe, expect, it } from 'vitest'
import {
  buildPalette,
  isHexColor,
  luminance,
  mix,
  parseHex,
  readableOn,
  shade,
  tint,
  toHex,
} from '@/features/design/lib/canvas/color'

describe('parseHex', () => {
  it('parses a six-digit hex', () => {
    expect(parseHex('#6d28d9')).toEqual({ r: 0x6d, g: 0x28, b: 0xd9 })
  })

  it('accepts a missing hash and surrounding space', () => {
    expect(parseHex('  #FFFFFF ')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it.each([null, undefined, '', 'red', '#fff', '#12345'])(
    'falls back to the brand violet for %s',
    (value) => {
      expect(parseHex(value as string)).toEqual({ r: 0x6d, g: 0x28, b: 0xd9 })
    }
  )
})

describe('toHex', () => {
  it('round-trips', () => {
    expect(toHex(parseHex('#6d28d9'))).toBe('#6d28d9')
  })

  it('clamps out-of-range channels', () => {
    expect(toHex({ r: -20, g: 300, b: 12.6 })).toBe('#00ff0d')
  })
})

describe('mix', () => {
  it('returns the endpoints at 0 and 1', () => {
    const a = parseHex('#000000')
    const b = parseHex('#ffffff')
    expect(mix(a, b, 0)).toEqual(a)
    expect(mix(a, b, 1)).toEqual(b)
  })

  it('clamps the amount', () => {
    const a = parseHex('#000000')
    const b = parseHex('#ffffff')
    expect(mix(a, b, -5)).toEqual(mix(a, b, 0))
    expect(mix(a, b, 5)).toEqual(mix(a, b, 1))
  })
})

describe('tint and shade', () => {
  it('lightens and darkens', () => {
    expect(luminance(tint('#6d28d9', 1))).toBeGreaterThan(luminance('#6d28d9'))
    expect(luminance(shade('#6d28d9', 0.5))).toBeLessThan(luminance('#6d28d9'))
  })

  it('treats 0 and 1 amounts as the endpoints', () => {
    expect(tint('#6d28d9', 0)).toBe('#6d28d9')
    expect(shade('#6d28d9', 0)).toBe('#6d28d9')
  })
})

describe('luminance', () => {
  it('ranks white above black', () => {
    expect(luminance('#ffffff')).toBeGreaterThan(luminance('#808080'))
    expect(luminance('#808080')).toBeGreaterThan(luminance('#000000'))
  })
})

describe('readableOn', () => {
  it('picks dark text on a pale fill and light text on a deep one', () => {
    expect(readableOn('#fde68a')).toBe('#18181b')
    expect(readableOn('#6d28d9')).toBe('#ffffff')
  })
})

describe('isHexColor', () => {
  it.each([
    ['#6d28d9', true],
    ['6d28d9', true],
    ['#6D28D9', true],
    ['#6d28d', false],
    ['#gggggg', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isHexColor(value)).toBe(expected)
  })
})

describe('buildPalette', () => {
  it('derives every colour from a valid theme', () => {
    const palette = buildPalette('#15803d')
    expect(palette.theme).toBe('#15803d')
    expect(palette.paper).toBe('#ffffff')
    expect(palette.onTheme).toBe('#ffffff')
    for (const value of Object.values(palette)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('substitutes a usable theme when the stored value is malformed', () => {
    // `events.theme` has a CHECK constraint today, but a palette that throws on
    // bad input would take the whole generator down rather than degrade.
    expect(buildPalette('not-a-colour').theme).toBe('#6d28d9')
    expect(buildPalette(null).theme).toBe('#6d28d9')
  })
})
