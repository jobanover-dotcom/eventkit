'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { validateImageFile } from '@/features/design/schemas/design.schema'
import { PHOTO_PLACEHOLDER_HEX } from '@/features/design/lib/canvas/colorKey'
import { detectPhotoFrameMask } from '@/features/design/lib/templates/customPhotoFrame'
import { createPhotoFrameAction } from '@/features/design/actions/customFrame.action'

/**
 * Uploads a custom photo frame.
 *
 * The organizer supplies finished artwork with one area filled `#22ff00`, and
 * that area is where the photo goes. The check for it happens here, in the
 * browser, purely so the organizer is told immediately rather than after a round
 * trip — the server cannot read pixels, and nothing about the answer is trusted
 * later. The saved configuration carries no detection result, and the mask is
 * derived from the stored artwork again when the frame is loaded to render.
 *
 * The file must be a PNG because the artwork is stored byte for byte in a
 * PNG-only bucket. That is a different rule from the attendee's own photo, which
 * is browser-local and may be a JPEG or WebP.
 */

const NAME_MAX = 80

type Chosen = {
  file: File
  width: number
  height: number
  previewUrl: string
  /** Union box of the detected key colour, or null when none was found. */
  photoArea: { x: number; y: number; width: number; height: number } | null
}

export function CustomFrameUpload({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const objectUrlRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // The preview object URL is revoked on close rather than on every render, so
  // the chosen frame survives a re-render but does not outlive the dialog.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  function reset() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setChosen(null)
    setName('')
    setError(null)
  }

  /** Draws the frame with the detected photo area called out. */
  function drawPreview(next: Chosen) {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    canvas.width = next.width
    canvas.height = next.height

    const image = new window.Image()
    image.src = next.previewUrl
    image.decode().then(
      () => {
        context.drawImage(image, 0, 0, next.width, next.height)
        if (!next.photoArea) return

        // Outlined rather than filled, so the artwork underneath stays readable
        // and the organizer can see the area their photo will fill.
        const { x, y, width, height } = next.photoArea
        context.save()
        context.strokeStyle = '#ffffff'
        context.lineWidth = Math.max(2, Math.round(Math.min(next.width, next.height) / 200))
        context.setLineDash([context.lineWidth * 4, context.lineWidth * 3])
        context.strokeRect(x, y, width, height)
        context.restore()
      },
      () => {
        // A decode failure here is already reported by `chooseFile`; there is
        // nothing further to say in the preview.
      }
    )
  }

  async function chooseFile(file: File) {
    setError(null)
    setChosen(null)

    // The bucket takes PNG only, so a JPEG is rejected here rather than after
    // the upload. `validateImageFile` covers size, emptiness and dimensions.
    if (file.type !== 'image/png') {
      setError('Upload a PNG file. Export your design as a PNG and try again.')
      return
    }

    const url = URL.createObjectURL(file)
    const image = new window.Image()
    image.src = url

    try {
      await image.decode()
    } catch {
      URL.revokeObjectURL(url)
      setError('That file could not be read as an image. Export your design as a PNG.')
      return
    }

    const width = image.naturalWidth
    const height = image.naturalHeight
    const basic = validateImageFile(file, { width, height })
    if (!basic.accepted) {
      URL.revokeObjectURL(url)
      setError(basic.reason ?? 'That image cannot be used.')
      return
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = url

    const next: Chosen = {
      file,
      width,
      height,
      previewUrl: url,
      photoArea: detectPhotoFrameMask(image)?.bounds ?? null,
    }
    setChosen(next)
    if (!next.photoArea) {
      setError(
        `No ${PHOTO_PLACEHOLDER_HEX} photo area found. Fill the area the photo should cover with ${PHOTO_PLACEHOLDER_HEX} in your design tool and export again.`
      )
    }
    drawPreview(next)
  }

  function onSubmit() {
    if (!chosen) {
      setError('Choose a PNG frame first.')
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('eventId', eventId)
      formData.set('name', name.trim())
      formData.set('file', chosen.file, chosen.file.name || 'photo-frame.png')
      formData.set('imageWidth', String(chosen.width))
      formData.set('imageHeight', String(chosen.height))

      const result = await createPhotoFrameAction(formData)
      if (!result.ok) {
        setError(result.error.message)
        return
      }

      toast.success(`"${result.data.name}" added.`)
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  const canSave = Boolean(chosen?.photoArea && name.trim()) && !isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Add custom frame</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a custom photo frame</DialogTitle>
          <DialogDescription>
            Upload your frame artwork as a PNG. Fill the area the photo should cover with{' '}
            {PHOTO_PLACEHOLDER_HEX} — its shape can be anything, and the photo takes that shape.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="frame-name">Frame name</Label>
            <Input
              id="frame-name"
              value={name}
              maxLength={NAME_MAX}
              placeholder="Graduation arch"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="frame-file">Frame artwork (PNG)</Label>
            <Input
              id="frame-file"
              type="file"
              accept="image/png,.png"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void chooseFile(file)
              }}
            />
          </div>

          {chosen ? (
            <figure className="grid gap-1.5">
              <canvas
                ref={canvasRef}
                className="max-h-64 w-full rounded-lg border bg-white object-contain"
              />
              <figcaption className="text-muted-foreground text-xs">
                {chosen.width} × {chosen.height} px
                {chosen.photoArea
                  ? ' — photo area outlined'
                  : ` — no ${PHOTO_PLACEHOLDER_HEX} area found`}
              </figcaption>
            </figure>
          ) : null}

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!canSave}>
            {isPending ? 'Uploading…' : 'Add frame'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
