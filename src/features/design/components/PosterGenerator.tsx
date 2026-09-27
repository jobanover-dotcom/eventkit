'use client'

import { useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { DesignStudio } from '@/features/design/components/DesignStudio'
import { FormField } from '@/components/shared/FormField'
import { POSTER_TEMPLATES } from '@/features/design/lib/templates'
import {
  POSTER_PRESETS,
  POSTER_CONTENT_TYPES,
  type EventBrand,
  type PosterContentType,
  type PosterData,
} from '@/features/design/types'

type PosterGeneratorProps = {
  event: EventBrand
}

const MAX_MESSAGE_LENGTH = 280

/**
 * Poster flow: content type, then message, then template.
 *
 * The content type supplies a default heading and message, so switching from
 * Announcement to Reminder to Thank You produces something sensible without the
 * organizer writing three separate blurbs. Editing the message after switching
 * keeps their text.
 */
export function PosterGenerator({ event }: PosterGeneratorProps) {
  const [contentType, setContentType] = useState<PosterContentType>('Announcement')
  const [message, setMessage] = useState(POSTER_PRESETS.Announcement.defaultMessage)
  const [showQr, setShowQr] = useState(true)

  // Switching content type adopts that type's default wording in the handler
  // rather than in an effect, so there is no extra render and no chance of the
  // message and the type disagreeing for a frame.
  function onContentTypeChange(next: PosterContentType) {
    setContentType(next)
    setMessage(POSTER_PRESETS[next].defaultMessage)
  }

  const data: PosterData = useMemo(
    () => ({ event, contentType, message, showQr }),
    [event, contentType, message, showQr]
  )

  const isTruncated = message.length > MAX_MESSAGE_LENGTH

  return (
    <DesignStudio<PosterData>
      kind="poster"
      heading="Posters"
      description="A 4:5 poster for printing or posting. Date, time, venue, and organizer are filled in from the event."
      templates={POSTER_TEMPLATES}
      data={data}
      includeQr={showQr}
      filenameBase={`${event.name} poster`}
      blockedReason={isTruncated ? 'Shorten the message to 280 characters or fewer.' : undefined}
      fields={
        <>
          <FormField
            label="Content type"
            htmlFor="poster-content-type"
            hint="Sets the heading and the default message."
          >
            <Select
              value={contentType}
              onValueChange={(next) => onContentTypeChange(next as PosterContentType)}
            >
              <SelectTrigger id="poster-content-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSTER_CONTENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Message"
            htmlFor="poster-message"
            hint={`${message.length} of ${MAX_MESSAGE_LENGTH} characters. The fitting engine shrinks or trims anything longer than the layout allows.`}
            error={isTruncated ? 'Keep the message under 280 characters.' : undefined}
          >
            <Input
              id="poster-message"
              value={message}
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(next) => setMessage(next.target.value)}
              aria-invalid={isTruncated ? 'true' : undefined}
            />
          </FormField>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="accent-primary mt-1 size-4"
              checked={showQr}
              onChange={(next) => setShowQr(next.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Include the check-in QR</span>
              <span className="text-muted-foreground block text-sm">
                Useful on a poster for the door. Uses the event&rsquo;s participant token, so only
                for events where attendees scan in.
              </span>
            </span>
          </label>
        </>
      }
    />
  )
}
