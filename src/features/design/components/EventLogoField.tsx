'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/FormField'
import { validateImageFile } from '@/features/design/schemas/design.schema'
import {
  clearEventLogoAction,
  setEventLogoAction,
} from '@/features/design/actions/eventLogo.action'

/**
 * The event logo, as a badge needs it.
 *
 * The badge artwork has always had somewhere to put a logo and has always fallen
 * back to a monogram, because nothing ever supplied one. This is the supply: a
 * single control that shows whether there is a logo, takes one, or clears it.
 *
 * The copy stays in participant-facing language on purpose. There is no mention of
 * buckets, paths, or image formats beyond the file picker, and the fallback is
 * described as what it looks like rather than as a missing asset.
 *
 * It sets the **event's** logo, not a badge's — one logo for every design — so the
 * hint says so, and a change here also moves the certificate and poster previews.
 */

type EventLogoFieldProps = {
  eventId: string
  /** The logo already in use, if any. */
  logoUrl: string | null
}

export function EventLogoField({ eventId, logoUrl }: EventLogoFieldProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement | null>(null)

  function onFile(file: File | null) {
    setError(null)
    if (!file) return

    // Checked here for an instant answer; the server re-checks the bytes.
    const local = validateImageFile(file)
    if (!local.accepted) {
      setError(local.reason)
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('eventId', eventId)
      formData.set('file', file, file.name || 'logo.png')

      const result = await setEventLogoAction(formData)
      if (!result.ok) {
        setError(result.error.message)
        return
      }

      toast.success('Logo saved. Your designs use it now.')
      // The logo arrives as a server-rendered prop, so the page has to come back
      // for every design preview to see it.
      router.refresh()
    })
  }

  function onClear() {
    setError(null)

    startTransition(async () => {
      const result = await clearEventLogoAction({ eventId })
      if (!result.ok) {
        setError(result.error.message)
        return
      }

      toast.success('Logo removed.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField
        label="Event logo"
        htmlFor="event-logo-file"
        hint="Shown on badges and every other design for this event. Without one, designs fall back to the event's monogram."
        error={error ?? undefined}
      >
        <Input
          id="event-logo-file"
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-invalid={error ? 'true' : undefined}
          disabled={isPending}
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
      </FormField>

      {logoUrl ? (
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="The event logo as it will appear on a badge"
            className="size-10 shrink-0 rounded-md border bg-white object-contain p-0.5"
          />
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
            In use on every design
          </span>
          <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={onClear}>
            Remove
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No logo yet, so badges will show the event monogram.
        </p>
      )}
    </div>
  )
}
