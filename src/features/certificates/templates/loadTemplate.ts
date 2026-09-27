import type { DesignTemplate } from '@/features/design/lib/types'
import type { CertificateData } from '@/features/design/types'
import { loadImage } from '@/features/design/lib/render'
import { buildCertificateTemplate } from '@/features/certificates/templates/render'
import type { CertificateTemplate } from '@/features/certificates/services/certificateTemplateService'

/**
 * Turns a stored template into a live `DesignTemplate` in the browser.
 *
 * The records are fetched on the server and passed down as props — the storage
 * service is `server-only` and must never reach a client bundle. All that is
 * left here is to decode the signed artwork URL and wrap it in the same template
 * shape a built-in one has, which is what lets a custom certificate flow through
 * the existing picker, preview, exporter, and bulk generator untouched.
 *
 * A template whose artwork will not decode resolves to null and is skipped: a
 * signed URL that expired mid-session should drop one option from the list, not
 * break the certificate page.
 */
export async function loadCertificateTemplate(
  template: CertificateTemplate
): Promise<DesignTemplate<CertificateData> | null> {
  const background = await loadImage(template.signedUrl)
  if (!background) return null

  return buildCertificateTemplate({
    id: template.id,
    name: template.name,
    width: template.imageWidth,
    height: template.imageHeight,
    background,
    designConfig: template.designConfig,
  })
}

export async function loadCertificateTemplates(
  templates: readonly CertificateTemplate[]
): Promise<DesignTemplate<CertificateData>[]> {
  const loaded = await Promise.all(templates.map((template) => loadCertificateTemplate(template)))
  return loaded.filter((template): template is DesignTemplate<CertificateData> => template !== null)
}
