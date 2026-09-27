import { describe, expect, it } from 'vitest'
import { isOrganizerRoute, safeRedirectTarget } from './routes'

describe('isOrganizerRoute', () => {
  it.each([
    '/dashboard',
    '/events/new',
    '/events/abc123/dashboard',
    '/events/abc123/participants',
    '/events/abc123/attendance',
    '/events/abc123/check-in',
    '/events/abc123/design',
    '/events/abc123/design/badge',
    '/events/abc123/design/certificate',
    '/events/abc123/design/poster',
    '/events/abc123/design/photo-frame',
    '/events/abc123/design/certificate/templates/new',
    '/events/abc123/design/certificate/templates/6f1c2b40-1111-4222-8333-444455556666',
    '/events/abc123/participants',
    '/events/abc123/participants/6f1c2b40-1111-4222-8333-444455556666',
  ])('guards the organizer route %s', (pathname) => {
    expect(isOrganizerRoute(pathname)).toBe(true)
  })

  /**
   * The Info pages are participant-facing. A participant arriving from a shared
   * link has no session, so these must not be treated as organizer areas or the
   * proxy would redirect them to /login before the page rendered.
   */
  it.each(['/events/abc123/schedule', '/events/abc123/map', '/events/abc123/rules'])(
    'leaves the participant Info route %s open',
    (pathname) => {
      expect(isOrganizerRoute(pathname)).toBe(false)
    }
  )

  /**
   * Certificate verification is public. The person holding a printed
   * certificate is scanning a QR with a phone that has no EventKit session, so
   * treating this as an organizer area would bounce every verifier to /login
   * and the certificate could never be checked.
   */
  it.each([
    '/verify/certificate/abc123',
    '/verify/certificate/0123456789abcdef0123456789abcdef',
    '/verify/certificate',
    '/verify',
  ])('leaves the public certificate verification route %s open', (pathname) => {
    expect(isOrganizerRoute(pathname)).toBe(false)
  })

  it.each([
    '/',
    '/login',
    '/events/abc123',
    '/events/abc123/register',
    '/events/abc123/participant/def456',
    '/api/health',
    // A design section the app does not serve must not become an organizer area
    // just because `design` is guarded one level down.
    '/events/abc123/design/invented',
    '/events/abc123/dashboard/anything',
    '/events/abc123/participants/not-a-uuid/nested',
    // The editor guard is one template id deep and certificate-only, so an
    // unserved path under it must not silently become an organizer area.
    '/events/abc123/design/certificate/templates',
    '/events/abc123/design/certificate/templates/abc123/extra',
    '/events/abc123/design/badge/templates/new',
    '/events/abc123/design/poster/templates/new',
  ])('leaves the public route %s open', (pathname) => {
    expect(isOrganizerRoute(pathname)).toBe(false)
  })
})

describe('safeRedirectTarget', () => {
  it('keeps an application-relative destination', () => {
    expect(safeRedirectTarget('/events/abc/attendance?status=present', '/dashboard')).toBe(
      '/events/abc/attendance?status=present'
    )
  })

  it.each([
    ['https://evil.example/steal', 'absolute URL'],
    ['//evil.example/steal', 'protocol-relative URL'],
    ['/\\evil.example', 'backslash-prefixed URL'],
    ['/dashboard\n/evil', 'newline injection'],
    ['events/abc', 'missing leading slash'],
  ])('rejects %s', (value) => {
    expect(safeRedirectTarget(value, '/dashboard')).toBe('/dashboard')
  })

  it('falls back when the value is absent', () => {
    expect(safeRedirectTarget(null, '/dashboard')).toBe('/dashboard')
    expect(safeRedirectTarget(undefined, '/dashboard')).toBe('/dashboard')
  })
})
