import type { DrawContext } from '@/features/design/lib/types'

/**
 * Drawing a QR code that a phone camera can actually read.
 *
 * The payload is the participant's 256-bit `qr_token` and nothing else — no
 * name, no email, no student id, no event id. That matches the check-in
 * contract in CONTEXT.md: the token is the credential, and the event is
 * resolved server-side from it.
 *
 * The encoder itself lives in render.ts, which builds the raster once and hands
 * it to the template through `images.qr`. This module only draws it.
 */

export type QrBox = {
  x: number
  y: number
  size: number
}

/**
 * Draws the code on a white plate. A QR needs a light quiet zone to scan, and
 * the quiet zone has to be part of the drawn area, not left to whatever the
 * template's background happens to be.
 */
export function drawQr(ctx: DrawContext, qr: CanvasImageSource | undefined, box: QrBox): boolean {
  if (!qr) return false

  const padding = Math.round(box.size * 0.04)

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(
    box.x - padding,
    box.y - padding,
    box.size + padding * 2,
    box.size + padding * 2,
    Math.round(box.size * 0.06)
  )
  ctx.fill()

  ctx.drawImage(qr, box.x, box.y, box.size, box.size)
  return true
}

/**
 * The token as it should appear in a design. Scanners read the pixels, not this
 * caption, so it is a short hint for a human rather than the payload.
 */
export function qrCaption(token: string): string {
  if (token.length <= 8) return token
  return `${token.slice(0, 4)}\u2026${token.slice(-4)}`
}
