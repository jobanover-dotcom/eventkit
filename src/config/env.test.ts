import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabasePublicConfig, resetSupabasePublicConfigCache } from './env'

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
}

function loadWith(env: Record<string, string | undefined>) {
  resetSupabasePublicConfigCache()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  return getSupabasePublicConfig
}

afterEach(() => {
  vi.unstubAllEnvs()
  resetSupabasePublicConfigCache()
})

describe('getSupabasePublicConfig', () => {
  it('returns the parsed public configuration', () => {
    const getConfig = loadWith(VALID_ENV)
    expect(getConfig()).toEqual({
      url: 'https://project.supabase.co',
      publishableKey: 'publishable-key',
    })
  })

  it('caches a successful read', () => {
    const getConfig = loadWith(VALID_ENV)
    getConfig()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'changed-after-first-read')
    expect(getConfig().publishableKey).toBe('publishable-key')
  })

  it.each([
    ['a missing URL', { NEXT_PUBLIC_SUPABASE_KEY: '' }],
    ['a missing key', { NEXT_PUBLIC_SUPABASE_URL: '' }],
    ['a URL that is not a URL', { NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' }],
  ])('throws a configuration error for %s', (_label, env) => {
    const getConfig = loadWith(env)
    expect(getConfig).toThrow(/Supabase is not configured/)
  })
})
