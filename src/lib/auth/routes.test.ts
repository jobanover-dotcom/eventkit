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
    '/events/abc123/schedule',
    '/events/abc123/rules',
    '/events/abc123/design',
  ])('guards the organizer route %s', (pathname) => {
    expect(isOrganizerRoute(pathname)).toBe(true)
  })

  it.each([
    '/',
    '/login',
    '/events/abc123',
    '/events/abc123/register',
    '/events/abc123/participant/def456',
    '/api/health',
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
