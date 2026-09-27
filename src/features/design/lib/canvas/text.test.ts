import { describe, expect, it } from 'vitest'
import { createFakeContext } from '@/features/design/lib/canvas/fakeContext'
import { fontString, layoutText, drawTextBlock } from '@/features/design/lib/canvas/text'

const SANS = { family: 'Inter Variable, sans-serif', weight: '600' }

describe('fontString', () => {
  it('builds a canvas font shorthand', () => {
    expect(fontString(SANS, 48)).toBe('600 48px Inter Variable, sans-serif')
  })
})

describe('layoutText', () => {
  it('returns a single line when the text fits', () => {
    const ctx = createFakeContext()
    const layout = layoutText(ctx, 'Hello', {
      font: SANS,
      maxWidth: 800,
      maxLines: 2,
      maxSize: 48,
      minSize: 12,
    })

    expect(layout.lines).toEqual(['Hello'])
    expect(layout.truncated).toBe(false)
    expect(layout.fontSize).toBe(48)
  })

  it('wraps onto several lines inside the box', () => {
    const ctx = createFakeContext()
    const layout = layoutText(ctx, 'one two three four five six seven eight', {
      font: SANS,
      maxWidth: 400,
      maxLines: 6,
      maxSize: 40,
      minSize: 8,
    })

    expect(layout.lines.length).toBeGreaterThan(1)
    expect(layout.lines.length).toBeLessThanOrEqual(6)
    expect(layout.width).toBeLessThanOrEqual(400)
  })

  /**
   * The core guarantee: whatever the input, nothing is laid out wider than the
   * box it was given. Participant names come from a public form, so this is the
   * case that matters most.
   */
  it.each([
    ['a very long unbroken token', 'x'.repeat(400)],
    ['a realistic long name', 'Maria Cristina Dela Cruz Santos'],
    ['mixed scripts', " Jose  Ã±  Marie-Rose  O'Neill  "],
    ['whitespace only', '     '],
    ['empty', ''],
  ])('never exceeds maxWidth for %s', (_label, value) => {
    const ctx = createFakeContext()
    const maxWidth = 320
    const layout = layoutText(ctx, value, {
      font: SANS,
      maxWidth,
      maxLines: 3,
      maxSize: 72,
      minSize: 16,
    })

    for (const line of layout.lines) {
      expect(ctx.measureText(line).width).toBeLessThanOrEqual(maxWidth)
    }
  })

  it('shrinks the font rather than truncating when a smaller size fits', () => {
    const ctx = createFakeContext()
    const layout = layoutText(ctx, 'Information Technology Festival 2026', {
      font: SANS,
      maxWidth: 300,
      maxLines: 3,
      maxSize: 72,
      minSize: 10,
    })

    expect(layout.truncated).toBe(false)
    expect(layout.fontSize).toBeLessThan(72)
  })

  it('truncates with an ellipsis once the minimum size is reached', () => {
    const ctx = createFakeContext()
    const layout = layoutText(ctx, 'y'.repeat(2000), {
      font: SANS,
      maxWidth: 100,
      maxLines: 1,
      maxSize: 40,
      minSize: 40,
    })

    expect(layout.truncated).toBe(true)
    expect(layout.fontSize).toBe(40)
    expect(layout.lines[0]?.endsWith('\u2026')).toBe(true)
    expect(ctx.measureText(layout.lines[0] ?? '').width).toBeLessThanOrEqual(100)
  })

  it('hard-breaks a single word that cannot fit on one line', () => {
    const ctx = createFakeContext()
    const layout = layoutText(ctx, 'a'.repeat(60), {
      font: SANS,
      maxWidth: 200,
      maxLines: 4,
      maxSize: 20,
      minSize: 20,
    })

    expect(layout.lines.length).toBeGreaterThan(1)
    expect(layout.lines.every((line) => ctx.measureText(line).width <= 200)).toBe(true)
  })

  it('reports line height as a multiple of the chosen size', () => {
    const ctx = createFakeContext()
    const layout = layoutText(ctx, 'Measure me', {
      font: SANS,
      maxWidth: 400,
      maxLines: 2,
      maxSize: 50,
      minSize: 10,
      lineHeightFactor: 1.4,
    })

    expect(layout.lineHeight).toBe(Math.round(50 * 1.4))
    expect(layout.height).toBe(layout.lines.length * layout.lineHeight)
  })
})

describe('drawTextBlock', () => {
  it('draws every line at the right vertical offset', () => {
    const ctx = createFakeContext()
    const layout = layoutText(ctx, 'one two three four', {
      font: SANS,
      maxWidth: 200,
      maxLines: 3,
      maxSize: 30,
      minSize: 8,
    })

    drawTextBlock(ctx, { layout, x: 100, y: 200, color: '#123456' })

    const draws = ctx.calls.filter((call) => call.op === 'fillText')
    expect(draws).toHaveLength(layout.lines.length)
    expect(draws[0]?.args[1]).toBe(100)
    expect(draws[0]?.args[2]).toBe(200)
    expect(draws[1]?.args[2]).toBe(200 + layout.lineHeight)
  })

  it('applies the requested alignment and colour, then restores the context', () => {
    const ctx = createFakeContext()
    const layout = layoutText(ctx, 'Centre me', {
      font: SANS,
      maxWidth: 500,
      maxLines: 1,
      maxSize: 40,
      minSize: 8,
    })

    const alignBefore = ctx.textAlign
    const baselineBefore = ctx.textBaseline

    drawTextBlock(ctx, { layout, x: 250, y: 10, color: '#abcdef', align: 'center' })

    // Restored, so the block cannot leak alignment or baseline into whatever
    // the template draws next.
    expect(ctx.textAlign).toBe(alignBefore)
    expect(ctx.textBaseline).toBe(baselineBefore)

    const alignCalls = ctx.calls.filter((call) => call.op === 'textAlign')
    expect(alignCalls.at(-1)?.args[0]).toBe('center')
    expect(ctx.calls.some((call) => call.op === 'fillStyle' && call.args[0] === '#abcdef')).toBe(
      true
    )
  })
})
