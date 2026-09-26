import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabasePublicConfig } from '@/config/env'
import type { Database } from '@/types/database.types'

export type RefreshedSession = {
  response: NextResponse
  userId: string | null
}

/**
 * Refreshes Supabase auth cookies so Server Components and Server Actions read a
 * current session. This keeps cookies current; it is NOT authorization. Every
 * protected operation re-verifies the principal and the resource.
 */
export async function refreshSession(request: NextRequest): Promise<RefreshedSession> {
  let response = NextResponse.next({ request })

  const { url, publishableKey } = getSupabasePublicConfig()
  const supabase = createServerClient<Database>(url, publishableKey, {
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

  // An unconfigured project must not crash the proxy; the page renders a
  // configuration error rather than the request failing with a 500.
  // `getClaims()` verifies the JWT signature — `claims.sub` is the user id.
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }))

  return { response, userId: data?.claims?.sub ?? null }
}
