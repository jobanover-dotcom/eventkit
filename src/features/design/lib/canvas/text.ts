import type { DrawContext } from '@/features/design/lib/types'

/**
 * Text layout for canvas.
 *
 * Every string a template prints goes through `layoutText`, which shrinks the
 * font until the text fits its box and truncates with an ellipsis if it still
 * does not. That is the whole overflow guarantee: a template cannot draw a
 * participant name that runs off the edge of a badge, however long it is.
 */

const ELLIPSIS = '…'

export type TextFont = {
  family: string
  weight: string
}

/** Builds the `ctx.font` shorthand. The family names come from config/fonts. */
export function fontString(font: TextFont, size: number): string {
  return `${font.weight} ${size}px ${font.family}`
}

export type LayoutTextOptions = {
  font: TextFont
  /** Widest the text may be, in canvas units. */
  maxWidth: number
  /** Hard cap on wrapped lines. */
  maxLines: number
  maxSize: number
  minSize: number
  /** Multiplier of the font size. Defaults to 1.2. */
  lineHeightFactor?: number
  /**
   * Optional cap on the block's total height. Without it a layout can satisfy
   * `maxLines` and still run into whatever a template placed below it, which is
   * how a heading ends up printed over the message.
   */
  maxHeight?: number
}

export type TextLayout = {
  lines: string[]
  font: TextFont
  fontSize: number
  lineHeight: number
  /** Measured width of the widest line, in canvas units. */
  width: number
  /** `lines.length * lineHeight`. */
  height: number
  /** True when the source text was cut, so callers can decide whether to care. */
  truncated: boolean
}

/** Size step while searching for a fit. 1px is cheap enough at these sizes. */
const SIZE_STEP = 1

function measure(ctx: DrawContext, text: string): number {
  return ctx.measureText(text).width
}

function breakWord(word: string, ctx: DrawContext, maxWidth: number): string[] {
  const parts: string[] = []
  let current = ''

  for (const char of word) {
    const attempt = current + char
    if (current && measure(ctx, attempt) > maxWidth) {
      parts.push(current)
      current = char
    } else {
      current = attempt
    }
  }

  if (current) parts.push(current)
  return parts.length ? parts : [word]
}

type WrapResult = {
  lines: string[]
  /** False when input was left over because `maxLines` ran out. */
  complete: boolean
}

/**
 * Greedy word wrap. A word longer than the box is hard-broken rather than
 * clipped. `complete` is what tells the caller that text was dropped, so a
 * layout can be honest about being truncated instead of quietly losing a tail.
 */
function wrap(ctx: DrawContext, text: string, maxWidth: number, maxLines: number): WrapResult {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if (measure(ctx, word) > maxWidth) {
      if (current) {
        lines.push(current)
        current = ''
      }
      if (lines.length >= maxLines) return { lines, complete: false }
      const parts = breakWord(word, ctx, maxWidth)
      for (const part of parts) {
        if (lines.length >= maxLines) return { lines, complete: false }
        lines.push(part)
      }
      continue
    }

    const attempt = current ? `${current} ${word}` : word
    if (measure(ctx, attempt) <= maxWidth) {
      current = attempt
      continue
    }

    if (current) {
      lines.push(current)
      current = ''
    }
    if (lines.length >= maxLines) return { lines, complete: false }
    current = word
  }

  if (current) {
    if (lines.length >= maxLines) return { lines, complete: false }
    lines.push(current)
  }

  return { lines, complete: true }
}

/**
 * Ensures a line ends in an ellipsis and still fits `maxWidth`.
 *
 * `force` matters because a wrap that ran out of lines cuts at a word boundary,
 * leaving a short line that would not otherwise be touched. Without the flag a
 * visibly truncated result would look complete.
 */
function truncateLine(ctx: DrawContext, line: string, maxWidth: number, force = false): string {
  if (!force && measure(ctx, line) <= maxWidth) return line

  let cut = line
  while (cut.length > 0 && measure(ctx, `${cut}${ELLIPSIS}`) > maxWidth) {
    cut = cut.slice(0, -1)
  }

  return cut.length > 0 ? `${cut}${ELLIPSIS}` : ELLIPSIS
}

/**
 * Finds the largest size in `[minSize, maxSize]` at which `text` wraps into at
 * most `maxLines` lines without exceeding `maxWidth`.
 */
export function layoutText(ctx: DrawContext, text: string, options: LayoutTextOptions): TextLayout {
  const { font, maxWidth, maxLines, maxSize, minSize } = options
  const lineHeightFactor = options.lineHeightFactor ?? 1.2
  const maxHeight = options.maxHeight ?? Number.POSITIVE_INFINITY
  const source = text.trim()

  const finish = (lines: string[], fontSize: number, truncated: boolean): TextLayout => {
    const lineHeight = Math.round(fontSize * lineHeightFactor)
    return {
      lines,
      font,
      fontSize,
      lineHeight,
      width: lines.reduce((widest, line) => Math.max(widest, measure(ctx, line)), 0),
      height: lines.length * lineHeight,
      truncated,
    }
  }

  if (!source) return finish([''], maxSize, false)
  if (maxWidth <= 0 || maxLines <= 0) return finish([], minSize, true)

  let best: { lines: string[]; size: number } | null = null

  for (let size = maxSize; size >= minSize; size -= SIZE_STEP) {
    ctx.font = fontString(font, size)
    const wrapped = wrap(ctx, source, maxWidth, maxLines)
    const height = wrapped.lines.length * Math.round(size * lineHeightFactor)

    // `complete` is the part that matters: without it a wrap that quietly
    // dropped a tail would look like a perfect fit.
    if (wrapped.complete && height <= maxHeight) {
      return finish(wrapped.lines, size, false)
    }

    // Keep the last wrap that still honoured the box, so a truncated result is
    // as large and as full as the space allows.
    if (wrapped.lines.length > 0 && wrapped.lines.every((line) => measure(ctx, line) <= maxWidth)) {
      best = { lines: wrapped.lines, size }
    }
  }

  if (best) {
    const lastIndex = best.lines.length - 1
    const clipped = best.lines.map((line, index) =>
      index === lastIndex ? truncateLine(ctx, line, maxWidth, true) : line
    )
    return finish(clipped, best.size, true)
  }

  // Nothing fit at any size. Lay out at the floor size and clip honestly
  // rather than letting the caller draw something that runs off the page.
  ctx.font = fontString(font, minSize)
  const wrapped = wrap(ctx, source, maxWidth, maxLines)
  if (wrapped.lines.length === 0) return finish([], minSize, true)

  const lastIndex = wrapped.lines.length - 1
  const clamped = wrapped.lines.map((line, index) =>
    index === lastIndex ? truncateLine(ctx, line, maxWidth, true) : line
  )

  return finish(clamped, minSize, true)
}

export type DrawTextOptions = {
  layout: TextLayout
  x: number
  /** Top edge of the block. */
  y: number
  color: string
  align?: CanvasTextAlign
}

/**
 * Draws a laid-out block, restoring the context afterwards so a template cannot
 * leak a font, alignment, or fill colour into the next element.
 */
export function drawTextBlock(ctx: DrawContext, options: DrawTextOptions): void {
  const { layout, x, y, color, align = 'left' } = options

  ctx.save()
  ctx.font = fontString(layout.font, layout.fontSize)
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.fillStyle = color

  for (const [index, line] of layout.lines.entries()) {
    ctx.fillText(line, x, y + index * layout.lineHeight)
  }

  ctx.restore()
}
