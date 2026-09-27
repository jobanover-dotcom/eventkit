/**
 * QR encoding, shared by the participant pass, the registration confirmation,
 * and the Design module's badge and poster templates.
 *
 * The payload is always a participant's opaque `qr_token` and nothing else — no
 * name, no email, no student id, no event id. The token is the credential and
 * the event is resolved server-side from it.
 *
 * Browser only: this creates a canvas. Import it from Client Components.
 */

export const QR_DARK = '#000000'
export const QR_LIGHT = '#ffffff'

type EncodeOptions = {
  size: number
  /** Defaults to pure black, which scans most reliably. */
  dark?: string
  light?: string
}

function createCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

/**
 * Encodes a token into a new canvas, or returns null if the encoder fails.
 *
 * A failure is never fatal: a pass without a scannable code is still readable,
 * whereas a thrown error would take the whole page down.
 */
export async function encodeQr(
  token: string | null | undefined,
  options: EncodeOptions
): Promise<HTMLCanvasElement | null> {
  if (!token) return null

  try {
    // Dynamic import keeps the encoder out of the shared bundle, matching the
    // existing pass-preview pattern.
    const { toCanvas } = await import('qrcode')
    const canvas = createCanvas(options.size)
    await toCanvas(canvas, token, {
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: options.dark ?? QR_DARK, light: options.light ?? QR_LIGHT },
    })
    return canvas
  } catch {
    return null
  }
}

/**
 * Draws a token straight into a canvas the caller already owns, which is what a
 * pass view needs so React keeps control of the element.
 */
export async function renderQrInto(
  canvas: HTMLCanvasElement,
  token: string | null | undefined,
  options: Omit<EncodeOptions, 'size'> = {}
): Promise<boolean> {
  if (!token) return false

  try {
    const { toCanvas } = await import('qrcode')
    await toCanvas(canvas, token, {
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: options.dark ?? QR_DARK, light: options.light ?? QR_LIGHT },
    })
    return true
  } catch {
    return false
  }
}

/**
 * The token as a human hint. A scanner reads the pixels, not this caption, so it
 * is a short reference rather than the payload itself.
 */
export function qrTokenHint(token: string): string {
  if (token.length <= 8) return token
  return `${token.slice(0, 4)}\u2026${token.slice(-4)}`
}
