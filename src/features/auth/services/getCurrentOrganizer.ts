import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'

export type Organizer = {
  id: string
  email: string
  fullName: string | null
}

/**
 * Reads the authenticated organizer from the session cookie.
 *
 * `getUser()` revalidates the token with the Supabase Auth server. The proxy
 * also refreshes cookies, but nothing here trusts its optimistic result.
 * Returns null when there is no valid session.
 */
export async function getCurrentOrganizer(): Promise<Organizer | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  return {
    id: user.id,
    email: user.email ?? '',
    fullName:
      typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
  }
}

/** Authorization boundary for organizer-only operations. */
export async function requireOrganizer(): Promise<Organizer> {
  const organizer = await getCurrentOrganizer()
  if (!organizer) {
    throw new AppError(ACTION_ERROR_CODES.UNAUTHENTICATED, 'Please log in to continue.')
  }
  return organizer
}
