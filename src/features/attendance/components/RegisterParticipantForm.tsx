'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ParticipantPassCard } from '@/features/attendance/components/ParticipantPassCard'
import { FormField } from '@/components/shared/FormField'
import {
  registrationSchema,
  type RegistrationInput,
  type RegistrationValues,
} from '@/features/attendance/schemas/attendance.schema'
import {
  registerParticipantAction,
  type RegistrationPass,
} from '@/features/attendance/actions/registerParticipant.action'

/**
 * Public registration.
 *
 * On success the server hands back the freshly minted `qr_token` and the pass is
 * shown on the same screen, so the registrant can hold up their phone at the
 * door. Nothing is emailed and there is no participant account: the QR *is* the
 * credential, and it never travels in a URL.
 *
 * The fields match the `register_participant()` signature exactly. There is no
 * role field, because the function has no such argument and offering one would
 * imply control the organizer of a public form does not have.
 */

const DEFAULTS: RegistrationInput = {
  eventId: '',
  name: '',
  studentId: '',
  course: '',
  yearSection: '',
  email: '',
}

export function RegisterParticipantForm({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [pass, setPass] = useState<RegistrationPass | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<RegistrationInput, unknown, RegistrationValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { ...DEFAULTS, eventId },
  })

  function onSubmit(values: RegistrationValues) {
    setFormError(null)

    startTransition(async () => {
      const result = await registerParticipantAction(values)

      if (result.ok) {
        setPass(result.data)
        reset(values)
        return
      }

      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        setError(field as keyof RegistrationInput, { message: messages[0] })
      }
      if (!result.error.fieldErrors) setFormError(result.error.message)
    })
  }

  if (pass) {
    return (
      <div className="flex flex-col gap-5">
        <div
          role="status"
          className="border-chart-4/40 bg-chart-4/10 flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-center"
        >
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">You are registered. Show this code at the door.</p>
        </div>

        <ParticipantPassCard
          event={pass.event}
          participant={{ ...pass.participant, role: 'Student' }}
          qrToken={pass.qrToken}
        />

        <Button variant="outline" onClick={() => setPass(null)} className="mx-auto">
          Register another person
        </Button>
      </div>
    )
  }

  const fieldError = (field: keyof RegistrationInput): string | undefined => errors[field]?.message

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <input type="hidden" {...register('eventId')} />

      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FormField
            label="Full name"
            htmlFor="reg-name"
            error={fieldError('name')}
            hint="As it should appear on your badge."
          >
            <Input
              id="reg-name"
              autoComplete="name"
              placeholder="Maria Dela Cruz"
              aria-invalid={errors.name ? 'true' : undefined}
              {...register('name')}
            />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Student ID"
              htmlFor="reg-student-id"
              error={fieldError('studentId')}
              hint="Optional. Used as your badge code."
            >
              <Input
                id="reg-student-id"
                autoComplete="off"
                placeholder="BSIT-23-0147"
                aria-invalid={errors.studentId ? 'true' : undefined}
                {...register('studentId')}
              />
            </FormField>

            <FormField
              label="Year and section"
              htmlFor="reg-year"
              error={fieldError('yearSection')}
            >
              <Input
                id="reg-year"
                placeholder="3A"
                aria-invalid={errors.yearSection ? 'true' : undefined}
                {...register('yearSection')}
              />
            </FormField>
          </div>

          <FormField label="Course or program" htmlFor="reg-course" error={fieldError('course')}>
            <Input
              id="reg-course"
              placeholder="BS Information Technology"
              aria-invalid={errors.course ? 'true' : undefined}
              {...register('course')}
            />
          </FormField>

          <FormField
            label="Email"
            htmlFor="reg-email"
            error={fieldError('email')}
            hint="Optional. Only the organizer sees it."
          >
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder="you@school.edu"
              aria-invalid={errors.email ? 'true' : undefined}
              {...register('email')}
            />
          </FormField>
        </CardContent>
      </Card>

      {formError && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <PartyPopper aria-hidden="true" />
          )}
          {isPending ? 'Registering…' : 'Register'}
        </Button>
      </div>
    </form>
  )
}
