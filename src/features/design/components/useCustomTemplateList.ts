'use client'

import { useEffect, useState } from 'react'
import type { DesignTemplate } from '@/features/design/lib/types'
import type { CertificateData, DesignKind } from '@/features/design/types'
import { loadCustomTemplates } from '@/features/design/lib/customTemplate/loadCustomTemplates'
import type { CustomTemplateRecord } from '@/features/design/schemas/customTemplate.schema'

type Loaded = {
  /** The record set these templates were built from. */
  key: string
  templates: DesignTemplate<CertificateData>[]
}

/**
 * Client-side holder for the organizer's custom templates.
 *
 * Decoding artwork is asynchronous, so the list lands a tick after render and
 * the hook returns an empty list until then. That is deliberate: the built-in
 * templates are available immediately, so a slow or unreadable custom template
 * delays an extra option rather than blocking the generator.
 *
 * The result is keyed on the records it came from, so a re-save returns the new
 * list while an unrelated re-render keeps the already-decoded one.
 */
export function useCustomTemplateList(
  records: readonly CustomTemplateRecord[] | undefined,
  kind: DesignKind
): DesignTemplate<CertificateData>[] {
  const [loaded, setLoaded] = useState<Loaded>({ key: '', templates: [] })

  const key = (records ?? [])
    .map((record) => `${record.id}:${record.createdAt}:${record.placeholders.length}`)
    .join(',')

  useEffect(() => {
    if (!records || records.length === 0) return

    let cancelled = false

    void loadCustomTemplates(records, kind).then((templates) => {
      if (!cancelled) setLoaded({ key, templates })
    })

    return () => {
      cancelled = true
    }
    // `key` summarises `records`, and depending on the array itself would
    // re-decode the artwork on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind])

  // Derived rather than stored: a stale list is never shown for a new key.
  return loaded.key === key ? loaded.templates : []
}
