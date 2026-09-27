import { describe, expect, it } from 'vitest'
import { createFakeContext } from '@/features/design/lib/canvas/fakeContext'
import {
  buildCustomTemplate,
  resolveFieldValue,
  type CustomTemplateConfig,
} from '@/features/design/lib/customTemplate/buildTemplate'
import {
  fieldsOfType,
  requiredFieldsFor,
  templateFieldsFor,
} from '@/features/design/lib/customTemplate/fields'
import {
  SAMPLE_CERTIFICATE_DATA,
  SAMPLE_EVENT,
  SAMPLE_PARTICIPANT,
} from '@/features/design/lib/sampleData'
import type { DesignImages } from '@/features/design/lib/types'
import type { ParticipantInfo } from '@/features/design/types'

/**
 * Custom template rendering, asserted with the same recording fake context the
 * built-in templates use.
 *
 * The property that matters most is that no `#00B140` survives. Detection
 * promises the organizer their green rectangles become content; if any green
 * remained, the test suite would be lying about the product.
 */

const FAKE_IMAGE = { width: 800, height: 400 } as unknown as CanvasImageSource

function config(overrides: Partial<CustomTemplateConfig> = {}): CustomTemplateConfig {
  return {
    id: 'template-1',
    name: 'Conference Blue',
    kind: 'certificate',
    width: 800,
    height: 400,
    image: FAKE_IMAGE,
    placeholders: [],
    ...overrides,
  }
}

const SPEAKER: ParticipantInfo = {
  ...SAMPLE_PARTICIPANT,
  name: 'Dr. Maria Santos',
  sourceRole: 'Speaker',
  title: 'Keynote Speaker',
  organization: 'Assumption College of Davao',
}

describe('buildCustomTemplate', () => {
  it('paints the artwork as the base layer', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(config())

    template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})

    const images = ctx.imageRects()
    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({ left: 0, top: 0, right: 800, bottom: 400 })
  })

  it('fills a text placeholder with the recipient name', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 100, y: 180, width: 600, height: 60 }, field: 'recipient_name' },
        ],
      })
    )

    template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})

    expect(ctx.texts.map((entry) => entry.text)).toContain('Maria Cristina Dela Cruz Santos')
  })

  it('covers every placeholder rectangle, so no green survives', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 100, y: 180, width: 600, height: 60 }, field: 'recipient_name' },
          { rect: { x: 100, y: 100, width: 400, height: 40 }, field: 'event_name' },
        ],
      })
    )

    template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})

    // One fill per placeholder, plus nothing else: the slot is painted over
    // before any content is drawn, so an empty slot still loses its green.
    const fills = ctx.calls.filter((call) => call.op === 'fillRect')
    expect(fills.length).toBeGreaterThanOrEqual(2)
    for (const fill of fills) {
      expect(fill.args[0]).not.toBe('#00B140')
    }
  })

  it('covers an unmapped placeholder rather than leaving it visible', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(
      config({
        placeholders: [{ rect: { x: 10, y: 10, width: 200, height: 60 }, field: null }],
      })
    )

    template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})

    // Nothing is drawn into it, but the rectangle is still painted over.
    expect(ctx.texts).toHaveLength(0)
    expect(ctx.calls.some((call) => call.op === 'fillRect')).toBe(true)
  })

  it('draws a photo placeholder with a cover crop', () => {
    const ctx = createFakeContext()
    const rect = { x: 40, y: 40, width: 120, height: 120 }
    const template = buildCustomTemplate(
      config({
        placeholders: [{ rect, field: 'recipient_photo' }],
      })
    )

    const photo = { width: 400, height: 600 } as unknown as CanvasImageSource
    template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, { photo })

    // A portrait source in a square slot. `drawCover` scales to fill the box, so
    // the image it hands to drawImage is TALLER than the box and is clipped —
    // that is the object-cover guarantee, as opposed to letterboxing.
    const draws = ctx.calls.filter(
      (call) => call.op === 'drawImage' && (call.args[3] as number) < 700
    )
    expect(draws).toHaveLength(1)

    const [, , , drawnWidth, drawnHeight] = draws[0].args as number[]
    const box = 120 * (1 - 0.06 * 2) // inset by the slot padding
    expect(drawnWidth).toBeCloseTo(box, 1)
    expect(drawnHeight).toBeGreaterThan(box)

    // The fake models the clip, so what is visible is exactly the slot box:
    // the photo fills it, with no gap and no distortion.
    const visible = ctx.imageRects().filter((entry) => entry.left > 0)
    expect(visible).toHaveLength(1)
    expect(visible[0].right - visible[0].left).toBeCloseTo(visible[0].bottom - visible[0].top, 1)
  })

  it('does not fail when a photo placeholder has no photo', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 40, y: 40, width: 120, height: 120 }, field: 'recipient_photo' },
        ],
      })
    )

    expect(() => template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})).not.toThrow()
    expect(ctx.calls.some((call) => call.op === 'fillRect')).toBe(true)
  })

  it('renders a QR placeholder as the largest centred square that fits', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 600, y: 100, width: 120, height: 200 }, field: 'verification_qr' },
        ],
      })
    )

    const qr = { width: 512, height: 512 } as unknown as CanvasImageSource
    template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, { qr })

    const drawn = ctx.imageRects().filter((entry) => entry.label !== 'artwork')
    const qrEntry = drawn[drawn.length - 1]
    expect(qrEntry).toBeDefined()

    // Square, and inside the placeholder rather than stretched to fill it.
    const width = qrEntry.right - qrEntry.left
    const height = qrEntry.bottom - qrEntry.top
    expect(Math.abs(width - height)).toBeLessThan(1)
    expect(width).toBeLessThanOrEqual(120)
    expect(qrEntry.right).toBeLessThanOrEqual(720)
  })

  it('draws a white quiet zone behind the QR', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 600, y: 100, width: 120, height: 200 }, field: 'verification_qr' },
        ],
      })
    )

    template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {
      qr: { width: 512, height: 512 } as unknown as CanvasImageSource,
    })

    expect(ctx.calls.some((call) => call.op === 'roundRect')).toBe(true)
  })

  it('keeps long text inside its rectangle', () => {
    const ctx = createFakeContext()
    ctx.setBounds(800, 400)

    const template = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 40, y: 180, width: 720, height: 40 }, field: 'recipient_name' },
        ],
      })
    )

    const longName: ParticipantInfo = {
      ...SAMPLE_PARTICIPANT,
      name: 'Dr. Maria Cristina Dela Cruz Santos-Villanueva de la Cruz',
    }
    template.draw(ctx as never, { ...SAMPLE_CERTIFICATE_DATA, recipient: longName }, {})

    // No drawn line escapes the page, and none sits outside its own slot.
    expect(ctx.overflowingTexts()).toHaveLength(0)
    for (const entry of ctx.textRects()) {
      expect(entry.top).toBeGreaterThanOrEqual(180)
      expect(entry.bottom).toBeLessThanOrEqual(221)
    }
  })

  it('shrinks the font rather than overflowing a narrow slot', () => {
    const wide = createFakeContext()
    const narrow = createFakeContext()

    const wideTemplate = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 40, y: 180, width: 720, height: 50 }, field: 'recipient_name' },
        ],
      })
    )
    const narrowTemplate = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 40, y: 180, width: 160, height: 50 }, field: 'recipient_name' },
        ],
      })
    )

    const data = SAMPLE_CERTIFICATE_DATA
    wideTemplate.draw(wide as never, data, {})
    narrowTemplate.draw(narrow as never, data, {})

    const sizeOf = (ctx: ReturnType<typeof createFakeContext>) => {
      const match = /(\d+(?:\.\d+)?)px/.exec(ctx.texts[0]?.font ?? '')
      return match?.[1] ? Number(match[1]) : 0
    }

    expect(sizeOf(narrow)).toBeLessThan(sizeOf(wide))
    expect(sizeOf(narrow)).toBeGreaterThanOrEqual(10)
  })

  it('omits an empty optional field instead of printing undefined', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 40, y: 100, width: 400, height: 40 }, field: 'organization' },
          { rect: { x: 40, y: 150, width: 400, height: 40 }, field: 'title' },
        ],
      })
    )

    // SAMPLE_PARTICIPANT is an ordinary participant with no speaker fields.
    template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})

    expect(ctx.texts).toHaveLength(0)
    for (const entry of ctx.texts) {
      expect(entry.text).not.toMatch(/undefined|null/)
    }
  })

  it('renders a speaker organization and title when present', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(
      config({
        placeholders: [
          { rect: { x: 40, y: 100, width: 400, height: 40 }, field: 'organization' },
          { rect: { x: 40, y: 150, width: 400, height: 40 }, field: 'title' },
        ],
      })
    )

    template.draw(ctx as never, { ...SAMPLE_CERTIFICATE_DATA, recipient: SPEAKER }, {})

    const drawn = ctx.texts.map((entry) => entry.text)
    expect(drawn).toContain('Assumption College of Davao')
    expect(drawn).toContain('Keynote Speaker')
  })

  it('exposes the template through the normal template contract', () => {
    const template = buildCustomTemplate(config())

    expect(template.kind).toBe('certificate')
    expect(template.id).toBe('custom:template-1')
    expect(template.width).toBe(800)
    expect(template.height).toBe(400)
    expect(template.outputs).toContain('pdf')
    expect(typeof template.draw).toBe('function')
  })

  it('draws without throwing when nothing is mapped at all', () => {
    const ctx = createFakeContext()
    const template = buildCustomTemplate(config())
    expect(() => template.draw(ctx as never, SAMPLE_CERTIFICATE_DATA, {})).not.toThrow()
  })
})

describe('resolveFieldValue', () => {
  const base = { event: SAMPLE_EVENT, participant: SPEAKER, images: {} as DesignImages }

  it('resolves the speaker profile fields from the recipient', () => {
    expect(resolveFieldValue('title', base).text).toBe('Keynote Speaker')
    expect(resolveFieldValue('organization', base).text).toBe('Assumption College of Davao')
  })

  it('resolves an event field', () => {
    expect(resolveFieldValue('event_name', base).text).toBe(SAMPLE_EVENT.name)
  })

  it('resolves the certificate type only when the design has one', () => {
    expect(
      resolveFieldValue('certificate_type', { ...base, certificateType: 'Appreciation' }).text
    ).toBe('Appreciation')
    expect(resolveFieldValue('certificate_type', base).text).toBe('')
  })

  it('returns an empty string for a missing value rather than undefined', () => {
    expect(resolveFieldValue('title', { ...base, participant: SAMPLE_PARTICIPANT }).text).toBe('')
    expect(resolveFieldValue('recipient_name', { ...base, participant: null }).text).toBe('')
  })

  it('returns nothing for a photo or QR that is not available', () => {
    expect(resolveFieldValue('recipient_photo', base)).toEqual({})
    expect(resolveFieldValue('verification_qr', base)).toEqual({})
  })
})

describe('the field catalogue', () => {
  it('offers the certificate fields the brief calls for', () => {
    const labels = templateFieldsFor('certificate').map((meta) => meta.label)
    for (const label of [
      'Recipient Name',
      'Event Name',
      'Certificate Type',
      'Date',
      'Role',
      'Organization',
      'Recipient Photo',
      'Verification QR',
    ]) {
      expect(labels).toContain(label)
    }
  })

  it('supports TEXT, PHOTO and QR placeholder types', () => {
    const types = new Set(templateFieldsFor('certificate').map((meta) => meta.type))
    expect(types).toEqual(new Set(['TEXT', 'PHOTO', 'QR']))
  })

  it('offers a field set for every design kind', () => {
    for (const kind of ['badge', 'certificate', 'poster', 'photo_frame'] as const) {
      expect(templateFieldsFor(kind).length).toBeGreaterThan(0)
    }
  })

  it('requires a recipient name and a QR for a certificate', () => {
    const required = requiredFieldsFor('certificate').map((meta) => meta.field)
    expect(required).toContain('recipient_name')
    expect(required).toContain('verification_qr')
  })

  it('treats organization and title as optional', () => {
    const optional = templateFieldsFor('certificate')
      .filter((meta) => meta.optional)
      .map((meta) => meta.field)
    expect(optional).toContain('organization')
    expect(optional).toContain('title')
  })

  it('narrows fields by placeholder type', () => {
    expect(fieldsOfType('certificate', 'PHOTO').map((meta) => meta.field)).toEqual([
      'recipient_photo',
    ])
    expect(fieldsOfType('certificate', 'QR').map((meta) => meta.field)).toEqual(['verification_qr'])
  })

  it('has no duplicate field names within a kind', () => {
    for (const kind of ['badge', 'certificate', 'poster', 'photo_frame'] as const) {
      const names = templateFieldsFor(kind).map((meta) => meta.field)
      expect(new Set(names).size).toBe(names.length)
    }
  })
})
