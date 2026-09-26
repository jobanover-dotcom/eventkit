import { z } from 'zod'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'

/**
 * Browser-visible Supabase configuration. Every value here is bundled into
 * client code and is public by design — never put a secret in this file.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

export type PublicSupabaseConfig = {
  url: string
  publishableKey: string
}

let cached: PublicSupabaseConfig | undefined

const MISSING_CONFIG_MESSAGE =
  'Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'

/**
 * Parsed on first use rather than at import time so a missing value produces an
 * actionable error where it matters instead of an opaque build failure.
 *
 * Throws when unconfigured. Use this anywhere a Supabase client is genuinely
 * required, so the failure names the missing variable instead of surfacing as
 * an unrelated downstream error.
 */
export function getSupabasePublicConfig(): PublicSupabaseConfig {
  const read = readPublicEnv()
  if (!read.ok) {
    throw new AppError(ACTION_ERROR_CODES.CONFIG_MISSING, MISSING_CONFIG_MESSAGE, {
      cause: read.error,
    })
  }
  return read.config
}

/**
 * Returns the configuration, or `null` when it is absent or malformed. Use this
 * only where a Supabase client is optional — the Next Proxy, which runs on every
 * request and must not turn an unconfigured project into a 500.
 *
 * Callers must decide what an unconfigured state means; a silent `null` here is
 * a degraded mode, not a success.
 */
export function tryGetSupabasePublicConfig(): PublicSupabaseConfig | null {
  const read = readPublicEnv()
  return read.ok ? read.config : null
}

type PublicEnvRead = { ok: true; config: PublicSupabaseConfig } | { ok: false; error: z.ZodError }

function readPublicEnv(): PublicEnvRead {
  if (cached) return { ok: true, config: cached }

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })

  if (!parsed.success) return { ok: false, error: parsed.error }

  cached = {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }
  return { ok: true, config: cached }
}

export function resetSupabasePublicConfigCache(): void {
  cached = undefined
}
