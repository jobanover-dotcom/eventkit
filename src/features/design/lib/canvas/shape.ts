import type { DrawContext } from '@/features/design/lib/types'
import { buildPalette, type DesignPalette } from '@/features/design/lib/canvas/color'

/** Rectangles, rules, and the decorative furniture every template shares. */

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export function fillRect(ctx: DrawContext, rect: Rect, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
}

export function fillRoundedRect(ctx: DrawContext, rect: Rect, radius: number, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
  ctx.fill()
}

export function strokeRoundedRect(
  ctx: DrawContext,
  rect: Rect,
  radius: number,
  color: string,
  lineWidth: number
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
  ctx.stroke()
}

/** A diagonal brand wash. Used sparingly so templates stay print-friendly. */
export function fillGradient(
  ctx: DrawContext,
  rect: Rect,
  from: string,
  to: string,
  angle: 'diagonal' | 'vertical' = 'diagonal'
): void {
  const gradient =
    angle === 'vertical'
      ? ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height)
      : ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height)

  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  ctx.fillStyle = gradient
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
}

/** Soft corner glow used behind a logo or heading. */
export function fillRadialGlow(
  ctx: DrawContext,
  centerX: number,
  centerY: number,
  radius: number,
  color: string
): void {
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, `${color}00`)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.fill()
}

export function strokeLine(
  ctx: DrawContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** A short centred rule that reads as a divider under a heading. */
export function centeredRule(
  ctx: DrawContext,
  centerX: number,
  y: number,
  width: number,
  color: string,
  lineWidth: number
): void {
  strokeLine(ctx, centerX - width / 2, y, centerX + width / 2, y, color, lineWidth)
}

/**
 * A row of small squares. Purely decorative, and a single `fillRect` loop keeps
 * the whole thing deterministic for the same input.
 */
export function confettiRow(
  ctx: DrawContext,
  startX: number,
  y: number,
  count: number,
  spacing: number,
  size: number,
  colors: readonly string[]
): void {
  for (let index = 0; index < count; index += 1) {
    const color = colors[index % colors.length]
    if (!color) continue
    ctx.globalAlpha = 0.9
    fillRect(ctx, { x: startX + index * spacing, y, width: size, height: size }, color)
  }
  ctx.globalAlpha = 1
}

export function paletteFor(theme: string | null | undefined): DesignPalette {
  return buildPalette(theme)
}
