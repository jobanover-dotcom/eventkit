/**
 * Route classification and redirect-safety helpers shared by the proxy and the
 * organizer layout, so navigation and authorization agree on one definition.
 */

const ORGANIZER_SECTION_PATTERN =
  /^\/events\/[^/]+\/(dashboard|participants|attendance|check-in|schedule|rules|design)$/

const ORGANIZER_ROUTES = ['/dashboard', '/events/new'] as const

export const LOGIN_PATH = '/login'

/** Optimistic organizer areas. The layout and every action re-verify for real. */
export function isOrganizerRoute(pathname: string): boolean {
  if (ORGANIZER_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true
  }
  return ORGANIZER_SECTION_PATTERN.test(pathname)
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
