'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DesignStudio } from '@/features/design/components/DesignStudio'
import { FormField } from '@/components/shared/FormField'
import { PHOTO_FRAME_TEMPLATES } from '@/features/design/lib/templates'
import { validateImageFile } from '@/features/design/schemas/design.schema'
import type { EventBrand, PhotoFrameData } from '@/features/design/types'

type PhotoFrameGeneratorProps = {
  event: EventBrand
}

type PhotoState = {
  url: string
  name: string
  bytes: number
}

/**
 * Photo frame flow: upload, then frame, then preview, generate, download PNG.
 *
 * The chosen photo stays in the browser. It is never uploaded, so there is no
 * storage path to authorize, no object to garbage collect, and nothing to leak
 * if the organizer closes the tab. A frame is a one-off export, not an event
 * asset.
 */
export function PhotoFrameGenerator({ event }: PhotoFrameGeneratorProps) {
  const [photo, setPhoto] = useState<PhotoState | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [caption, setCaption] = useState('')

  // Object URLs leak until revoked, so the previous one is released whenever the
  // photo changes and when the component goes away.
  useEffect(() => {
    return () => {
      if (photo?.url) URL.revokeObjectURL(photo.url)
    }
  }, [photo])

  async function onFileChange(file: File | null) {
    setPhotoError(null)

    if (!file) {
      setPhoto(null)
      return
    }

    const result = validateImageFile(file)
    if (!result.accepted) {
      setPhotoError(result.reason)
      return
    }

    const url = URL.createObjectURL(file)

    // Decode to confirm the file really is an image before it reaches a canvas.
    try {
      const image = new Image()
      image.src = url
      await image.decode()

      const sized = validateImageFile(file, {
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
      if (!sized.accepted) {
        URL.revokeObjectURL(url)
        setPhotoError(sized.reason)
        return
      }
    } catch {
      URL.revokeObjectURL(url)
      setPhotoError('That file could not be read as an image.')
      return
    }

    setPhoto({ url, name: file.name, bytes: file.size })
  }

  const data: PhotoFrameData = useMemo(() => ({ event, caption: caption.trim() }), [event, caption])

  return (
    <DesignStudio<PhotoFrameData>
      kind="photo_frame"
      heading="Photo frames"
      description="Frame a photo with the event branding. The photo stays in your browser and is never uploaded."
      templates={PHOTO_FRAME_TEMPLATES}
      data={data}
      includeQr={false}
      photoUrl={photo?.url ?? null}
      filenameBase={`${event.name} photo frame`}
      blockedReason={photo ? undefined : 'Choose a photo to frame.'}
      fields={
        <>
          <FormField
            label="Photo"
            htmlFor="photo-frame-file"
            hint="PNG, JPEG, or WebP up to 5 MB. It is processed in the browser and never uploaded."
            error={photoError ?? undefined}
          >
            <Input
              id="photo-frame-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-invalid={photoError ? 'true' : undefined}
              onChange={(next) => void onFileChange(next.target.files?.[0] ?? null)}
            />
          </FormField>

          {photo && (
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-muted-foreground min-w-0 truncate text-sm">{photo.name}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPhoto(null)
                  setPhotoError(null)
                }}
              >
                Remove
              </Button>
            </div>
          )}

          <FormField
            label="Caption"
            htmlFor="photo-frame-caption"
            hint="Leave blank to use the organizer and venue."
          >
            <Input
              id="photo-frame-caption"
              value={caption}
              maxLength={120}
              placeholder="Leave blank for the default"
              onChange={(next) => setCaption(next.target.value)}
            />
          </FormField>
        </>
      }
    />
  )
}
