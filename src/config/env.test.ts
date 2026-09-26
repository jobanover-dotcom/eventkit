import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSupabasePublicConfig,
  resetSupabasePublicConfigCache,
  tryGetSupabasePublicConfig,
} from './env'

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
}

const INVALID_ENV_CASES = [
  [
    'both values missing',
    { NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_KEY: undefined },
  ],
  [
    'a missing URL',
    { NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' },
  ],
  [
    'a missing key',
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://p.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    },
  ],
  [
    'an empty key',
    { NEXT_PUBLIC_SUPABASE_URL: 'https://p.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' },
  ],
  [
    'a URL that is not a URL',
    { NEXT_PUBLIC_SUPABASE_URL: 'not-a-url', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' },
  ],
] as const

function loadWith(env: Record<string, string | undefined>) {
  resetSupabasePublicConfigCache()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

afterEach(() => {
  vi.unstubAllEnvs()
  resetSupabasePublicConfigCache()
})

describe('getSupabasePublicConfig', () => {
  it('returns the parsed public configuration', () => {
    loadWith(VALID_ENV)
    expect(getSupabasePublicConfig()).toEqual({
      url: 'https://project.supabase.co',
      publishableKey: 'publishable-key',
    })
  })

  it('caches a successful read', () => {
    loadWith(VALID_ENV)
    getSupabasePublicConfig()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'changed-after-first-read')
    expect(getSupabasePublicConfig().publishableKey).toBe('publishable-key')
  })

  it.each(INVALID_ENV_CASES)('throws a configuration error for %s', (_label, env) => {
    loadWith(env)
    expect(getSupabasePublicConfig).toThrow(/Supabase is not configured/)
  })
})

describe('tryGetSupabasePublicConfig', () => {
  it('returns the parsed public configuration', () => {
    loadWith(VALID_ENV)
    expect(tryGetSupabasePublicConfig()).toEqual({
      url: 'https://project.supabase.co',
      publishableKey: 'publishable-key',
    })
  })

  it('caches a successful read', () => {
    loadWith(VALID_ENV)
    tryGetSupabasePublicConfig()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'changed-after-first-read')
    expect(tryGetSupabasePublicConfig()?.publishableKey).toBe('publishable-key')
  })

  it.each(INVALID_ENV_CASES)('returns null for %s instead of throwing', (_label, env) => {
    loadWith(env)
    expect(tryGetSupabasePublicConfig()).toBeNull()
  })

  it('does not populate the cache when unconfigured', () => {
    loadWith({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    })
    expect(tryGetSupabasePublicConfig()).toBeNull()

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', VALID_ENV.NEXT_PUBLIC_SUPABASE_URL)
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      VALID_ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
    expect(tryGetSupabasePublicConfig()?.url).toBe('https://project.supabase.co')
  })
})
