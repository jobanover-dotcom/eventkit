'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { DesignStudio } from '@/features/design/components/DesignStudio'
import { FormField } from '@/components/shared/FormField'
import { PHOTO_FRAME_TEMPLATES } from '@/features/design/lib/templates'
import {
  loadPhotoFrameTemplates,
  type LoadablePhotoFrame,
} from '@/features/design/lib/templates/loadPhotoFrameTemplate'
import { ACCEPTED_PHOTO_TYPES, usePhotoPicker } from '@/features/design/components/usePhotoPicker'
import type { DesignTemplate } from '@/features/design/lib/types'
import type { EventBrand, PhotoFrameData } from '@/features/design/types'

type PublicPhotoFrameGeneratorProps = {
  event: EventBrand
  /**
   * The organizer's own frames, read through the public path. Absent or empty
   * when the organizer has not uploaded any, which is not an error: the built-in
   * frames are the ones everybody gets.
   */
  customFrames?: readonly LoadablePhotoFrame[]
}

/**
 * The public photo-frame experience: a visitor picks a frame, uploads a photo,
 * and downloads the result. No account, no registration, no personal details.
 *
 * Deliberately a thinner shell than the organizer's generator rather than a copy
 * of it. `DesignStudio` is used exactly as the studio uses it, the same
 * `usePhotoPicker` validates the upload, and the organizer's own frames arrive
 * as records that go through the same `loadPhotoFrameTemplates` — so a custom
 * frame is masked and composited by the identical code, and cannot drift from
 * what the organizer sees.
 *
 * The caption field is intentionally absent. A visitor arriving to frame a photo
 * wants a frame, not a text editor, and the frames already fall back to the
 * event's organizer and venue.
 */
export function PublicPhotoFrameGenerator({
  event,
  customFrames = [],
}: PublicPhotoFrameGeneratorProps) {
  const { photo, photoError, choose, clear } = usePhotoPicker()

  // Same load-once-then-key approach the studio uses: the built-ins are usable
  // immediately and the organizer's frames join a tick later, keyed on the
  // records they came from so a re-render cannot re-decode the artwork.
  const customKey = customFrames.map((t) => `${t.id}:${t.updatedAt}`).join(',')
  const [loaded, setLoaded] = useState<{
    key: string
    templates: DesignTemplate<PhotoFrameData>[]
  }>({ key: '', templates: [] })

  useEffect(() => {
    if (customFrames.length === 0) return
    let cancelled = false
    void loadPhotoFrameTemplates(customFrames).then((templates) => {
      if (!cancelled) setLoaded({ key: customKey, templates })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKey])

  const templates = useMemo(
    () => [...PHOTO_FRAME_TEMPLATES, ...(loaded.key === customKey ? loaded.templates : [])],
    [loaded, customKey]
  )

  // A frame whose artwork would not decode — an expired signed link, say — is
  // dropped rather than taking the page down. Saying so beats silently offering
  // fewer frames with no explanation.
  const dropped = customFrames.length > 0 ? customFrames.length - loaded.templates.length : 0

  const data: PhotoFrameData = useMemo(() => ({ event, caption: '' }), [event])

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          There are no photo frames available for this event right now. Please check back later.
        </CardContent>
      </Card>
    )
  }

  return (
    <DesignStudio<PhotoFrameData>
      kind="photo_frame"
      heading="Make your photo frame"
      description="Upload a photo, pick a frame, and download it. Nothing you upload is saved, and you do not need to register."
      templates={templates}
      data={data}
      includeQr={false}
      photoUrl={photo?.url ?? null}
      filenameBase={`${event.name} photo frame`}
      blockedReason={photo ? undefined : 'Upload your photo to get started.'}
      fields={
        <>
          <FormField
            label="Your photo"
            htmlFor="public-photo-frame-file"
            hint="PNG, JPEG, or WebP up to 5 MB. It stays on your device and is never uploaded."
            error={photoError ?? undefined}
          >
            <Input
              id="public-photo-frame-file"
              type="file"
              accept={ACCEPTED_PHOTO_TYPES}
              aria-invalid={photoError ? 'true' : undefined}
              onChange={(next) => void choose(next.target.files?.[0] ?? null)}
            />
          </FormField>

          {photo && (
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-muted-foreground min-w-0 truncate text-sm">{photo.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-sm underline"
                onClick={clear}
              >
                Remove
              </button>
            </div>
          )}

          {dropped > 0 ? (
            <p className="text-muted-foreground text-xs">
              {dropped === 1
                ? 'One event frame could not be loaded and has been left out.'
                : `${dropped} event frames could not be loaded and have been left out.`}
            </p>
          ) : null}
        </>
      }
    />
  )
}
