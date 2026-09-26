import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { tryGetSupabasePublicConfig } from '@/config/env'
import { AppError, ACTION_ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database.types'

export type RefreshedSession = {
  response: NextResponse
  userId: string | null
}

const MISSING_CONFIG_MESSAGE =
  'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'

/**
 * Refreshes Supabase auth cookies so Server Components and Server Actions read a
 * current session. This keeps cookies current; it is NOT authorization. Every
 * protected operation re-verifies the principal and the resource.
 *
 * This runs on every matched request, so an unconfigured project must not throw
 * here or the whole site returns 500. Outside production it degrades to "no
 * session" and lets the page render its own configuration error. In production a
 * missing variable is a deployment fault and is rethrown to fail loudly rather
 * than silently presenting every visitor as logged out.
 */
export async function refreshSession(request: NextRequest): Promise<RefreshedSession> {
  let response = NextResponse.next({ request })

  const config = tryGetSupabasePublicConfig()

  if (!config) {
    logger.warn('supabase.config_missing', { scope: 'proxy' })

    if (process.env.NODE_ENV === 'production') {
      throw new AppError(ACTION_ERROR_CODES.CONFIG_MISSING, MISSING_CONFIG_MESSAGE)
    }

    return { response, userId: null }
  }

  const supabase = createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of values) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // A network or auth failure here must not fail the request either; the
  // request simply carries no refreshed session. `getClaims()` verifies the JWT
  // signature — `claims.sub` is the user id.
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }))

  return { response, userId: data?.claims?.sub ?? null }
}
