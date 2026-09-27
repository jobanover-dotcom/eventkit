import { describe, expect, it } from 'vitest'
import {
  LIMITS,
  certificateDesignConfigSchema,
  parseDesignConfig,
  toDesignConfig,
  toLayerFieldErrors,
} from './configSchema'
import { CERTIFICATE_FONTS } from '@/config/fonts'
import type { CertificateDesignConfig, TextLayer } from './types'

/**
 * The saved layout, asserted as it crosses the server boundary.
 *
 * `design_config` is a `jsonb` column that decides what every generated
 * certificate looks like, and a Server Action is a public endpoint. These tests
 * pin the refusal: a value that would produce a broken certificate is rejected
 * here rather than at the canvas.
 */

/**
 * The two keys migration 0003's CHECK requires. Written on every save, read by
 * nothing; see `CertificateDesignConfig`.
 */
const VESTIGIAL = { recipientName: {}, certificateType: {} } as const

const LAYER = {
  id: 'recipient-name',
  field: 'recipientName',
  x: 100,
  y: 420,
  width: 800,
  height: 120,
  fontFamily: 'inter',
  fontSize: 42,
  fontWeight: 700,
  italic: false,
  color: '#111111',
  horizontalAlign: 'center',
  verticalAlign: 'middle',
  letterSpacing: 0,
  lineHeight: 1.1,
} as const

const VALID = { ...VESTIGIAL, textLayers: [{ ...LAYER }] }

describe('certificateDesignConfigSchema', () => {
  it('accepts a complete configuration', () => {
    expect(certificateDesignConfigSchema.safeParse(VALID).success).toBe(true)
  })

  it('accepts a configuration with no text boxes yet', () => {
    // An organizer can save the artwork and place the name later.
    expect(certificateDesignConfigSchema.safeParse({ ...VESTIGIAL, textLayers: [] }).success).toBe(
      true
    )
  })

  it('accepts several recipient-name boxes', () => {
    const result = certificateDesignConfigSchema.safeParse({
      ...VESTIGIAL,
      textLayers: [
        { ...LAYER, id: 'a' },
        { ...LAYER, id: 'b', y: 600 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('reads a stored row whose vestigial keys were dropped by hand', () => {
    // They are optional on read so a hand-edited row still loads; the writer
    // always emits them.
    expect(certificateDesignConfigSchema.safeParse({ textLayers: [{ ...LAYER }] }).success).toBe(
      true
    )
  })

  it('rejects a text layer with no id, so it could not be selected', () => {
    const withoutId: Record<string, unknown> = { ...LAYER }
    delete withoutId.id
    expect(
      certificateDesignConfigSchema.safeParse({ ...VESTIGIAL, textLayers: [withoutId] }).success
    ).toBe(false)
  })

  it('rejects a field that is not a supported dynamic value', () => {
    const result = certificateDesignConfigSchema.safeParse({
      ...VESTIGIAL,
      textLayers: [{ ...LAYER, field: 'certificateType' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects more text boxes than the ceiling allows', () => {
    const tooMany = Array.from({ length: LIMITS.maxTextLayers + 1 }, (_, index) => ({
      ...LAYER,
      id: `layer-${index}`,
    }))
    expect(
      certificateDesignConfigSchema.safeParse({ ...VESTIGIAL, textLayers: tooMany }).success
    ).toBe(false)
  })

  it.each([
    ['a negative x', { x: -1 }],
    ['an x past the artwork ceiling', { x: LIMITS.maxEdge + 1 }],
    ['a zero width', { width: 0 }],
    ['a width below the usable minimum', { width: LIMITS.minLayerSize - 1 }],
    ['a font size of zero', { fontSize: 0 }],
    ['a font size past the ceiling', { fontSize: LIMITS.maxFontSize + 1 }],
    ['an unsupported font', { fontFamily: 'comic-sans' }],
    ['a non-hex colour', { color: 'rebeccapurple' }],
    ['a short hex colour', { color: '#fff' }],
    ['an unknown alignment', { horizontalAlign: 'justified' }],
    ['an unknown vertical alignment', { verticalAlign: 'baseline' }],
    ['letter spacing past the range', { letterSpacing: 999 }],
    ['a line height past the range', { lineHeight: 12 }],
  ])('rejects %s', (_label, override) => {
    const candidate = { ...LAYER, ...override }
    expect(
      certificateDesignConfigSchema.safeParse({ ...VESTIGIAL, textLayers: [candidate] }).success
    ).toBe(false)
  })

  it('accepts an italic flag and both weights', () => {
    for (const fontWeight of [400, 700]) {
      for (const italic of [true, false]) {
        const candidate = { ...LAYER, fontWeight, italic }
        expect(
          certificateDesignConfigSchema.safeParse({ ...VESTIGIAL, textLayers: [candidate] })
            .success,
          `${fontWeight}/${italic}`
        ).toBe(true)
      }
    }
  })

  it('accepts every bundled font', () => {
    for (const font of CERTIFICATE_FONTS) {
      const candidate = { ...LAYER, fontFamily: font.key }
      expect(
        certificateDesignConfigSchema.safeParse({ ...VESTIGIAL, textLayers: [candidate] }).success,
        font.key
      ).toBe(true)
    }
  })

  it('names the offending box by index and field', () => {
    const parsed = certificateDesignConfigSchema.safeParse({
      ...VESTIGIAL,
      textLayers: [{ ...LAYER }, { ...LAYER, id: 'b', fontSize: 0 }],
    })
    expect(parsed.success).toBe(false)
    if (parsed.success) return

    const fields = toLayerFieldErrors(parsed.error)
    expect(Object.keys(fields)).toContain('textLayers.1.fontSize')
  })
})

describe('toDesignConfig', () => {
  it('round-trips every typography field unchanged', () => {
    const parsed = certificateDesignConfigSchema.parse(VALID)
    const result = toDesignConfig(parsed) as CertificateDesignConfig

    expect(result.textLayers).toHaveLength(1)
    expect(result.textLayers[0]).toEqual(LAYER)
  })

  it('preserves each box independently', () => {
    const parsed = certificateDesignConfigSchema.parse({
      ...VESTIGIAL,
      textLayers: [
        { ...LAYER, id: 'a' },
        { ...LAYER, id: 'b', italic: true, fontWeight: 400, fontFamily: 'lora' },
      ],
    })
    const [first, second] = toDesignConfig(parsed).textLayers as [TextLayer, TextLayer]

    expect(first.italic).toBe(false)
    expect(second.italic).toBe(true)
    expect(first.fontWeight).toBe(700)
    expect(second.fontWeight).toBe(400)
    expect(second.fontFamily).toBe('lora')
  })

  it('always emits the two keys the live CHECK requires', () => {
    const parsed = certificateDesignConfigSchema.parse({ textLayers: [{ ...LAYER }] })
    const result = toDesignConfig(parsed)

    expect(result).toHaveProperty('recipientName')
    expect(result).toHaveProperty('certificateType')
  })

  it('survives the round trip through storage unchanged', () => {
    const written = toDesignConfig(certificateDesignConfigSchema.parse(VALID))
    const reRead = parseDesignConfig(JSON.parse(JSON.stringify(written)))
    expect(reRead).toEqual(written)
  })
})

describe('parseDesignConfig', () => {
  it('returns the configuration for a stored value', () => {
    const result = parseDesignConfig(VALID)
    expect(result?.textLayers[0]?.fontFamily).toBe('inter')
  })

  it('returns null for a row left in the old two-placeholder shape', () => {
    // An older build wrote fixed recipientName/certificateType layer objects and
    // no textLayers. There is no sensible way to guess where a name went, so the
    // row is reported as unusable rather than half-migrated.
    const legacy = {
      recipientName: { x: 1, y: 2, width: 3, height: 4, fontFamily: 'inter' },
      certificateType: { x: 5, y: 6, width: 7, height: 8, fontFamily: 'inter' },
    }
    expect(parseDesignConfig(legacy)).toBeNull()
  })

  it('returns null for a hand-edited or corrupt row rather than throwing', () => {
    // A row edited in the Supabase dashboard must not take down the certificate
    // page; the caller treats null as "no usable template".
    for (const value of [null, undefined, 42, 'nonsense', {}, []]) {
      expect(parseDesignConfig(value), String(value)).toBeNull()
    }
  })

  it('rejects a text layer that is not an object', () => {
    expect(parseDesignConfig({ ...VESTIGIAL, textLayers: ['nope'] })).toBeNull()
  })

  it('rejects a text layer missing a required field', () => {
    const incomplete: Record<string, unknown> = { ...LAYER }
    delete incomplete.fontSize
    expect(parseDesignConfig({ ...VESTIGIAL, textLayers: [incomplete] })).toBeNull()
  })
})
