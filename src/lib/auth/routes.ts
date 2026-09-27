/**
 * Route classification and redirect-safety helpers shared by the proxy and the
 * organizer layout, so navigation and authorization agree on one definition.
 */

/**
 * Optimistic organizer areas, one section segment deep. The layout and every
 * action re-verify for real.
 *
 * `schedule`, `rules`, and `map` are deliberately **absent**: those are the
 * participant-facing Info pages under `/events/[eventId]`, readable by anyone
 * with the link. Listing them here would make the proxy bounce visitors to
 * `/login` before they ever reached the page.
 */
const ORGANIZER_SECTION_PATTERN =
  /^\/events\/[^/]+\/(dashboard|participants|attendance|check-in|design)$/

/**
 * Organizer-only areas under a participant-facing section path. Narrow on
 * purpose: a visitor must not be redirected away from `/events/x/schedule`.
 */
const ORGANIZER_DESIGN_PATTERN = /^\/events\/[^/]+\/design\/(badge|certificate|poster|photo-frame)$/
const ORGANIZER_PARTICIPANT_PATTERN = /^\/events\/[^/]+\/participants\/[^/]+$/

const ORGANIZER_ROUTES = ['/dashboard', '/events/new'] as const

export const LOGIN_PATH = '/login'

/** Optimistic organizer areas. The layout and every action re-verify for real. */
export function isOrganizerRoute(pathname: string): boolean {
  if (ORGANIZER_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true
  }
  return (
    ORGANIZER_SECTION_PATTERN.test(pathname) ||
    ORGANIZER_DESIGN_PATTERN.test(pathname) ||
    ORGANIZER_PARTICIPANT_PATTERN.test(pathname)
  )
}

const UNSAFE_REDIRECT = /^(?:\/\/|\/\\)|[\s\\]|\/\//

/**
 * Only application-relative destinations are allowed, so a crafted `next`
 * parameter cannot bounce a user to another origin after sign-in.
 */
export function safeRedirectTarget(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  if (!value.startsWith('/')) return fallback
  if (UNSAFE_REDIRECT.test(value)) return fallback
  return value
}
