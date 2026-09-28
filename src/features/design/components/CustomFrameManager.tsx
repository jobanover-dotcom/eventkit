'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  deletePhotoFrameAction,
  renamePhotoFrameAction,
} from '@/features/design/actions/customFrame.action'
import type { PhotoFrameTemplate } from '@/features/design/services/photoFrameTemplateService'

/**
 * Manage the frames an organizer has uploaded.
 *
 * Uploading without any way to take a frame back would strand a bad upload on
 * the picker for good, so removal and renaming sit next to the upload control
 * rather than inside the studio where a template is already chosen.
 *
 * Both act on a whole template: the artwork is never re-saved, so there is
 * nothing to keep in step with the name.
 */

const NAME_MAX = 80

export function CustomFrameManager({
  eventId,
  frames,
}: {
  eventId: string
  frames: readonly PhotoFrameTemplate[]
}) {
  if (frames.length === 0) return null

  return (
    <ul className="grid gap-2">
      {frames.map((frame) => (
        <li key={frame.id}>
          <FrameRow eventId={eventId} frame={frame} />
        </li>
      ))}
    </ul>
  )
}

function FrameRow({ eventId, frame }: { eventId: string; frame: PhotoFrameTemplate }) {
  const router = useRouter()
  const [name, setName] = useState(frame.name)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const renamed = name.trim() !== frame.name

  function onRename() {
    if (!renamed) return
    setError(null)

    startTransition(async () => {
      const result = await renamePhotoFrameAction({ eventId, templateId: frame.id, name })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      toast.success('Frame renamed.')
      router.refresh()
    })
  }

  function onDelete() {
    if (!window.confirm(`Delete "${frame.name}"? Photos already exported stay as they are.`)) {
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await deletePhotoFrameAction({ eventId, templateId: frame.id })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      toast.success('Frame deleted.')
      router.refresh()
    })
  }

  return (
    <div className="grid gap-2 rounded-lg border px-3 py-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          maxLength={NAME_MAX}
          aria-label={`Name for ${frame.name}`}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!renamed || isPending}
          onClick={onRename}
        >
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={onDelete}>
          Delete
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {frame.imageWidth} × {frame.imageHeight} px
      </p>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
