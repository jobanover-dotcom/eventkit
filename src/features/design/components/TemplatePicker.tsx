'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AnyDesignData, DesignKind } from '@/features/design/types'
import type { DesignTemplate } from '@/features/design/lib/types'
import { canvasToPngDataUrl, renderDesign } from '@/features/design/lib/render'
import { SAMPLE_DATA_BY_KIND } from '@/features/design/lib/sampleData'

/**
 * Template cards with a real rendered thumbnail.
 *
 * The thumbnail is the template drawn with fixed sample content, not a CSS
 * mock-up, so what an organizer picks is what they get. It renders at a small
 * scale, with no QR and no remote images, which keeps it fast and offline-safe.
 */

const THUMBNAIL_MAX_WIDTH = 260

type TemplateThumbnailProps = {
  template: DesignTemplate<never>
  alt: string
}

export function TemplateThumbnail({ template, alt }: TemplateThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const sample = SAMPLE_DATA_BY_KIND[template.kind as keyof typeof SAMPLE_DATA_BY_KIND]

    if (!sample) return

    void (async () => {
      try {
        const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / template.width)
        const canvas = await renderDesign(
          template as DesignTemplate<typeof sample>,
          sample,
          {},
          { scale, waitForFonts: true }
        )
        // A card can be replaced or unmounted while the raster is in flight.
        if (cancelled) return
        setSrc(canvasToPngDataUrl(canvas))
      } catch {
        // A thumbnail is a nicety. If the browser refuses to rasterise, the
        // card still shows the template name and blurb.
        if (!cancelled) setSrc(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [template])

  return (
    <div className="bg-muted/40 flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-muted-foreground text-xs">Preview unavailable</span>
      )}
    </div>
  )
}

type TemplatePickerProps<TData extends AnyDesignData> = {
  templates: readonly DesignTemplate<TData>[]
  selectedId: string
  onSelect: (id: string) => void
  sampleFor: DesignKind
}

export function TemplatePicker<TData extends AnyDesignData>({
  templates,
  selectedId,
  onSelect,
}: TemplatePickerProps<TData>) {
  return (
    <ul className="flex flex-col gap-4">
      {templates.map((template) => {
        const isSelected = template.id === selectedId

        return (
          <li key={template.id} className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onSelect(template.id)}
              aria-pressed={isSelected}
              className={cn(
                'group flex flex-col gap-2 rounded-xl border p-2 text-left transition-colors',
                'focus-visible:ring-ring focus-visible:ring-3',
                isSelected
                  ? 'border-primary ring-primary/30 ring-2'
                  : 'hover:border-primary/50 hover:bg-muted/40'
              )}
            >
              <TemplateThumbnail
                template={template as DesignTemplate<never>}
                alt={`${template.name} template preview`}
              />

              <span className="flex flex-col gap-0.5 px-1">
                <span className="text-sm font-semibold">{template.name}</span>
                <span className="text-muted-foreground text-xs">{template.blurb}</span>
              </span>
            </button>

            <Button
              type="button"
              size="sm"
              variant={isSelected ? 'secondary' : 'outline'}
              onClick={() => onSelect(template.id)}
              className="w-full"
            >
              {isSelected ? (
                <>
                  <Check aria-hidden="true" />
                  Selected
                </>
              ) : (
                'Use template'
              )}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
