'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, TriangleAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { deleteTemplateAction } from '@/features/certificates/actions/certificateTemplate.action'
import type { CertificateTemplate } from '@/features/certificates/services/certificateTemplateService'

/**
 * "My templates": the organizer's uploaded certificate designs.
 *
 * Selection happens in the studio's own template picker just above, so this
 * block is only the management surface — create, edit, delete. Splitting them
 * keeps the picker a single control for *which* template renders, rather than one
 * that also has to own the destructive actions.
 */
export function CertificateTemplateBar({
  eventId,
  templates,
}: {
  eventId: string
  templates: readonly CertificateTemplate[]
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function onDelete(template: CertificateTemplate) {
    if (
      !window.confirm(
        `Delete "${template.name}"?\n\n` +
          'Certificates you have already issued stay valid. Only the saved design is removed.'
      )
    ) {
      return
    }

    setError(null)
    setPendingId(template.id)
    startTransition(async () => {
      const result = await deleteTemplateAction({ eventId, templateId: template.id })
      setPendingId(null)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>My certificate templates</CardTitle>
            <p className="text-muted-foreground text-sm">
              Designs you uploaded. Select one in the template picker above.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href={`/events/${eventId}/design/certificate/templates/new`}>
              <Plus aria-hidden="true" />
              Upload custom certificate
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No custom templates yet. Design a certificate in Canva, Photoshop, or anywhere else,
            export it as a PNG, then upload it here and place a text box for the recipient&rsquo;s
            name. Your PNG is used exactly as you exported it.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-col gap-2 rounded-xl border p-3">
                <div className="bg-muted/40 overflow-hidden rounded-lg border">
                  {/* The signed URL is a private object of arbitrary size, so the
                      image optimizer cannot process it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={template.signedUrl}
                    alt={`${template.name} preview`}
                    className="block h-auto w-full"
                    style={{ aspectRatio: `${template.imageWidth} / ${template.imageHeight}` }}
                  />
                </div>

                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{template.name}</p>
                  <Badge variant="secondary" className="shrink-0">
                    Custom
                  </Badge>
                </div>

                <p className="text-muted-foreground text-xs">
                  {template.imageWidth} × {template.imageHeight}px
                </p>

                <div className="mt-auto flex gap-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/events/${eventId}/design/certificate/templates/${template.id}`}>
                      <Pencil aria-hidden="true" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(template)}
                    disabled={pendingId === template.id}
                    aria-label={`Delete ${template.name}`}
                  >
                    {pendingId === template.id ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
