import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeRedirectTarget } from '@/lib/auth/routes'
import { logger } from '@/lib/logger'

/**
 * PKCE callback. Exchanges the one-time `code` for a session cookie and then
 * sends the organizer on to a validated, application-relative path.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const nextPath = safeRedirectTarget(searchParams.get('next'), '/dashboard')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    logger.warn('auth_callback_failed', { detail: error.message })
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  return NextResponse.redirect(`${origin}${nextPath}`)
}
