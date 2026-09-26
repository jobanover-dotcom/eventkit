'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LOGIN_PATH } from '@/lib/auth/routes'
import { logger } from '@/lib/logger'

/**
 * Signs the organizer out and clears the session cookies. Server-side so the
 * refresh token never has to round-trip through client JavaScript.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    // The cookie is cleared regardless; surfacing a failure here would leave the
    // organizer stuck on a protected page with no way forward.
    logger.warn('sign_out_failed', { detail: error.message })
  }

  redirect(LOGIN_PATH)
}
