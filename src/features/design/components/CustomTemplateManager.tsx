'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { Loader2, TriangleAlert, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  detectPlaceholdersFromImage,
  PLACEHOLDER_HEX,
} from '@/features/design/lib/customTemplate/placeholder'
import {
  fieldsOfType,
  templateFieldsFor,
  type TemplateField,
} from '@/features/design/lib/customTemplate/fields'
import { uploadTemplateAction } from '@/features/design/actions/template.action'
import {
  PLACEHOLDER_INSTRUCTIONS,
  MAX_TEMPLATE_BYTES,
} from '@/features/design/schemas/customTemplate.schema'
import type { DesignKind } from '@/features/design/types'

/**
 * Upload a PNG template, detect its `#00B140` rectangles, and map each one.
 *
 * Detection runs here in the browser rather than on the server: the artwork is
 * already a canvas to render it, and the rectangles are pixel geometry of a
 * file the organizer is looking at. The server is handed the result as
 * coordinates and range-checks them, so a forged mapping cannot reference a
 * region outside the image.
 *
 * The preview is annotated with the detected rectangles so the organizer can see
 * that the mapping matches what they drew before they rely on it.
 */

const NONE = '__none__'

type DraftPlaceholder = {
  x: number
  y: number
  width: number
  height: number
  field: TemplateField | null
}

export function CustomTemplateManager({
  eventId,
  kind,
  onSaved,
}: {
  eventId: string
  kind: DesignKind
  onSaved?: () => void
}) {
  const [name, setName] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [placeholders, setPlaceholders] = useState<DraftPlaceholder[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<File | null>(null)

  const onPick = useCallback(async (file: File | null) => {
    setError(null)
    setWarnings([])
    if (!file) return

    if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.png')) {
      setError('Choose a PNG file. Export your design as a PNG from Canva or Photoshop.')
      return
    }

    fileRef.current = file
    const url = URL.createObjectURL(file)
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return url
    })

    const image = new window.Image()
    image.src = url

    try {
      await image.decode()
    } catch {
      setError('That file could not be read as an image.')
      return
    }

    setSize({ width: image.naturalWidth, height: image.naturalHeight })

    try {
      const result = await detectPlaceholdersFromImage(image)
      setWarnings(result.warnings)
      setPlaceholders(result.placeholders.map((rect) => ({ ...rect, field: null })))

      if (result.placeholders.length === 0) {
        setError(
          `No ${PLACEHOLDER_HEX} rectangles were found. Draw a rectangle, fill it ` +
            `with exactly ${PLACEHOLDER_HEX}, and upload the PNG again.`
        )
      }
    } catch {
      setError('This browser could not read the placeholder positions.')
    }
  }, [])

  function assign(index: number, value: string) {
    setPlaceholders((current) =>
      current.map((entry, position) =>
        position === index
          ? { ...entry, field: value === NONE ? null : (value as TemplateField) }
          : entry
      )
    )
  }

  function onSubmit() {
    const file = fileRef.current
    if (!file) {
      setError('Choose a PNG file first.')
      return
    }

    setError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('eventId', eventId)
      formData.set('kind', kind)
      formData.set('name', name)
      formData.set('file', file)
      formData.set('imageWidth', String(size?.width ?? 0))
      formData.set('imageHeight', String(size?.height ?? 0))
      formData.set('placeholders', JSON.stringify(placeholders))

      const result = await uploadTemplateAction(formData)

      if (result.ok) {
        setPlaceholders([])
        setName('')
        fileRef.current = null
        if (inputRef.current) inputRef.current.value = ''
        onSaved?.()
        return
      }

      setError(result.error.fieldErrors?.file?.[0] ?? result.error.message)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Use a custom template</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5 text-sm">
          {PLACEHOLDER_INSTRUCTIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>

        <div className="flex flex-col gap-2">
          <Label htmlFor="template-file">PNG template</Label>
          <Input
            id="template-file"
            type="file"
            accept="image/png,.png"
            ref={inputRef}
            onChange={(event) => void onPick(event.target.files?.[0] ?? null)}
          />
          <p className="text-muted-foreground text-sm">
            Up to {Math.round(MAX_TEMPLATE_BYTES / (1024 * 1024))} MB. PSD and PDF are not
            supported.
          </p>
        </div>

        {previewUrl && size && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Detected placeholders</p>
            <div className="bg-muted/40 relative overflow-hidden rounded-lg border p-2">
              {/* A plain img is deliberate: this is an object URL of arbitrary
                  pixel size, which the image optimizer cannot process. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Template preview with detected placeholder rectangles"
                className="h-auto w-full"
                style={{ aspectRatio: `${size.width} / ${size.height}` }}
              />
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 ${size.width} ${size.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {placeholders.map((placeholder, index) => (
                  <rect
                    key={`${placeholder.x}-${placeholder.y}`}
                    x={placeholder.x}
                    y={placeholder.y}
                    width={placeholder.width}
                    height={placeholder.height}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={Math.max(2, size.width / 400)}
                  >
                    <title>{`Placeholder ${index + 1}`}</title>
                  </rect>
                ))}
              </svg>
            </div>
            <p className="text-muted-foreground text-sm">
              {placeholders.length} placeholder{placeholders.length === 1 ? '' : 's'} · {size.width}{' '}
              × {size.height}px
            </p>
          </div>
        )}

        {warnings.length > 0 && (
          <ul
            role="status"
            className="border-chart-3/40 bg-chart-3/10 flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm"
          >
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {warning}
              </li>
            ))}
          </ul>
        )}

        {placeholders.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              {placeholders.map((placeholder, index) => (
                <PlaceholderRow
                  key={`${placeholder.x}-${placeholder.y}`}
                  index={index}
                  kind={kind}
                  placeholder={placeholder}
                  onChange={(value) => assign(index, value)}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Conference blue"
            maxLength={80}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            onClick={onSubmit}
            disabled={isPending || placeholders.length === 0 || name.trim() === ''}
          >
            {isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {isPending ? 'Uploading…' : 'Save template'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PlaceholderRow({
  index,
  kind,
  placeholder,
  onChange,
}: {
  index: number
  kind: DesignKind
  placeholder: DraftPlaceholder
  onChange: (value: string) => void
}) {
  // The organizer picks the field, and the type follows from the field. Allowing
  // a mismatched pair would let a photo be assigned to a text slot, which would
  // render a name where a photograph was asked for.
  const field = placeholder.field
  const type = field
    ? (templateFieldsFor(kind).find((meta) => meta.field === field)?.type ?? 'TEXT')
    : 'TEXT'
  const options = fieldsOfType(kind, type)

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <p className="text-muted-foreground shrink-0 text-sm sm:w-32">
        Placeholder {index + 1}
        <span className="block text-xs">
          {placeholder.width} × {placeholder.height}px
        </span>
      </p>

      <Select value={field ?? NONE} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label={`Field for placeholder ${index + 1}`}>
          <SelectValue placeholder="Choose a field" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not used</SelectItem>
          {options.map((meta) => (
            <SelectItem key={meta.field} value={meta.field}>
              {meta.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
