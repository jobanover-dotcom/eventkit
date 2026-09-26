'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { authSchema, type AuthInput } from '@/features/auth/schemas/auth.schema'

type Mode = 'sign-in' | 'sign-up'

type AuthFormProps = {
  nextPath: string
  signUpEnabled: boolean
}

export function AuthForm({ nextPath, signUpEnabled }: AuthFormProps) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthInput>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: AuthInput) {
    setFormError(null)
    const supabase = createClient()

    const result =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword(values)
        : await supabase.auth.signUp({
            email: values.email,
            password: values.password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
            },
          })

    if (result.error) {
      // Supabase messages are safe to show and specific enough to act on.
      setFormError(result.error.message)
      return
    }

    if (mode === 'sign-up' && !result.data.session) {
      setFormError(
        'Account created. Check your email to confirm the address, then sign in. ' +
          'If no email arrives, ask the project owner to turn off email confirmation.'
      )
      setMode('sign-in')
      return
    }

    router.replace(nextPath)
    router.refresh()
  }

  const isSignUp = mode === 'sign-up'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-destructive text-sm">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          aria-invalid={errors.password ? 'true' : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p id="password-error" role="alert" className="text-destructive text-sm">
            {errors.password.message}
          </p>
        )}
        {isSignUp && !errors.password && (
          <p className="text-muted-foreground text-sm">At least 8 characters.</p>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
        {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Log in'}
      </Button>

      {signUpEnabled && (
        <p className="text-muted-foreground text-center text-sm">
          {isSignUp ? 'Already have an account?' : 'No account yet?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isSignUp ? 'sign-in' : 'sign-up')
              setFormError(null)
            }}
            className="text-primary font-medium underline underline-offset-4"
          >
            {isSignUp ? 'Log in' : 'Create one'}
          </button>
        </p>
      )}
    </form>
  )
}
