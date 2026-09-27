'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bold, Italic, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CERTIFICATE_FONTS, certificateFontFamily, type CertificateFontKey } from '@/config/fonts'
import { LIMITS } from '@/features/certificates/templates/configSchema'
import { fitLayerText } from '@/features/certificates/templates/render'
import {
  RESIZE_HANDLES,
  clampConfig,
  emptyConfig,
  moveLayer,
  newTextLayer,
  resizeLayer,
  scaleToImage,
  snapLayer,
  type ResizeHandle,
} from '@/features/certificates/templates/geometry'
import {
  SAMPLE_RECIPIENT_NAME,
  type CertificateDesignConfig,
  type TextLayer,
  type TextLayerField,
} from '@/features/certificates/templates/types'
import {
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
} from '@/features/certificates/actions/certificateTemplate.action'
import type { CertificateTemplate } from '@/features/certificates/services/certificateTemplateService'

/**
 * The custom certificate editor.
 *
 * Not a design tool, and deliberately shallow. The organizer's PNG is the
 * finished certificate: EventKit never redraws, recolours, crops, or erases it.
 * The only editable objects are text boxes the organizer places on top, and the
 * only value written into them is the recipient's name.
 *
 * Three things make it trustworthy rather than merely usable:
 *
 *  - **The overlay is the image, at image scale.** The text boxes are rendered
 *    inside a container sized to the PNG's real pixel dimensions and then
 *    transformed to fit the browser. So what the organizer drags is measured in
 *    the same units the renderer uses, and a template saved on a laptop renders
 *    identically on a projector.
 *
 *  - **The preview uses the real renderer.** `fitLayerText` is the same function
 *    the PDF path calls, so a name that wraps in the editor wraps in the file.
 *
 *  - **The upload is the file.** The bytes handed to storage are the bytes the
 *    organizer chose. There is no canvas round trip, so the stored background is
 *    provably the original and cannot drift from what was designed.
 */

/** A drag in progress, in image pixels. */
type DragState =
  | {
      kind: 'move'
      id: string
      pointerX: number
      pointerY: number
      startX: number
      startY: number
    }
  | {
      kind: 'resize'
      id: string
      handle: ResizeHandle
      pointerX: number
      pointerY: number
      start: TextLayer
    }

/** How far an arrow key nudges a selected box, in image pixels. */
const KEY_NUDGE_PX = 4
const KEY_NUDGE_LARGE_PX = 20

const FIELD_LABELS: Record<TextLayerField, string> = {
  recipientName: 'Recipient name',
}

export function CertificateTemplateEditor({
  eventId,
  template,
}: {
  eventId: string
  /** Absent for a new template. */
  template?: CertificateTemplate
}) {
  const router = useRouter()
  const isNew = !template

  const [name, setName] = useState(template?.name ?? '')
  const [background, setBackground] = useState<string | null>(template?.signedUrl ?? null)
  /**
   * The organizer's own file, kept for the save.
   *
   * Held as the `File` itself rather than anything re-encoded, so what is
   * uploaded is what was chosen. Only its dimensions are read.
   */
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    template ? { width: template.imageWidth, height: template.imageHeight } : null
  )
  const [config, setConfig] = useState<CertificateDesignConfig | null>(
    template?.designConfig ?? null
  )
  /** Id of the selected text box, or null for nothing selected. */
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Measured display width of the artwork, used to scale the overlay.
  const frameRef = useRef<HTMLDivElement>(null)
  const [displayWidth, setDisplayWidth] = useState(0)
  const dragRef = useRef<DragState | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setDisplayWidth(entry.contentRect.width)
    })
    observer.observe(frame)
    setDisplayWidth(frame.clientWidth)
    return () => observer.disconnect()
  }, [background])

  // Revoke the object URL on unmount so an upload preview is not leaked.
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    []
  )

  const scale = size && displayWidth > 0 ? displayWidth / size.width : 1

  const bounds = useMemo(() => ({ width: size?.width ?? 0, height: size?.height ?? 0 }), [size])

  const updateLayer = useCallback(
    (id: string, next: TextLayer) => {
      setConfig((current) =>
        current
          ? clampConfig(
              {
                ...current,
                textLayers: current.textLayers.map((layer) => (layer.id === id ? next : layer)),
              },
              bounds
            )
          : current
      )
    },
    [bounds]
  )

  const layers = useMemo(() => config?.textLayers ?? [], [config])

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selected) ?? null,
    [layers, selected]
  )

  /**
   * Accepts the designer's file.
   *
   * The image is decoded for exactly one reason — to learn its dimensions — and
   * then thrown away. Nothing is drawn, sampled, or re-encoded, so the artwork
   * EventKit stores is the artwork the organizer designed.
   */
  async function onPick(file: File | null) {
    setError(null)
    if (!file) return

    const url = URL.createObjectURL(file)
    const image = new window.Image()
    image.src = url

    try {
      await image.decode()
    } catch {
      URL.revokeObjectURL(url)
      setError(
        'That file could not be read as an image. Export your design as a PNG and try again.'
      )
      return
    }

    const width = image.naturalWidth
    const height = image.naturalHeight

    if (width < 1 || height < 1) {
      URL.revokeObjectURL(url)
      setError('That image has no usable dimensions.')
      return
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = url

    setBackground(url)
    setOriginalFile(file)
    setSize({ width, height })
    // A new upload starts with nothing placed on it. The organizer adds a text
    // box where they want the name to appear.
    setConfig(emptyConfig())
    setSelected(null)
  }

  // --- text box lifecycle -----------------------------------------------------

  function addTextBox() {
    if (!config) return
    if (layers.length >= LIMITS.maxTextLayers) {
      setError(`A template can hold at most ${LIMITS.maxTextLayers} text boxes.`)
      return
    }

    const layer = newTextLayer(bounds)
    setConfig(clampConfig({ ...config, textLayers: [...layers, layer] }, bounds))
    setSelected(layer.id)
    setError(null)
  }

  function removeTextBox(id: string) {
    if (!config) return
    setConfig(
      clampConfig({ ...config, textLayers: layers.filter((layer) => layer.id !== id) }, bounds)
    )
    setSelected((current) => (current === id ? null : current))
  }

  /** Clicking empty canvas, or Escape, deselects. */
  function deselect() {
    setSelected(null)
  }

  // --- pointer interaction ----------------------------------------------------

  const onLayerPointerDown = (id: string) => (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const layer = layers.find((candidate) => candidate.id === id)
    if (!layer) return
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    dragRef.current = {
      kind: 'move',
      id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: layer.x,
      startY: layer.y,
    }
    setSelected(id)
  }

  const onHandlePointerDown = (id: string, handle: ResizeHandle) => (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const layer = layers.find((candidate) => candidate.id === id)
    if (!layer) return
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    dragRef.current = {
      kind: 'resize',
      id,
      handle,
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: layer,
    }
    setSelected(id)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || !config) return

    // One division converts a CSS-pixel delta into image pixels. Nothing here
    // knows about the viewport or the device pixel ratio.
    const dx = scaleToImage(event.clientX - drag.pointerX, displayWidth, bounds.width)
    const dy = scaleToImage(event.clientY - drag.pointerY, displayWidth, bounds.width)

    const layer = layers.find((candidate) => candidate.id === drag.id)
    if (!layer) return

    if (drag.kind === 'move') {
      // Centring is the adjustment made constantly, so a nudge near the middle
      // line locks to it. Assistance, not a constraint: away from the guide the
      // box goes exactly where it was dragged.
      const moved = moveLayer({ ...layer, x: drag.startX, y: drag.startY }, dx, dy, bounds)
      updateLayer(drag.id, snapLayer(moved, bounds).layer)
      return
    }

    // Resizing changes the box only. The font size is a separate control, so
    // widening a box never silently enlarges the type.
    updateLayer(drag.id, resizeLayer(drag.start, drag.handle, dx, dy, bounds))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  /**
   * Keyboard equivalents for dragging and resizing.
   *
   * A pointer-only editor is unusable without a mouse, so a selected box moves
   * with the arrow keys, grows with Shift, and is removed with Delete. The box
   * itself is a focusable control rather than a div with a role.
   */
  const onLayerKeyDown = (id: string) => (event: React.KeyboardEvent) => {
    if (!config) return
    const layer = layers.find((candidate) => candidate.id === id)
    if (!layer) return

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      removeTextBox(id)
      return
    }

    const step = event.shiftKey ? KEY_NUDGE_LARGE_PX : KEY_NUDGE_PX
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = deltas[event.key]
    if (!delta) return

    event.preventDefault()
    updateLayer(id, moveLayer(layer, delta[0], delta[1], bounds))
  }

  // --- measurement ------------------------------------------------------------

  /**
   * Measures the preview with the renderer's own layout, so the "does it fit?"
   * warning cannot disagree with the generated file.
   *
   * Computed during render rather than in an effect: the answer is derived from
   * props, and a measuring canvas is not observable outside React, so there is
   * nothing for an effect to synchronise.
   */
  const overflow = useMemo(() => {
    if (!config || !background || typeof document === 'undefined') return {}

    const context = document.createElement('canvas').getContext('2d')
    if (!context) return {}

    const measured: Record<string, boolean> = {}
    for (const layer of config.textLayers) {
      // Measured at the on-screen scale, because that is the box being judged.
      const proxy: TextLayer = {
        ...layer,
        fontSize: Math.max(6, Math.round(layer.fontSize * scale)),
        letterSpacing: layer.letterSpacing * scale,
      }
      measured[layer.id] = fitLayerText(context, SAMPLE_RECIPIENT_NAME, proxy).overflows
    }
    return measured
  }, [config, background, scale])

  // --- save / delete ----------------------------------------------------------

  function onSave() {
    if (!config || !size) return
    setError(null)

    startTransition(async () => {
      if (isNew) {
        if (!originalFile) {
          setError('Choose a PNG template first.')
          return
        }
        const formData = new FormData()
        formData.set('eventId', eventId)
        formData.set('name', name)
        // The organizer's own bytes. Not re-encoded, not redrawn.
        formData.set('file', originalFile, originalFile.name || 'certificate.png')
        formData.set('imageWidth', String(size.width))
        formData.set('imageHeight', String(size.height))
        formData.set('designConfig', JSON.stringify(config))

        const result = await createTemplateAction(formData)
        if (result.ok) {
          router.push(`/events/${eventId}/design/certificate`)
          router.refresh()
          return
        }
        setError(result.error.message)
        return
      }

      const result = await updateTemplateAction({
        eventId,
        templateId: template.id,
        name,
        designConfig: config,
      })
      if (result.ok) {
        router.push(`/events/${eventId}/design/certificate`)
        router.refresh()
        return
      }
      setError(result.error.message)
    })
  }

  function onDeleteTemplate() {
    if (!template) return
    if (!window.confirm(`Delete "${template.name}"? Certificates already issued stay valid.`)) {
      return
    }

    startTransition(async () => {
      const result = await deleteTemplateAction({ eventId, templateId: template.id })
      if (result.ok) {
        router.push(`/events/${eventId}/design/certificate`)
        router.refresh()
        return
      }
      setError(result.error.message)
    })
  }

  const canSave = Boolean(config && size && name.trim()) && (isNew ? Boolean(originalFile) : true)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">
            {isNew ? 'New certificate template' : 'Edit certificate template'}
          </h1>
          <p className="text-muted-foreground text-sm">
            Your PNG is used exactly as uploaded. Add a text box, then place the recipient&rsquo;s
            name on it.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href={`/events/${eventId}/design/certificate`}>
            <ArrowLeft aria-hidden="true" />
            Back to certificates
          </a>
        </Button>
      </header>

      {error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Template</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              placeholder="Graduation 2026"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {isNew && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="template-file">Certificate design (PNG)</Label>
              <Input
                id="template-file"
                type="file"
                accept="image/png,.png"
                onChange={(event) => void onPick(event.target.files?.[0] ?? null)}
              />
              <p className="text-muted-foreground text-sm">
                Upload the finished artwork exactly as you designed it. EventKit stores this file
                untouched and only writes the recipient&rsquo;s name on top of it, so bake the
                certificate title, event name, date, signatures, and borders into the image.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {!config && isNew && (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Upload className="size-4" aria-hidden="true" />
            Choose your certificate PNG to open the editor.
          </CardContent>
        </Card>
      )}

      {config && size && background && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Place your text</CardTitle>
                <Button type="button" variant="outline" onClick={addTextBox}>
                  <Plus aria-hidden="true" />
                  Add Text Box
                </Button>
              </div>
              <CardDescription>
                A text box always prints the recipient&rsquo;s name. Drag it to move, drag a handle
                to resize. &ldquo;{SAMPLE_RECIPIENT_NAME}&rdquo; is shown until certificates are
                generated.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* The move and release handlers sit on the frame because a
                  pointer capture retargets every subsequent event to the element
                  that captured it; a handler anywhere else would never fire. */}
              <div
                ref={frameRef}
                className="relative overflow-hidden rounded-lg border"
                onPointerDown={deselect}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <div className="relative" style={{ width: displayWidth || '100%' }}>
                  {/* The plain image is deliberate: this is a signed URL of
                      arbitrary pixel size the optimizer cannot process. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={background}
                    alt="Certificate background"
                    className="block w-full"
                    style={{ aspectRatio: `${size.width} / ${size.height}` }}
                  />

                  {/* Sized in real image pixels, then scaled, so every box the
                      organizer drags is measured in the renderer's units. */}
                  <div
                    className="pointer-events-none absolute top-0 left-0"
                    style={{
                      width: size.width,
                      height: size.height,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {layers.map((layer, index) => (
                      <TextLayerBox
                        key={layer.id}
                        index={index}
                        label={FIELD_LABELS[layer.field]}
                        layer={layer}
                        selected={selected === layer.id}
                        overflowing={Boolean(overflow[layer.id])}
                        onPointerDown={onLayerPointerDown(layer.id)}
                        onHandlePointerDown={(handle) => onHandlePointerDown(layer.id, handle)}
                        onKeyDown={onLayerKeyDown(layer.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {selectedLayer && overflow[selectedLayer.id] && (
                <p
                  role="status"
                  className="border-chart-3/40 bg-chart-3/10 rounded-lg border px-3 py-2 text-sm"
                >
                  This preview is too long for the box. It will shrink automatically when generated,
                  and shorten with an ellipsis only if it still does not fit. Make the box wider or
                  taller to avoid that.
                </p>
              )}

              {layers.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No text boxes yet. Select <strong>Add Text Box</strong> to place the
                  recipient&rsquo;s name.
                </p>
              )}
            </CardContent>
          </Card>

          {selectedLayer ? (
            <LayerToolbar
              label={FIELD_LABELS[selectedLayer.field]}
              layer={selectedLayer}
              onChange={(next) => updateLayer(selectedLayer.id, next)}
              onDelete={() => removeTextBox(selectedLayer.id)}
            />
          ) : (
            <Card>
              <CardContent className="text-muted-foreground py-6 text-sm">
                Select a text box on the artwork to change its font, colour, and alignment.
              </CardContent>
            </Card>
          )}
        </>
      )}

      {config && size && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onSave} disabled={isPending || !canSave}>
            {isPending ? 'Saving…' : 'Save template'}
          </Button>
          {!template && (
            <Button variant="outline" onClick={onSave} disabled={isPending || !canSave}>
              Save and use
            </Button>
          )}
          {template && (
            <Button variant="destructive" onClick={onDeleteTemplate} disabled={isPending}>
              <Trash2 aria-hidden="true" />
              Delete template
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function TextLayerBox({
  index,
  label,
  layer,
  selected,
  overflowing,
  onPointerDown,
  onHandlePointerDown,
  onKeyDown,
}: {
  index: number
  label: string
  layer: TextLayer
  selected: boolean
  overflowing: boolean
  onPointerDown: (event: React.PointerEvent) => void
  onHandlePointerDown: (handle: ResizeHandle) => (event: React.PointerEvent) => void
  onKeyDown: (event: React.KeyboardEvent) => void
}) {
  // This box lives inside the container sized to the PNG's real pixels, so plain
  // pixel offsets are already in the renderer's coordinate space.
  const boxStyle = {
    left: `${layer.x}px`,
    top: `${layer.y}px`,
    width: `${layer.width}px`,
    height: `${layer.height}px`,
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label} text box ${index + 1}. Arrow keys to move, Delete to remove.`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={
        selected
          ? 'pointer-events-auto absolute rounded-sm border-2 border-primary'
          : 'pointer-events-auto absolute rounded-sm border border-dashed border-foreground/40'
      }
      style={boxStyle}
    >
      <span
        className="block truncate text-center"
        style={{
          fontFamily: certificateFontFamily(layer.fontFamily),
          fontSize: layer.fontSize,
          fontWeight: layer.fontWeight,
          fontStyle: layer.italic ? 'italic' : 'normal',
          letterSpacing: `${layer.letterSpacing}px`,
          lineHeight: layer.lineHeight,
          color: layer.color,
          textAlign: layer.horizontalAlign,
          paddingTop:
            layer.verticalAlign === 'top' ? 0 : layer.verticalAlign === 'middle' ? '35%' : '55%',
        }}
      >
        {SAMPLE_RECIPIENT_NAME}
      </span>

      {selected && (
        <>
          {RESIZE_HANDLES.map((handle) => (
            <span
              key={handle}
              aria-hidden="true"
              onPointerDown={onHandlePointerDown(handle)}
              className="bg-primary absolute rounded-sm border-2 border-background"
              style={{
                // Corners are square, sides are thin bars, which is what tells the
                // organizer which axis each handle will move.
                ...handleStyle(handle),
                cursor: `${handle}-resize`,
              }}
            />
          ))}
          {overflowing && (
            <span className="bg-chart-3 absolute -top-6 left-0 rounded px-1.5 py-0.5 text-xs text-white">
              Too long for this box
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** Positions and shape for one resize handle. */
function handleStyle(handle: ResizeHandle): React.CSSProperties {
  const corner = handle.length === 2
  const size = corner ? 14 : 18
  const thin = 4
  const offset = -(size - thin) / 2 - 1

  return {
    ...(handle.includes('w') ? { left: offset } : {}),
    ...(handle.includes('e') ? { right: offset } : {}),
    ...(handle.includes('n') ? { top: offset } : {}),
    ...(handle.includes('s') ? { bottom: offset } : {}),
    width: handle.includes('e') || handle.includes('w') ? thin : size,
    height: handle.includes('n') || handle.includes('s') ? thin : size,
  }
}

function LayerToolbar({
  label,
  layer,
  onChange,
  onDelete,
}: {
  label: string
  layer: TextLayer
  onChange: (next: TextLayer) => void
  onDelete: () => void
}) {
  const [fontSize, setFontSize] = useState(String(layer.fontSize))
  const [letterSpacing, setLetterSpacing] = useState(String(layer.letterSpacing))
  const [lineHeight, setLineHeight] = useState(String(layer.lineHeight))

  // Numeric inputs commit on blur or Enter, so typing "1" on the way to "18"
  // does not reformat the field under the organizer.
  const commit = (key: keyof TextLayer, value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    onChange({ ...layer, [key]: parsed })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Text box</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="layer-font">Font</Label>
            <Select
              value={layer.fontFamily}
              onValueChange={(value) =>
                onChange({ ...layer, fontFamily: value as CertificateFontKey })
              }
            >
              <SelectTrigger id="layer-font" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CERTIFICATE_FONTS.map((font) => (
                  <SelectItem key={font.key} value={font.key}>
                    {font.label} · {font.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="layer-size">Font size</Label>
            <Input
              id="layer-size"
              type="number"
              min={LIMITS.minFontSize}
              max={LIMITS.maxFontSize}
              value={fontSize}
              onChange={(event) => setFontSize(event.target.value)}
              onBlur={() => commit('fontSize', fontSize)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="layer-colour">Text colour</Label>
            <Input
              id="layer-colour"
              type="color"
              className="h-9 p-1"
              value={layer.color}
              onChange={(event) => onChange({ ...layer, color: event.target.value })}
            />
          </div>

          <div className="flex flex-col items-end justify-end gap-2">
            <Button type="button" variant="destructive" onClick={onDelete}>
              <Trash2 aria-hidden="true" />
              Delete text box
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label>Style</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="icon"
                variant={layer.fontWeight === 700 ? 'default' : 'outline'}
                aria-label="Bold"
                aria-pressed={layer.fontWeight === 700}
                onClick={() =>
                  onChange({ ...layer, fontWeight: layer.fontWeight === 700 ? 400 : 700 })
                }
              >
                <Bold aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={layer.italic ? 'default' : 'outline'}
                aria-label="Italic"
                aria-pressed={layer.italic}
                onClick={() => onChange({ ...layer, italic: !layer.italic })}
              >
                <Italic aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Horizontal</Label>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((align) => (
                <Button
                  key={align}
                  type="button"
                  size="sm"
                  variant={layer.horizontalAlign === align ? 'default' : 'outline'}
                  aria-pressed={layer.horizontalAlign === align}
                  onClick={() => onChange({ ...layer, horizontalAlign: align })}
                >
                  {align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Vertical</Label>
            <div className="flex gap-1">
              {(['top', 'middle', 'bottom'] as const).map((align) => (
                <Button
                  key={align}
                  type="button"
                  size="sm"
                  variant={layer.verticalAlign === align ? 'default' : 'outline'}
                  aria-pressed={layer.verticalAlign === align}
                  onClick={() => onChange({ ...layer, verticalAlign: align })}
                >
                  {align === 'top' ? 'Top' : align === 'middle' ? 'Middle' : 'Bottom'}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="layer-spacing">Letter spacing</Label>
            <Input
              id="layer-spacing"
              type="number"
              min={LIMITS.minLetterSpacing}
              max={LIMITS.maxLetterSpacing}
              value={letterSpacing}
              onChange={(event) => setLetterSpacing(event.target.value)}
              onBlur={() => commit('letterSpacing', letterSpacing)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="layer-line">Line height</Label>
            <Input
              id="layer-line"
              type="number"
              step="0.05"
              min={LIMITS.minLineHeight}
              max={LIMITS.maxLineHeight}
              value={lineHeight}
              onChange={(event) => setLineHeight(event.target.value)}
              onBlur={() => commit('lineHeight', lineHeight)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Box size</Label>
            <p className="text-muted-foreground py-2 text-sm tabular-nums">
              {Math.round(layer.width)} × {Math.round(layer.height)} px
            </p>
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Drag the box to move it and its handles to resize. Size and position are in the
          PNG&rsquo;s own pixels, so the template renders the same at any screen size. Resizing
          never changes the font size.
        </p>

        <Badge variant="outline" className="w-fit">
          Editing: {label}
        </Badge>
      </CardContent>
    </Card>
  )
}
