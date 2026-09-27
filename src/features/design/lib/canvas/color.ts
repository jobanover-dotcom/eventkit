/**
 * Colour helpers for canvas drawing.
 *
 * `events.theme` is a hex string chosen by the organizer, and templates derive
 * every other colour from it. All of it is pure arithmetic so a template's
 * palette is reproducible and unit-testable.
 */

const HEX_PATTERN = /^#?([0-9a-f]{6})$/i

const FALLBACK_THEME = '#6d28d9'

const FALLBACK_RGB: Rgb = { r: 0x6d, g: 0x28, b: 0xd9 }

export type Rgb = { r: number; g: number; b: number }

export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim())
}

/** Parses `#rrggbb`, falling back to the brand violet for anything malformed. */
export function parseHex(value: string | null | undefined): Rgb {
  const match = HEX_PATTERN.exec((value ?? '').trim())
  if (!match) return FALLBACK_RGB

  const int = Number.parseInt(match[1] as string, 16)
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff }
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** Mixes two colours. `amount` 0 returns `from`, 1 returns `to`. */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount))
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  }
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

/** A lighter tint of the theme, for washes and fills. */
export function tint(hex: string, amount = 0.9): string {
  return toHex(mix(parseHex(hex), WHITE, amount))
}

/** A darker shade of the theme, for text and outlines that need contrast. */
export function shade(hex: string, amount = 0.35): string {
  return toHex(mix(parseHex(hex), BLACK, amount))
}

/** Relative luminance per WCAG, used to pick readable text on a coloured fill. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Black or white, whichever reads better on `hex`. Templates that fill a shape
 * with the theme colour use this instead of hardcoding white text, which is
 * unreadable on a pale theme.
 */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#18181b' : '#ffffff'
}

/** The palette a template draws with, derived once from the event theme. */
export type DesignPalette = {
  theme: string
  ink: string
  inkSoft: string
  onTheme: string
  wash: string
  deep: string
  paper: string
  accent: string
}

export function buildPalette(theme: string | null | undefined): DesignPalette {
  const candidate = (theme ?? '').trim()
  const base = isHexColor(candidate) ? candidate : FALLBACK_THEME
  return {
    theme: base,
    ink: '#18181b',
    inkSoft: '#52525b',
    onTheme: readableOn(base),
    wash: tint(base, 0.9),
    deep: shade(base, 0.45),
    paper: '#ffffff',
    accent: shade(base, 0.18),
  }
}
