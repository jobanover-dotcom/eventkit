'use client'

import { useRef, useState, useTransition } from 'react'
import { ImageUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/shared/FormField'
import {
  MAP_IMAGE_TYPES,
  MAX_MAP_BYTES,
  type MapImageType,
} from '@/features/info/schemas/info.schema'
import { uploadEventMapAction } from '@/features/info/actions/uploadEventMap.action'

/**
 * Owner-only map upload or replace.
 *
 * The `File` is posted as `FormData` so the image never has to survive a JSON
 * round trip or a base64 inflation. The limits shown here mirror the
 * `event-assets` bucket and are enforced again on the server, where the
 * authorization actually happens.
 *
 * The limits come from the shared schema module, not from the service: the
 * service is `server-only`, and importing it here would break the build rather
 * than merely duplicate a number.
 */
const ACCEPT = MAP_IMAGE_TYPES.join(',')

export function UploadEventMapForm({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setDone(false)

    const input = inputRef.current
    const file = input?.files?.[0]
    if (!file) {
      setError('Choose an image first.')
      return
    }

    // Checked here for a fast message; the server repeats both checks.
    if (!MAP_IMAGE_TYPES.includes(file.type as MapImageType)) {
      setError('Choose a PNG, JPEG, WebP, or GIF image.')
      return
    }
    if (file.size > MAX_MAP_BYTES) {
      setError('The map image must be 5 MB or smaller.')
      return
    }

    const body = new FormData()
    body.set('eventId', eventId)
    body.set('file', file)

    startTransition(async () => {
      const result = await uploadEventMapAction(body)

      if (result.ok) {
        setDone(true)
        if (inputRef.current) inputRef.current.value = ''
        return
      }

      setError(result.error.message)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event map</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField
            label="Map image"
            htmlFor="event-map-file"
            hint="PNG, JPEG, WebP, or GIF up to 5 MB. Participants can see it straight away."
            error={error ?? undefined}
          >
            <input
              ref={inputRef}
              id="event-map-file"
              name="file"
              type="file"
              accept={ACCEPT}
              aria-invalid={error ? 'true' : undefined}
              className="border-border file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium w-full cursor-pointer rounded-lg border bg-transparent text-sm"
            />
          </FormField>

          {done && (
            <p
              role="status"
              className="border-chart-4/40 bg-chart-4/10 rounded-lg border px-3 py-2 text-sm"
            >
              Map uploaded. It is now visible to participants.
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ImageUp aria-hidden="true" />
              )}
              {isPending ? 'Uploading…' : 'Upload map'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
