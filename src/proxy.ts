import { NextResponse, type NextRequest } from 'next/server'
import { refreshSession } from '@/lib/supabase/proxy'
import { isOrganizerRoute, LOGIN_PATH, safeRedirectTarget } from '@/lib/auth/routes'

/**
 * Session refresh plus an optimistic navigation guard for organizer areas.
 * Security is enforced again in the organizer layout, in every Server Action,
 * and by Row Level Security — never here alone.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl
  const { response, userId } = await refreshSession(request)

  if (!isOrganizerRoute(pathname) || userId) {
    return response
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = LOGIN_PATH
  loginUrl.search = ''
  loginUrl.searchParams.set('next', safeRedirectTarget(`${pathname}${search}`, '/dashboard'))

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}

export default proxy
