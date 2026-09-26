'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  eventSchema,
  DEFAULT_THEME,
  type EventInput,
  type EventValues,
} from '@/features/events/schemas/event.schema'
import { createEventAction } from '@/features/events/actions/createEvent.action'

const THEME_PRESETS = ['#6d28d9', '#0e7490', '#be123c', '#15803d', '#b45309'] as const

const DEFAULTS: EventInput = {
  name: '',
  description: '',
  date: '',
  startTime: '08:00',
  endTime: '17:00',
  venue: '',
  organizerName: '',
  theme: DEFAULT_THEME,
  registrationOpen: true,
}

export function EventForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    control,
    setValue,
    formState: { errors },
  } = useForm<EventInput, unknown, EventValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: DEFAULTS,
  })

  // useWatch rather than watch(): the returned watch() function cannot be
  // memoized safely, which makes the React Compiler skip this component.
  const theme = useWatch({ control, name: 'theme' })
  const registrationOpen = useWatch({ control, name: 'registrationOpen' })

  function onSubmit(values: EventValues) {
    setFormError(null)
    startTransition(async () => {
      const result = await createEventAction(values)

      if (result.ok) {
        router.push(`/events/${result.data.eventId}/dashboard`)
        router.refresh()
        return
      }

      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        setError(field as keyof EventInput, { message: messages[0] })
      }
      if (!result.error.fieldErrors) setFormError(result.error.message)
    })
  }

  const fieldError = (field: keyof EventInput): string | undefined => errors[field]?.message

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field label="Event name" htmlFor="name" error={fieldError('name')}>
            <Input
              id="name"
              placeholder="IT FEST 2026"
              aria-invalid={errors.name ? 'true' : undefined}
              {...register('name')}
            />
          </Field>

          <Field label="Description" htmlFor="description" error={fieldError('description')}>
            <Textarea
              id="description"
              rows={3}
              placeholder="A one-day festival for IT students."
              aria-invalid={errors.description ? 'true' : undefined}
              {...register('description')}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date" htmlFor="date" error={fieldError('date')}>
              <Input
                id="date"
                type="date"
                aria-invalid={errors.date ? 'true' : undefined}
                {...register('date')}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Start" htmlFor="startTime" error={fieldError('startTime')}>
                <Input
                  id="startTime"
                  type="time"
                  aria-invalid={errors.startTime ? 'true' : undefined}
                  {...register('startTime')}
                />
              </Field>
              <Field label="End" htmlFor="endTime" error={fieldError('endTime')}>
                <Input
                  id="endTime"
                  type="time"
                  aria-invalid={errors.endTime ? 'true' : undefined}
                  {...register('endTime')}
                />
              </Field>
            </div>
          </div>

          <Field label="Venue" htmlFor="venue" error={fieldError('venue')}>
            <Input
              id="venue"
              placeholder="Assumption College"
              aria-invalid={errors.venue ? 'true' : undefined}
              {...register('venue')}
            />
          </Field>

          <Field
            label="Organizer"
            htmlFor="organizerName"
            hint="Department or person, printed on certificates."
            error={fieldError('organizerName')}
          >
            <Input
              id="organizerName"
              placeholder="BSIT Department"
              aria-invalid={errors.organizerName ? 'true' : undefined}
              {...register('organizerName')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field
            label="Theme colour"
            htmlFor="theme"
            hint="Used inside generated badges, certificates, and posters."
            error={fieldError('theme')}
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="theme"
                type="color"
                aria-label="Theme colour"
                className="border-border h-10 w-14 cursor-pointer rounded-lg border bg-transparent"
                value={theme}
                onChange={(event) =>
                  setValue('theme', event.target.value, { shouldValidate: true })
                }
              />
              <Input
                className="w-32 font-mono"
                value={theme}
                onChange={(event) =>
                  setValue('theme', event.target.value, { shouldValidate: true })
                }
                aria-label="Theme colour hex value"
              />
              <div className="flex gap-2">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setValue('theme', preset, { shouldValidate: true })}
                    aria-label={`Use theme ${preset}`}
                    aria-pressed={theme === preset}
                    className="border-border size-8 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: preset }}
                  />
                ))}
              </div>
            </div>
          </Field>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="accent-primary mt-1 size-4"
              checked={registrationOpen}
              onChange={(event) => setValue('registrationOpen', event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Registration is open</span>
              <span className="text-muted-foreground block text-sm">
                While this is on, anyone with the event link can register. Turning it off also makes
                the event page private.
              </span>
            </span>
          </label>
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
          {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isPending ? 'Creating…' : 'Create event'}
        </Button>
      </div>
    </form>
  )
}

type FieldProps = {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: React.ReactNode
}

function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-sm">{hint}</p>}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
