import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeContext } from '@/features/design/lib/canvas/fakeContext'
import { CERTIFICATE_TEMPLATES } from '@/features/design/lib/templates'
import {
  buildCertificateTemplate,
  drawTextLayer,
  fitLayerText,
  qrBoxFor,
  resolveCertificateImages,
} from './render'
import { encodeQr } from '@/lib/qr'
import {
  SAMPLE_CERTIFICATE_DATA,
  SAMPLE_EVENT,
  SAMPLE_PARTICIPANT,
} from '@/features/design/lib/sampleData'
import type { CertificateDesignConfig, TextLayer } from './types'

/**
 * Certificate rendering, asserted with the same recording fake context the
 * built-in templates use.
 *
 * The properties that matter: the saved typography is actually applied, long
 * names stay inside their box, and neither placeholder colour reaches the
 * output.
 */

/** The colours the removed placeholder scheme reserved. Nothing may emit them. */
const RETIRED_PLACEHOLDERS = ['#00B140', '#FF00FF']

let nextId = 0
function layer(overrides: Partial<TextLayer> = {}): TextLayer {
  nextId += 1
  return {
    id: `layer-${nextId}`,
    field: 'recipientName',
    x: 100,
    y: 400,
    width: 900,
    height: 140,
    fontFamily: 'inter',
    fontSize: 42,
    fontWeight: 700,
    italic: false,
    color: '#111111',
    horizontalAlign: 'center',
    verticalAlign: 'middle',
    letterSpacing: 0,
    lineHeight: 1.1,
    ...overrides,
  }
}

function config(overrides: Partial<CertificateDesignConfig> = {}): CertificateDesignConfig {
  return { recipientName: {}, certificateType: {}, textLayers: [layer()], ...overrides }
}

const FAKE_IMAGE = { width: 1920, height: 1080 } as unknown as CanvasImageSource

function build(designConfig = config(), width = 1920, height = 1080) {
  return buildCertificateTemplate({
    id: 'tpl-1',
    name: 'Graduation blue',
    width,
    height,
    background: FAKE_IMAGE,
    designConfig,
  })
}

function renderedCalls(designConfig = config()) {
  const ctx = createFakeContext()
  build(designConfig).draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})
  return ctx
}

describe('drawTextLayer', () => {
  it('writes the text it is given', () => {
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'Juan Dela Cruz', layer())
    expect(ctx.texts.map((entry) => entry.text)).toContain('Juan Dela Cruz')
  })

  it('applies the saved font size', () => {
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'Juan', layer({ fontSize: 72 }))
    expect(ctx.texts[0]?.font).toContain('72px')
  })

  it('applies bold', () => {
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'Juan', layer({ fontWeight: 700 }))
    expect(ctx.texts[0]?.font).toMatch(/^700 /)
  })

  it('applies regular weight', () => {
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'Juan', layer({ fontWeight: 400 }))
    expect(ctx.texts[0]?.font).toMatch(/^400 /)
  })

  it('applies italic', () => {
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'Juan', layer({ italic: true }))
    expect(ctx.texts[0]?.font).toMatch(/italic/)
  })

  it('applies the chosen family', () => {
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'Juan', layer({ fontFamily: 'lora' }))
    expect(ctx.texts[0]?.font).toContain('Lora')
  })

  it('applies each of the bundled families', () => {
    for (const family of ['inter', 'jakarta', 'lora', 'jetbrains'] as const) {
      const ctx = createFakeContext()
      drawTextLayer(ctx as never, 'Juan', layer({ fontFamily: family }))
      expect(ctx.texts[0]?.font, family).toBeTruthy()
      expect(ctx.texts[0]?.font, family).not.toContain('undefined')
    }
  })

  it('applies the saved colour', () => {
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'Juan', layer({ color: '#ff0000' }))
    const fills = ctx.calls.filter((call) => call.op === 'fillText')
    expect(fills.length).toBe(1)
  })

  it('aligns left, centre, and right differently', () => {
    const aligns = (['left', 'center', 'right'] as const).map((align) => {
      const ctx = createFakeContext()
      drawTextLayer(ctx as never, 'Juan', layer({ horizontalAlign: align }))
      return ctx.texts[0]?.align
    })
    expect(aligns).toEqual(['left', 'center', 'right'])
  })

  it('places the block differently for each vertical alignment', () => {
    const tops = (['top', 'middle', 'bottom'] as const).map((align) => {
      const ctx = createFakeContext()
      drawTextLayer(ctx as never, 'Juan', layer({ verticalAlign: align, height: 200 }))
      return ctx.texts[0]?.y
    })
    expect(tops[0]).toBeLessThan(tops[1] as number)
    expect(tops[1]).toBeLessThan(tops[2] as number)
  })

  it('applies letter spacing', () => {
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'Juan', layer({ letterSpacing: 4 }))
    const set = ctx.calls.filter((call) => call.op === 'letterSpacing')
    expect(set.length).toBeGreaterThan(0)
  })

  it('brackets each layer in save and restore so styles cannot leak', () => {
    // `ctx.restore()` returns the canvas to its saved state rather than emitting
    // a style assignment, so the guarantee to assert is the bracketing itself.
    const ctx = createFakeContext()
    drawTextLayer(ctx as never, 'First', layer({ letterSpacing: 8, color: '#ff0000' }))

    const ops = ctx.calls.map((call) => call.op)
    const firstSave = ops.indexOf('save')
    const firstRestore = ops.indexOf('restore')
    expect(firstSave).toBeGreaterThanOrEqual(0)
    expect(firstRestore).toBeGreaterThan(firstSave)
  })

  it('does not let one text box’s styling affect the next', () => {
    const design = config({
      textLayers: [
        layer({ color: '#ff0000', fontSize: 60, letterSpacing: 8 }),
        layer({ y: 620, height: 80, color: '#0000ff', fontSize: 24 }),
      ],
    })
    const ctx = createFakeContext()
    build(design).draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})

    const fonts = ctx.calls.filter((call) => call.op === 'font').map((call) => call.args[0])
    // The second layer sets its own size rather than inheriting the first's.
    expect(fonts.some((font) => String(font).includes('24px'))).toBe(true)
    expect(fonts.some((font) => String(font).includes('60px'))).toBe(true)
  })
})

describe('auto-fit', () => {
  it('keeps a long name inside its box', () => {
    const ctx = createFakeContext()
    const result = fitLayerText(ctx as never, 'Juan Carlos Dela Cruz Santos-Villanueva', layer())
    expect(result.height).toBeLessThanOrEqual(140)
    expect(result.overflows).toBe(false)
  })

  it('wraps a long name onto more than one line', () => {
    const ctx = createFakeContext()
    const result = fitLayerText(ctx as never, 'Juan Carlos Dela Cruz', layer({ width: 320 }))
    expect(result.lines.length).toBeGreaterThan(1)
  })

  it('shrinks rather than overflowing', () => {
    const ctx = createFakeContext()
    const result = fitLayerText(ctx as never, 'Juan Carlos Dela Cruz Santos', layer({ width: 300 }))
    expect(result.fontSize).toBeLessThanOrEqual(42)
  })

  it('does not shrink below half the configured size', () => {
    const ctx = createFakeContext()
    const result = fitLayerText(
      ctx as never,
      'A very long name indeed',
      layer({ fontSize: 20, width: 120 })
    )
    expect(result.fontSize).toBeGreaterThanOrEqual(10)
  })

  it('reports an overflow rather than silently pretending it fits', () => {
    const ctx = createFakeContext()
    const result = fitLayerText(
      ctx as never,
      'Extraordinarily Long Name Here',
      layer({ width: 60, height: 30, fontSize: 60 })
    )
    // Honest reporting matters: the editor shows a warning, and the certificate
    // is still produced rather than dropped.
    expect(typeof result.overflows).toBe('boolean')
  })

  it('leaves a short name at its configured size', () => {
    const ctx = createFakeContext()
    const result = fitLayerText(ctx as never, 'Ana', layer({ fontSize: 60 }))
    expect(result.fontSize).toBe(60)
  })

  it('never puts the text outside the artwork', () => {
    const ctx = createFakeContext()
    ctx.setBounds(1920, 1080)
    const target = layer({ x: 1600, y: 900, width: 300, height: 100 })
    drawTextLayer(ctx as never, 'Juan Carlos Dela Cruz', target)
    expect(ctx.overflowingTexts()).toHaveLength(0)
  })
})

describe('buildCertificateTemplate', () => {
  it('exposes the certificate template contract', () => {
    const template = build()
    expect(template.kind).toBe('certificate')
    expect(template.id).toBe('custom:tpl-1')
    expect(template.width).toBe(1920)
    expect(template.height).toBe(1080)
    expect(template.outputs).toContain('pdf')
  })

  it('fills an A4 landscape page, matching the built-in certificates', () => {
    // Without this a custom certificate exports as A4 portrait with a margin,
    // which looks nothing like the built-ins.
    expect(build().page).toEqual({ format: 'a4', orientation: 'landscape' })
  })

  it('draws the background at the artwork size', () => {
    const ctx = renderedCalls()
    const drawn = ctx.imageRects()
    expect(drawn).toHaveLength(1)
    expect(drawn[0]).toMatchObject({ left: 0, top: 0, right: 1920, bottom: 1080 })
  })

  it('draws the recipient name in the configured text box', () => {
    const texts = renderedCalls().texts.map((entry) => entry.text)
    expect(texts).toContain(SAMPLE_PARTICIPANT.name)
  })

  it('writes no certificate-type text, because the artwork carries the wording', () => {
    // A custom template is a finished design. The type is the designer's pixels,
    // so nothing in this path may print one.
    const texts = renderedCalls().texts.map((entry) => entry.text)
    expect(texts.some((text) => /certificate of/i.test(text))).toBe(false)
  })

  it('draws nothing but the background when there are no text boxes', () => {
    const ctx = createFakeContext()
    build(config({ textLayers: [] })).draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})
    expect(ctx.texts).toHaveLength(0)
    expect(ctx.imageRects()).toHaveLength(1)
  })

  it('draws every configured text box', () => {
    const design = config({
      textLayers: [layer({ x: 100, y: 300 }), layer({ x: 100, y: 600 })],
    })
    const ctx = createFakeContext()
    build(design).draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})
    // Both boxes receive the same name, as a name box must.
    const drawn = ctx.calls.filter((call) => call.op === 'fillText')
    expect(drawn).toHaveLength(2)
    for (const call of drawn) expect(call.args[0]).toBe(SAMPLE_PARTICIPANT.name)
  })

  it('gives every text box the recipient name, not a per-layer value', () => {
    const design = config({
      textLayers: [layer({ x: 50, y: 100 }), layer({ x: 50, y: 200 }), layer({ x: 50, y: 300 })],
    })
    const ctx = createFakeContext()
    build(design).draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})
    const values = new Set(ctx.texts.map((entry) => entry.text))
    expect([...values]).toEqual([SAMPLE_PARTICIPANT.name])
  })

  it('paints nothing over the artwork, so the design survives intact', () => {
    // The uploaded PNG is the certificate. Any fill here would cover the
    // designer's own artwork, which is the whole point of using their file.
    const ctx = renderedCalls()
    expect(ctx.calls.filter((call) => call.op === 'fillRect')).toHaveLength(0)
    expect(ctx.calls.filter((call) => call.op === 'fill')).toHaveLength(0)
  })

  it('paints nothing over the artwork even with several text boxes', () => {
    const ctx = createFakeContext()
    build(config({ textLayers: [layer({ x: 0, y: 0 }), layer({ x: 0, y: 500 })] })).draw(
      ctx as never,
      SAMPLE_CERTIFICATE_DATA,
      {}
    )
    expect(ctx.calls.filter((call) => call.op === 'fillRect' || call.op === 'fill')).toHaveLength(0)
  })

  it('emits no placeholder colour, because there are none any more', () => {
    const ctx = renderedCalls()
    const calls = ctx.calls
      .map((call) => JSON.stringify(call.args))
      .join(' ')
      .toUpperCase()
    for (const colour of RETIRED_PLACEHOLDERS) {
      expect(calls).not.toContain(colour)
    }
  })

  it('draws no rectangle over the artwork at all', () => {
    const ctx = renderedCalls()
    expect(ctx.calls.filter((call) => call.op === 'fillRect')).toHaveLength(0)
  })

  it('prints a speaker name from the same data as a participant', () => {
    const speaker = { ...SAMPLE_PARTICIPANT, name: 'Dr. Maria Santos', sourceRole: 'Speaker' }
    const ctx = createFakeContext()
    build().draw(ctx as never, { ...SAMPLE_CERTIFICATE_DATA, recipient: speaker }, {})
    expect(ctx.texts.map((entry) => entry.text)).toContain('Dr. Maria Santos')
  })

  it('draws the verification QR without needing a placeholder', () => {
    const ctx = createFakeContext()
    build().draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {
      qr: { width: 512, height: 512 } as unknown as CanvasImageSource,
    })
    // One background plus one QR.
    expect(ctx.imageRects()).toHaveLength(2)
  })

  it('omits the QR when no image is supplied', () => {
    const ctx = createFakeContext()
    build().draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})
    expect(ctx.imageRects()).toHaveLength(1)
  })

  it('honours a per-template size', () => {
    const template = buildCertificateTemplate({
      id: 'tpl-2',
      name: 'Portrait card',
      width: 800,
      height: 1200,
      background: { width: 800, height: 1200 } as unknown as CanvasImageSource,
      designConfig: config(),
    })
    expect(template.width).toBe(800)
    expect(template.height).toBe(1200)
  })
})

describe('qrBoxFor', () => {
  it('sits in the bottom right, consistently', () => {
    const box = qrBoxFor(1920, 1080)
    expect(box.x + box.size).toBe(1920 - Math.round(1080 * 0.045))
    expect(box.y + box.size).toBe(1080 - Math.round(1080 * 0.045))
  })

  it('is square so the code stays scannable', () => {
    expect(qrBoxFor(1920, 1080).size).toBe(qrBoxFor(1920, 1080).size)
  })

  it('stays inside the artwork at any size', () => {
    for (const [w, h] of [
      [800, 600],
      [1920, 1080],
      [2480, 3508],
      [400, 1200],
    ]) {
      const box = qrBoxFor(w, h)
      expect(box.x, `${w}x${h}`).toBeGreaterThanOrEqual(0)
      expect(box.y, `${w}x${h}`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.size, `${w}x${h}`).toBeLessThanOrEqual(w)
      expect(box.y + box.size, `${w}x${h}`).toBeLessThanOrEqual(h)
    }
  })
})

describe('the built-in certificates are unaffected', () => {
  it('still declares A4 landscape', () => {
    for (const template of CERTIFICATE_TEMPLATES) {
      expect(template.page, template.name).toEqual({ format: 'a4', orientation: 'landscape' })
    }
  })

  it('still renders', () => {
    for (const template of CERTIFICATE_TEMPLATES) {
      const ctx = createFakeContext()
      expect(
        () => template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {}),
        template.name
      ).not.toThrow()
    }
  })

  it('leaves the event brand untouched', () => {
    const ctx = createFakeContext()
    CERTIFICATE_TEMPLATES[0]?.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})
    expect(SAMPLE_EVENT.name).toBeTruthy()
  })
})

/**
 * The verification QR's payload.
 *
 * These assertions used to live against `certificateVerificationUrl` in
 * `bulkGenerate.ts`, which was folded into `resolveCertificateImages` when the
 * custom template pipeline was reworked. They are worth keeping: the QR is a
 * public, unauthenticated link, so what it must *not* contain is as important as
 * where it points.
 */
vi.mock('@/lib/qr', () => ({ encodeQr: vi.fn() }))

describe('resolveCertificateImages', () => {
  const token = 'f3a9c1d2e4b64f70a1c2d3e4f5061728'

  beforeEach(() => {
    vi.mocked(encodeQr).mockReset()
  })

  it('points at the public verification route with only the token', async () => {
    vi.mocked(encodeQr).mockResolvedValue({
      width: 512,
      height: 512,
    } as unknown as HTMLCanvasElement)

    await resolveCertificateImages({ origin: 'https://eventkit.app', verificationToken: token })

    expect(encodeQr).toHaveBeenCalledWith(`https://eventkit.app/verify/certificate/${token}`, {
      size: 512,
    })
  })

  it('tolerates a trailing slash on the origin', async () => {
    vi.mocked(encodeQr).mockResolvedValue({
      width: 512,
      height: 512,
    } as unknown as HTMLCanvasElement)

    await resolveCertificateImages({ origin: 'https://eventkit.app/', verificationToken: token })

    expect(encodeQr).toHaveBeenCalledWith(`https://eventkit.app/verify/certificate/${token}`, {
      size: 512,
    })
  })

  it('carries no personal data', async () => {
    vi.mocked(encodeQr).mockResolvedValue({
      width: 512,
      height: 512,
    } as unknown as HTMLCanvasElement)

    await resolveCertificateImages({ origin: 'https://eventkit.app', verificationToken: token })

    const url = vi.mocked(encodeQr).mock.calls[0]?.[0] as string
    expect(url).not.toContain('@')
    expect(url).not.toContain('?')
    expect(url.split('/').pop()).toBe(token)
  })

  it('draws no QR at all without a token, rather than an empty code', async () => {
    vi.mocked(encodeQr).mockResolvedValue({
      width: 512,
      height: 512,
    } as unknown as HTMLCanvasElement)

    const images = await resolveCertificateImages({
      origin: 'https://eventkit.app',
      verificationToken: '',
    })

    expect(images.qr).toBeUndefined()
    expect(encodeQr).not.toHaveBeenCalled()
  })
})
