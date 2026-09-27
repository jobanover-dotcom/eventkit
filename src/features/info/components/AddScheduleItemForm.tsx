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
  scheduleItemSchema,
  type ScheduleItemInput,
  type ScheduleItemValues,
} from '@/features/info/schemas/info.schema'
import { addScheduleItemAction } from '@/features/info/actions/addScheduleItem.action'

/**
 * Owner-only "add a programme item" form.
 *
 * Deliberately add-only: no edit, no delete, no reordering. The point is that
 * an organizer can fill the page in a minute before an event, not that
 * EventKit is a CMS. The Server Action authorizes ownership independently —
 * this component is only hidden from participants as a courtesy.
 */

const DEFAULTS: ScheduleItemInput = {
  eventId: '',
  title: '',
  startTime: '',
  endTime: '',
  location: '',
}

export function AddScheduleItemForm({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ScheduleItemInput, unknown, ScheduleItemValues>({
    resolver: zodResolver(scheduleItemSchema),
    defaultValues: { ...DEFAULTS, eventId },
  })

  function onSubmit(values: ScheduleItemValues) {
    setFormError(null)

    startTransition(async () => {
      const result = await addScheduleItemAction(values)

      if (result.ok) {
        reset({ eventId, title: '', startTime: '', endTime: '', location: '' })
        return
      }

      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        setError(field as keyof ScheduleItemInput, { message: messages[0] })
      }
      if (!result.error.fieldErrors) setFormError(result.error.message)
    })
  }

  const fieldError = (field: keyof ScheduleItemInput): string | undefined => errors[field]?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a programme item</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <input type="hidden" {...register('eventId')} />

          <FormField label="Activity" htmlFor="schedule-title" error={fieldError('title')}>
            <Input
              id="schedule-title"
              placeholder="Opening ceremony"
              aria-invalid={errors.title ? 'true' : undefined}
              {...register('title')}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Starts" htmlFor="schedule-start" error={fieldError('startTime')}>
              <Input
                id="schedule-start"
                type="time"
                aria-invalid={errors.startTime ? 'true' : undefined}
                {...register('startTime')}
              />
            </FormField>

            <FormField label="Ends" htmlFor="schedule-end" error={fieldError('endTime')}>
              <Input
                id="schedule-end"
                type="time"
                aria-invalid={errors.endTime ? 'true' : undefined}
                {...register('endTime')}
              />
            </FormField>
          </div>

          <FormField
            label="Location"
            htmlFor="schedule-location"
            error={fieldError('location')}
            hint="Optional. Where in the venue it happens."
          >
            <Input
              id="schedule-location"
              placeholder="Main hall"
              aria-invalid={errors.location ? 'true' : undefined}
              {...register('location')}
            />
          </FormField>

          {formError && (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
            >
              {formError}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              {isPending ? 'Adding…' : 'Add item'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
