'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/shared/FormField'
import { ruleSchema, type RuleInput, type RuleValues } from '@/features/info/schemas/info.schema'
import { addRuleAction } from '@/features/info/actions/addRule.action'

/**
 * Owner-only "add a rule" form. Add-only on purpose, and plain text on purpose:
 * `rules.content` is a text column and is rendered as text.
 */

const DEFAULTS: RuleInput = { eventId: '', title: '', content: '' }

export function AddRuleForm({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<RuleInput, unknown, RuleValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { ...DEFAULTS, eventId },
  })

  function onSubmit(values: RuleValues) {
    setFormError(null)

    startTransition(async () => {
      const result = await addRuleAction(values)

      if (result.ok) {
        reset({ eventId, title: '', content: '' })
        return
      }

      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        setError(field as keyof RuleInput, { message: messages[0] })
      }
      if (!result.error.fieldErrors) setFormError(result.error.message)
    })
  }

  const fieldError = (field: keyof RuleInput): string | undefined => errors[field]?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a rule</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <input type="hidden" {...register('eventId')} />

          <FormField label="Title" htmlFor="rule-title" error={fieldError('title')}>
            <Input
              id="rule-title"
              placeholder="Attendance and punctuality"
              aria-invalid={errors.title ? 'true' : undefined}
              {...register('title')}
            />
          </FormField>

          <FormField
            label="Rule"
            htmlFor="rule-content"
            error={fieldError('content')}
            hint="Plain text. Line breaks are kept as written."
          >
            <Textarea
              id="rule-content"
              rows={4}
              placeholder="Be at the venue by 7:30 AM. Latecomers can still enter."
              aria-invalid={errors.content ? 'true' : undefined}
              {...register('content')}
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
              {isPending ? 'Adding…' : 'Add rule'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
