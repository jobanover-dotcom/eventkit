'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DesignStudio } from '@/features/design/components/DesignStudio'
import { FormField } from '@/components/shared/FormField'
import { PHOTO_FRAME_TEMPLATES } from '@/features/design/lib/templates'
import { loadPhotoFrameTemplates } from '@/features/design/lib/templates/loadPhotoFrameTemplate'
import { ACCEPTED_PHOTO_TYPES, usePhotoPicker } from '@/features/design/components/usePhotoPicker'
import type { PhotoFrameTemplate } from '@/features/design/services/photoFrameTemplateService'
import type { DesignTemplate } from '@/features/design/lib/types'
import type { EventBrand, PhotoFrameData } from '@/features/design/types'

type PhotoFrameGeneratorProps = {
  event: EventBrand
  customFrames?: readonly PhotoFrameTemplate[]
}

/**
 * Photo frame flow: upload, then frame, then preview, generate, download PNG.
 *
 * The chosen photo stays in the browser. It is never uploaded, so there is no
 * storage path to authorize, no object to garbage collect, and nothing to leak
 * if the organizer closes the tab. A frame is a one-off export, not an event
 * asset.
 */
export function PhotoFrameGenerator({ event, customFrames = [] }: PhotoFrameGeneratorProps) {
  const { photo, photoError, choose, clear } = usePhotoPicker()
  const [caption, setCaption] = useState('')

  // Custom frames are decoded from their signed artwork URLs, which is
  // asynchronous, so the built-ins are usable immediately and the organizer's own
  // join the picker a tick later.
  //
  // The result is keyed on the records it came from, so a re-save returns the
  // fresh list while an unrelated re-render keeps the already-decoded one. The
  // key is derived rather than stored, so a stale list is never shown.
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
    // `customKey` summarises `customFrames`; depending on the array itself would
    // re-decode every artwork on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKey])

  // The organizer's own frames are appended to the built-in catalogue, so the
  // picker, the preview, and the exporter treat them identically. The key
  // comparison lives inside the memo so a re-render cannot rebuild the array.
  const templates = useMemo(
    () => [...PHOTO_FRAME_TEMPLATES, ...(loaded.key === customKey ? loaded.templates : [])],
    [loaded, customKey]
  )

  const data: PhotoFrameData = useMemo(() => ({ event, caption: caption.trim() }), [event, caption])

  return (
    <DesignStudio<PhotoFrameData>
      kind="photo_frame"
      heading="Photo frames"
      description="Frame a photo with the event branding. The photo stays in your browser and is never uploaded."
      templates={templates}
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
              accept={ACCEPTED_PHOTO_TYPES}
              aria-invalid={photoError ? 'true' : undefined}
              onChange={(next) => void choose(next.target.files?.[0] ?? null)}
            />
          </FormField>

          {photo && (
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-muted-foreground min-w-0 truncate text-sm">{photo.name}</span>
              <Button type="button" size="sm" variant="ghost" onClick={clear}>
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
