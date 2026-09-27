import { notFound } from 'next/navigation'
import { ACTION_ERROR_CODES, isAppError, type ActionErrorCode } from '@/lib/errors'

/**
 * Codes that mean "you are not allowed to see this", and therefore deserve a 404
 * rather than a 500.
 *
 * A 404 is also the honest answer to "does this event belong to somebody else?"
 * — anything else confirms the event exists, which is itself a small leak.
 */
const HIDDEN_CODES: readonly ActionErrorCode[] = [
  ACTION_ERROR_CODES.NOT_FOUND,
  ACTION_ERROR_CODES.UNAUTHENTICATED,
  ACTION_ERROR_CODES.FORBIDDEN,
]

/**
 * Whether a thrown value should be shown as a missing page.
 *
 * Only the three codes above qualify. Everything else — a database error, a
 * network fault, a bug in a service, an unrecognised value — is a real fault and
 * must not be disguised as "this page does not exist".
 *
 * Kept separate from the `notFound()` call so the policy can be asserted without
 * reaching into Next's internals, which is also the part worth testing.
 */
export function isHiddenPageError(error: unknown): boolean {
  return isAppError(error) && HIDDEN_CODES.includes(error.code)
}

/**
 * Renders a 404 for "you may not see this", and rethrows everything else.
 *
 * Every page that loads an event used to write a bare `catch { notFound() }`.
 * That silently converted *any* failure into "this page does not exist": a
 * missing column, a dropped connection, a bad query, a bug in a service. A
 * schema mismatch once presented as a 404 and cost an hour of reading the wrong
 * layer.
 *
 * Declared `never` so TypeScript understands a `catch` block that calls it
 * cannot fall through.
 */
export function notFoundUnlessHidden(error: unknown): never {
  if (isHiddenPageError(error)) notFound()
  throw error
}
