'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/shared/FormField'
import {
  speakerSchema,
  type SpeakerInput,
  type SpeakerValues,
} from '@/features/speakers/schemas/speaker.schema'
import { addSpeakerAction } from '@/features/speakers/actions/addSpeaker.action'

/**
 * Compact organizer-only "add a speaker" form.
 *
 * Deliberately has no role control. The speaker marker is the server's decision,
 * so there is nothing here for a curious organizer — or a forged request — to
 * change. The resulting row behaves exactly like a participant's: it gets a QR
 * token from the database and is scanned by the same check-in scanner.
 */

const DEFAULTS: SpeakerInput = { eventId: '', name: '', email: '', organization: '', title: '' }

export function AddSpeakerForm({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SpeakerInput, unknown, SpeakerValues>({
    resolver: zodResolver(speakerSchema),
    defaultValues: { ...DEFAULTS, eventId },
  })

  function onSubmit(values: SpeakerValues) {
    setFormError(null)
    setAdded(null)

    startTransition(async () => {
      const result = await addSpeakerAction(values)

      if (result.ok) {
        reset({ eventId, name: '', email: '', organization: '', title: '' })
        setAdded(`${result.data.name} was added as a speaker. Their pass is ready to view.`)
        return
      }

      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        setError(field as keyof SpeakerInput, { message: messages[0] })
      }
      if (!result.error.fieldErrors) setFormError(result.error.message)
    })
  }

  const fieldError = (field: keyof SpeakerInput): string | undefined => errors[field]?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a speaker</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <input type="hidden" {...register('eventId')} />

          <FormField
            label="Full name"
            htmlFor="speaker-name"
            error={fieldError('name')}
            hint="Speakers are added by the organizer. They cannot register themselves."
          >
            <Input
              id="speaker-name"
              placeholder="Dr. Maria Santos"
              autoComplete="off"
              aria-invalid={errors.name ? 'true' : undefined}
              {...register('name')}
            />
          </FormField>

          <FormField label="Email" htmlFor="speaker-email" error={fieldError('email')}>
            <Input
              id="speaker-email"
              type="email"
              placeholder="speaker@example.com"
              autoComplete="off"
              aria-invalid={errors.email ? 'true' : undefined}
              {...register('email')}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Organization"
              htmlFor="speaker-organization"
              error={fieldError('organization')}
            >
              <Input
                id="speaker-organization"
                placeholder="Assumption College of Davao"
                autoComplete="off"
                aria-invalid={errors.organization ? 'true' : undefined}
                {...register('organization')}
              />
            </FormField>

            <FormField label="Title" htmlFor="speaker-title" error={fieldError('title')}>
              <Input
                id="speaker-title"
                placeholder="Keynote Speaker"
                autoComplete="off"
                aria-invalid={errors.title ? 'true' : undefined}
                {...register('title')}
              />
            </FormField>
          </div>

          {formError && (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
            >
              {formError}
            </p>
          )}

          {added && (
            <p
              role="status"
              className="border-chart-4/40 bg-chart-4/10 rounded-lg border px-3 py-2 text-sm"
            >
              {added}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              {isPending ? 'Adding…' : 'Add speaker'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
