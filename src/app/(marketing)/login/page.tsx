import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { EventKitMark } from '@/components/shared/EventKitLogo'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { getCurrentOrganizer } from '@/features/auth/services/getCurrentOrganizer'
import { safeRedirectTarget } from '@/lib/auth/routes'

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Organizer sign in for EventKit.',
}

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const organizer = await getCurrentOrganizer()
  const { next } = await searchParams
  const nextPath = safeRedirectTarget(next, '/dashboard')

  if (organizer) {
    redirect(nextPath)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-16 sm:px-6 sm:py-24">
      <div className="flex flex-col items-center gap-3 text-center">
        <EventKitMark className="size-12 rounded-2xl" />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Log in to manage your events, participants, and check-in.
        </p>
      </div>

      <AuthForm nextPath={nextPath} signUpEnabled />
    </div>
  )
}
