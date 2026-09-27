/**
 * QR token handling, kept pure so it can be tested without a scanner, a
 * database, or a browser.
 *
 * The token is the database's own 256-bit `qr_token`: two `gen_random_uuid()`
 * values with the dashes stripped, lower-case hex, and at least 32 characters by
 * a table CHECK. It is opaque, unique, and derived from nothing a person chose,
 * so it carries no personal data and cannot be guessed.
 */

/**
 * Mirrors the `participants_qr_token_length` CHECK (>= 32) and the hex encoding
 * the column default produces. Deliberately a floor rather than an exact length,
 * so a future token format is not rejected outright at the boundary.
 */
const TOKEN_PATTERN = /^[0-9a-f]{32,128}$/

export function isValidQrToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

/**
 * Cleans up whatever the scanner handed us.
 *
 * A camera decodes the printed code exactly, but a token pasted by hand, or read
 * off a screen by another phone, can arrive with whitespace or upper-case hex.
 * Returns null for anything that cannot be a token, so the caller rejects it
 * before spending a database round trip on it.
 */
export function normalizeQrToken(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null

  const candidate = raw.trim().toLowerCase()
  return isValidQrToken(candidate) ? candidate : null
}

export type TokenMatch = 'match' | 'wrong_event' | 'invalid'

/**
 * Decides what a scanned token means for the event being checked in.
 *
 * `foundEventId` is null when no participant row matched at all. Because the
 * `participants` table is only readable by the owning organizer, a token from
 * somebody else's event can never reach the `wrong_event` branch — it lands in
 * `invalid`, which is what stops this from being an enumeration oracle.
 */
export function classifyTokenMatch(foundEventId: string | null, targetEventId: string): TokenMatch {
  // A falsy id means the lookup matched nothing. Treated as `invalid` rather
  // than `wrong_event`, so a degenerate value can never be reported as a
  // participant belonging to a different event.
  if (!foundEventId) return 'invalid'
  return foundEventId === targetEventId ? 'match' : 'wrong_event'
}
