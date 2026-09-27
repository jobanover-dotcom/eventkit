import { describe, expect, it } from 'vitest'
import {
  createFakeContext,
  findRectCollisions,
  findTextCollisions,
} from '@/features/design/lib/canvas/fakeContext'
import { ALL_TEMPLATES, templatesFor, templateCountFor } from '@/features/design/lib/templates'
import {
  SAMPLE_BADGE_DATA,
  SAMPLE_CERTIFICATE_DATA,
  SAMPLE_PHOTO_FRAME_DATA,
  SAMPLE_POSTER_DATA,
} from '@/features/design/lib/sampleData'
import type { AnyDesignData, DesignKind } from '@/features/design/types'

/**
 * The whole visual layer, exercised without a browser.
 *
 * Each template is drawn against a recording context and then checked for the
 * two things that actually go wrong in a print design: crashing, and putting
 * text outside the page. This is the "testable without a browser" property
 * CONTEXT.md asks for, and it is why the draw functions take an explicit
 * `DrawContext` instead of reaching for a global.
 */

const SAMPLE_BY_KIND = {
  badge: SAMPLE_BADGE_DATA,
  certificate: SAMPLE_CERTIFICATE_DATA,
  poster: SAMPLE_POSTER_DATA,
  photo_frame: SAMPLE_PHOTO_FRAME_DATA,
} as const satisfies Record<DesignKind, AnyDesignData>

const KINDS: readonly DesignKind[] = ['badge', 'certificate', 'poster', 'photo_frame']

describe('the template catalogue', () => {
  it('ships exactly two templates per design kind', () => {
    for (const kind of KINDS) {
      expect(templateCountFor(kind)).toBe(2)
    }
    expect(ALL_TEMPLATES).toHaveLength(8)
  })

  it('uses unique ids', () => {
    const ids = ALL_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every template a name, a blurb, a positive size, and an output', () => {
    for (const template of ALL_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0)
      expect(template.blurb.length).toBeGreaterThan(0)
      expect(template.width).toBeGreaterThan(0)
      expect(template.height).toBeGreaterThan(0)
      expect(template.outputs.length).toBeGreaterThan(0)
    }
  })

  it('only offers PDF for certificates, as the scope requires', () => {
    for (const template of templatesFor('certificate')) {
      expect(template.outputs).toEqual(['pdf'])
    }
  })

  it('only offers PNG for photo frames, as the scope requires', () => {
    for (const template of templatesFor('photo_frame')) {
      expect(template.outputs).toEqual(['png'])
    }
  })

  it('offers both PNG and PDF for badges and posters', () => {
    for (const kind of ['badge', 'poster'] as const) {
      for (const template of templatesFor(kind)) {
        expect(template.outputs).toEqual(['png', 'pdf'])
      }
    }
  })

  it('declares A4 landscape for certificates so the PDF fills the page', () => {
    for (const template of templatesFor('certificate')) {
      expect(template.page).toEqual({ format: 'a4', orientation: 'landscape' })
    }
  })
})

describe.each(KINDS)('%s templates', (kind) => {
  const templates = templatesFor(kind)
  const data = SAMPLE_BY_KIND[kind] as AnyDesignData

  it.each(templates.map((template) => [template.name, template] as const))(
    '%s renders without throwing',
    (_name, template) => {
      const ctx = createFakeContext()
      expect(() => template.draw(ctx, data as never, {})).not.toThrow()
      expect(ctx.calls.length).toBeGreaterThan(0)
    }
  )

  it.each(templates.map((template) => [template.name, template] as const))(
    '%s keeps every string inside the page',
    (_name, template) => {
      const ctx = createFakeContext()
      ctx.setBounds(template.width, template.height)
      template.draw(ctx, data as never, {})

      const strays = ctx.overflowingTexts()
      expect(
        strays.map((entry) => `${entry.text} @${Math.round(entry.x)},${Math.round(entry.y)}`)
      ).toEqual([])
    }
  )

  it.each(templates.map((template) => [template.name, template] as const))(
    '%s is deterministic',
    (_name, template) => {
      const first = createFakeContext()
      const second = createFakeContext()
      template.draw(first, data as never, {})
      template.draw(second, data as never, {})

      expect(second.texts).toEqual(first.texts)
      expect(second.calls.map((call) => call.op)).toEqual(first.calls.map((call) => call.op))
    }
  )

  it.each(templates.map((template) => [template.name, template] as const))(
    '%s never prints one string on top of another',
    (_name, template) => {
      // Staying inside the page is not the same as being readable. A heading
      // laid out from a fixed offset can sit perfectly within the canvas and
      // still print over the message beneath it.
      const ctx = createFakeContext()
      template.draw(ctx, data as never, {})

      const collisions = findTextCollisions(ctx.textRects()).map(
        ([a, b]) => `${a.label} (${Math.round(a.top)}) over ${b.label} (${Math.round(b.top)})`
      )

      expect(collisions).toEqual([])
    }
  )

  it.each(templates.map((template) => [template.name, template] as const))(
    '%s keeps text clear of the QR plate and the framed photo',
    (_name, template) => {
      // A QR landing on the course line is the same defect as two strings
      // overlapping, and a bounds check cannot see it because both are well
      // inside the page.
      const ctx = createFakeContext()
      const qr = { width: 64, height: 64 } as never
      const photo = { width: 64, height: 64 } as never
      const images =
        kind === 'photo_frame' ? { photo } : kind === 'badge' || kind === 'poster' ? { qr } : {}

      template.draw(ctx, data as never, images)

      const rects = [
        ...ctx.textRects().map((rect) => ({ ...rect, label: `"${rect.text}"` })),
        ...ctx.imageRects(),
      ]
      const collisions = findRectCollisions(rects).map(([a, b]) => `${a.label} overlaps ${b.label}`)

      expect(collisions).toEqual([])
    }
  )

  it.each(templates.map((template) => [template.name, template] as const))(
    '%s draws the participant name on the badge',
    (_name, template) => {
      // Only meaningful for the participant-bound kinds.
      if (kind !== 'badge') return
      const ctx = createFakeContext()
      template.draw(ctx, data as never, {})
      const drawn = ctx.texts.map((entry) => entry.text).join(' ')
      expect(drawn).toContain('Maria')
    }
  )
})

describe('template behaviour with hostile content', () => {
  const longName = 'Bartholomew Maximilian Featherstonehaugh-Montgomery III'

  it('survives a very long participant name on a badge', () => {
    const template = templatesFor('badge')[0]
    if (!template) throw new Error('no badge template')

    const ctx = createFakeContext()
    ctx.setBounds(template.width, template.height)

    expect(() =>
      template.draw(
        ctx,
        {
          ...SAMPLE_BADGE_DATA,
          participant: { ...SAMPLE_BADGE_DATA.participant, name: longName },
        } as never,
        {}
      )
    ).not.toThrow()

    expect(ctx.overflowingTexts()).toEqual([])
  })

  it('survives a very long recipient name on a certificate', () => {
    const template = templatesFor('certificate')[0]
    if (!template) throw new Error('no certificate template')

    const ctx = createFakeContext()
    ctx.setBounds(template.width, template.height)

    expect(() =>
      template.draw(
        ctx,
        {
          ...SAMPLE_CERTIFICATE_DATA,
          recipient: { ...SAMPLE_CERTIFICATE_DATA.recipient, name: longName },
        } as never,
        {}
      )
    ).not.toThrow()

    expect(ctx.overflowingTexts()).toEqual([])
  })

  it('falls back cleanly when the event has no theme colour set', () => {
    const template = templatesFor('poster')[0]
    if (!template) throw new Error('no poster template')

    const ctx = createFakeContext()
    expect(() =>
      template.draw(
        ctx,
        {
          ...SAMPLE_POSTER_DATA,
          event: { ...SAMPLE_POSTER_DATA.event, theme: 'nonsense' },
        } as never,
        {}
      )
    ).not.toThrow()
  })

  it('draws a QR plate only when a QR image is supplied', () => {
    const badge = templatesFor('badge')[0]
    const frame = templatesFor('photo_frame')[0]
    if (!badge || !frame) throw new Error('missing template')

    const without = createFakeContext()
    badge.draw(without, SAMPLE_BADGE_DATA as never, {})
    expect(without.calls.some((call) => call.op === 'drawImage')).toBe(false)

    const withQr = createFakeContext()
    badge.draw(withQr, SAMPLE_BADGE_DATA as never, { qr: { width: 10, height: 10 } as never })
    expect(withQr.calls.some((call) => call.op === 'drawImage')).toBe(true)

    const frameCtx = createFakeContext()
    frame.draw(frameCtx, SAMPLE_PHOTO_FRAME_DATA as never, {})
    expect(frameCtx.calls.some((call) => call.op === 'drawImage')).toBe(false)
  })
})
