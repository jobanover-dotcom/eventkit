import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabasePublicConfig } from '@/config/env'
import type { Database } from '@/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()
  const { url, publishableKey } = getSupabasePublicConfig()

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        // A Server Component cannot set cookies. The proxy owns refresh writes,
        // so a failure here is expected and must not crash the render.
        try {
          for (const { name, value, options } of values) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Intentionally ignored — see comment above.
        }
      },
    },
  })
}
