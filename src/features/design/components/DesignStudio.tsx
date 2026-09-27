'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Download, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { AnyDesignData, DesignKind } from '@/features/design/types'
import type { DesignTemplate } from '@/features/design/lib/types'
import { TemplatePicker } from '@/features/design/components/TemplatePicker'
import { useDesignExport } from '@/features/design/components/useDesignExport'

/**
 * The shell every generator shares: template choice on the left, live preview
 * and export on the right.
 *
 * Each generator supplies only its own fields and the data it builds. All the
 * preview, generation, download, and status handling lives here, so adding a
 * third template never means writing a third generator.
 */

type DesignStudioProps<TData extends AnyDesignData> = {
  kind: DesignKind
  heading: string
  description: string
  templates: readonly DesignTemplate<TData>[]
  data: TData
  includeQr: boolean
  /** Overrides what the QR encodes. Certificates pass the verification URL. */
  qrPayload?: string | null
  filenameBase: string
  fields: ReactNode
  photoUrl?: string | null
  /** Blocks generation until the organizer has chosen what to generate. */
  blockedReason?: string
}

export function DesignStudio<TData extends AnyDesignData>({
  kind,
  heading,
  description,
  templates,
  data,
  includeQr,
  qrPayload,
  filenameBase,
  fields,
  photoUrl = null,
  blockedReason,
}: DesignStudioProps<TData>) {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? '')

  const template = useMemo(
    () => templates.find((candidate) => candidate.id === selectedId) ?? templates[0] ?? null,
    [templates, selectedId]
  )

  const { status, error, previewUrl, isGenerated, generate, download } = useDesignExport<TData>({
    template,
    data,
    includeQr,
    photoUrl,
    qrPayload,
    filenameBase,
  })

  const isBusy = status === 'preparing' || status === 'previewing'
  const isBlocked = Boolean(blockedReason)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          {heading}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Template</CardTitle>
            </CardHeader>
            <CardContent>
              <TemplatePicker
                templates={templates}
                selectedId={template?.id ?? ''}
                onSelect={setSelectedId}
                sampleFor={kind}
              />
            </CardContent>
          </Card>

          {fields && (
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">{fields}</CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Preview</CardTitle>
              {template && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{template.name}</Badge>
                  <Badge variant="outline">
                    {template.width} × {template.height}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <div className="bg-muted/40 flex min-h-64 items-center justify-center overflow-hidden rounded-xl border p-4">
              {previewUrl ? (
                // A raster preview keeps the DOM light and matches the export
                // byte for byte, which a DOM mock-up would not.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={`Preview of the ${template?.name ?? 'selected'} design`}
                  className="max-h-[32rem] w-auto max-w-full rounded-md shadow-lg"
                />
              ) : (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  {isBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Rendering preview…
                    </>
                  ) : (
                    'The preview will appear here.'
                  )}
                </p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
              >
                {error}
              </p>
            )}

            {isBlocked && !error && (
              <p className="text-muted-foreground text-sm">{blockedReason}</p>
            )}

            <Separator />

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void generate()} disabled={isBusy || isBlocked || !template}>
                {isBusy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles aria-hidden="true" />
                )}
                {isBusy ? 'Generating…' : 'Generate'}
              </Button>

              {template?.outputs.map((output) => (
                <Button
                  key={output}
                  variant="outline"
                  onClick={() => void download(output)}
                  disabled={!isGenerated || isBusy}
                >
                  <Download aria-hidden="true" />
                  Download {output.toUpperCase()}
                </Button>
              ))}
            </div>

            {!isGenerated && !isBlocked && (
              <p className="text-muted-foreground text-sm">
                Generate once to enable the downloads. The file matches the preview above.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
