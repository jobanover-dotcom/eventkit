import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { resetSupabasePublicConfigCache } from '@/config/env'
import { logger } from '@/lib/logger'
import { refreshSession } from './proxy'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))

const VALID_URL = 'https://project.supabase.co'
const VALID_KEY = 'publishable-key'

const getClaims = vi.fn()
const createServerClientMock = vi.mocked(createServerClient)

function stubConfig(configured: boolean) {
  resetSupabasePublicConfigCache()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', configured ? VALID_URL : undefined)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', configured ? VALID_KEY : undefined)
}

function request(pathname = '/dashboard') {
  return new NextRequest(`https://eventkit.test${pathname}`)
}

beforeEach(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => {})
  getClaims.mockReset()
  getClaims.mockResolvedValue({ data: { claims: { sub: 'user-123' } } })
  createServerClientMock.mockReset()
  createServerClientMock.mockReturnValue({
    auth: { getClaims },
  } as unknown as ReturnType<typeof createServerClient>)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  resetSupabasePublicConfigCache()
})

describe('refreshSession when Supabase is unconfigured', () => {
  it('passes the request through instead of throwing outside production', async () => {
    stubConfig(false)
    vi.stubEnv('NODE_ENV', 'development')

    const result = await refreshSession(request())

    expect(result.userId).toBeNull()
    expect(result.response).toBeDefined()
    expect(createServerClientMock).not.toHaveBeenCalled()
  })

  it('reports the missing configuration without leaking values', async () => {
    stubConfig(false)
    vi.stubEnv('NODE_ENV', 'development')

    await refreshSession(request())

    expect(logger.warn).toHaveBeenCalledWith('supabase.config_missing', { scope: 'proxy' })
    const logged = vi.mocked(logger.warn).mock.calls.flat().join(' ')
    expect(logged).not.toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  })

  it('passes the request through for a public route too', async () => {
    stubConfig(false)
    vi.stubEnv('NODE_ENV', 'development')

    const result = await refreshSession(request('/'))

    expect(result.userId).toBeNull()
    expect(result.response).toBeDefined()
  })

  it('throws in production so a bad deployment fails loudly', async () => {
    stubConfig(false)
    vi.stubEnv('NODE_ENV', 'production')

    await expect(refreshSession(request())).rejects.toThrow(/Supabase is not configured/)
    expect(createServerClientMock).not.toHaveBeenCalled()
  })
})

describe('refreshSession when Supabase is configured', () => {
  beforeEach(() => {
    stubConfig(true)
    vi.stubEnv('NODE_ENV', 'production')
  })

  it('builds a client from the public configuration', async () => {
    await refreshSession(request())

    expect(createServerClientMock).toHaveBeenCalledWith(
      VALID_URL,
      VALID_KEY,
      expect.objectContaining({ cookies: expect.any(Object) })
    )
  })

  it('returns the verified subject as the user id', async () => {
    const result = await refreshSession(request())

    expect(result.userId).toBe('user-123')
  })

  it('reports no session when claims are absent', async () => {
    getClaims.mockResolvedValue({ data: null })

    const result = await refreshSession(request())

    expect(result.userId).toBeNull()
  })

  it('does not fail the request when the claims call rejects', async () => {
    getClaims.mockRejectedValue(new Error('network down'))

    const result = await refreshSession(request())

    expect(result.userId).toBeNull()
    expect(result.response).toBeDefined()
  })
})
