'use client'

import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

/**
 * Label + control + hint/error, the wrapper every form in the app uses.
 *
 * Lives in `shared` rather than in a feature because it is domain-free: it knows
 * about labels and messages, not about badges or certificates.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}) {
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
