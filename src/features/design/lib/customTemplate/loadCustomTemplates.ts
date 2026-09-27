import type { DesignTemplate } from '@/features/design/lib/types'
import type { CertificateData, DesignKind } from '@/features/design/types'
import { loadImage } from '@/features/design/lib/render'
import {
  buildCustomTemplate,
  type TemplatePlaceholder,
} from '@/features/design/lib/customTemplate/buildTemplate'
import type { CustomTemplateRecord } from '@/features/design/schemas/customTemplate.schema'

/**
 * Turns stored template records into live `DesignTemplate`s in the browser.
 *
 * The records are fetched on the server and passed down as plain props — the
 * storage service is `server-only` and must never reach a client bundle. All
 * that is left to do here is decode each signed artwork URL and wrap it in the
 * same template shape a built-in one has, which is what makes a custom template
 * flow through the existing generator untouched.
 *
 * A template whose artwork will not decode is dropped rather than allowed to
 * break the picker: a missing custom option is a small loss, a generator that
 * throws on load is a broken page.
 */
export async function loadCustomTemplates(
  records: readonly CustomTemplateRecord[],
  kind: DesignKind
): Promise<DesignTemplate<CertificateData>[]> {
  const loaded = await Promise.all(
    records
      .filter((record) => record.kind === kind)
      .map(async (record) => {
        const image = await loadImage(record.signedUrl)
        if (!image) return null

        const placeholders: TemplatePlaceholder[] = record.placeholders.map((entry) => ({
          rect: { x: entry.x, y: entry.y, width: entry.width, height: entry.height },
          field: entry.field,
        }))

        return buildCustomTemplate({
          id: record.id,
          name: record.name,
          kind,
          width: record.imageWidth,
          height: record.imageHeight,
          placeholders,
          image,
          // Sampled as white: the browser cannot cheaply read a representative
          // background from a remote image before it is drawn, and a white
          // plate is the safe default that keeps text legible.
          slotBackground: '#ffffff',
        })
      })
  )

  return loaded.filter((template): template is DesignTemplate<CertificateData> => template !== null)
}
