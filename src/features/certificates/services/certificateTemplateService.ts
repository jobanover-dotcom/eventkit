import 'server-only'
import { getOwnedEvent } from '@/features/events/services/eventService'
import { createClient } from '@/lib/supabase/server'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import { parseDesignConfig } from '@/features/certificates/templates/configSchema'
import type { CertificateDesignConfig } from '@/features/certificates/templates/types'
import {
  createTemplate,
  deleteTemplate,
  getTemplateRow,
  listTemplateRows,
  signTemplateUrl,
  type TemplateRow,
} from '@/features/design/services/designTemplateStore'

/**
 * Custom certificate templates: storage and persistence.
 *
 * The bucket, the byte sniffing, the dimension bounds and the signed-URL reads
 * are shared with custom photo frames in `designTemplateStore`; this module owns
 * only what is specific to a certificate, which is its text-layer
 * configuration.
 *
 * Artwork lives in a **private** bucket, read through short-lived signed URLs. An
 * organizer's working design is their asset, not public event content, so no
 * public URL for a template ever exists. Upload, update, and delete are scoped by
 * the event's organizer, matching the table's own RLS.
 *
 * The stored file is the organizer's own, byte for byte. Nothing here decodes it,
 * inspects it, or re-encodes it; the reported image dimensions are used only for
 * the range check, and to give the renderer the coordinate space its saved text
 * layers live in.
 */

export {
  BUCKET,
  MAX_TEMPLATE_BYTES,
  TEMPLATE_MIME,
} from '@/features/design/services/designTemplateStore'

export type CertificateTemplate = {
  id: string
  name: string
  imageWidth: number
  imageHeight: number
  designConfig: CertificateDesignConfig
  /** Short-lived URL for the private artwork. Never a public bucket URL. */
  signedUrl: string
  createdAt: string
  updatedAt: string
}

function toTemplate(row: TemplateRow, signedUrl: string): CertificateTemplate {
  const config = parseDesignConfig(row.design_config)

  if (!config) {
    // Unreachable through the application, which validates before writing. A row
    // edited by hand must not take the certificate page down with it.
    throw new AppError(
      ACTION_ERROR_CODES.CONFIG_MISSING,
      'This template’s saved layout is not usable. Re-upload it.'
    )
  }

  return {
    id: row.id,
    name: row.name,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    designConfig: config,
    signedUrl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Every custom certificate template for an event, newest first. */
export async function listCertificateTemplates(eventId: string): Promise<CertificateTemplate[]> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  const rows = await listTemplateRows(client, eventId, 'certificate')
  const templates: CertificateTemplate[] = []
  for (const row of rows) {
    templates.push(toTemplate(row, await signTemplateUrl(client, row.storage_path)))
  }
  return templates
}

export async function getCertificateTemplate(
  eventId: string,
  templateId: string
): Promise<CertificateTemplate> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  const row = await getTemplateRow(client, eventId, templateId)
  return toTemplate(row, await signTemplateUrl(client, row.storage_path))
}

/**
 * Stores a cleaned background and its configuration.
 *
 * The artwork is already cleaned by the time it arrives here, so this is the only
 * write of template bytes in the codebase.
 */
export async function createCertificateTemplate(input: {
  eventId: string
  name: string
  imageSize: { width: number; height: number }
  designConfig: CertificateDesignConfig
  file: Blob
}): Promise<CertificateTemplate> {
  const event = await getOwnedEvent(input.eventId)
  const client = await createClient()

  const row = await createTemplate({
    client,
    event,
    kind: 'certificate',
    name: input.name,
    imageSize: input.imageSize,
    designConfig: input.designConfig,
    file: input.file,
    logScope: 'certificate_template',
  })

  return toTemplate(row, await signTemplateUrl(client, row.storage_path))
}

/** Updates the saved layout. The artwork is untouched, so no re-upload is needed. */
export async function updateCertificateTemplateDesign(input: {
  eventId: string
  templateId: string
  name: string
  designConfig: CertificateDesignConfig
}): Promise<CertificateTemplate> {
  await getOwnedEvent(input.eventId)
  const client = await createClient()

  // Not the shared rename helper: a certificate saves its layout in the same
  // write, and a frame has no layout to save.
  const { data, error } = await client
    .from('event_design_templates')
    .update({ name: input.name, design_config: input.designConfig })
    .eq('id', input.templateId)
    .eq('event_id', input.eventId)
    .select(
      'id, event_id, name, storage_path, image_width, image_height, design_config, created_at, updated_at'
    )
    .single()

  if (error) throw error

  const row = data as TemplateRow
  return toTemplate(row, await signTemplateUrl(client, row.storage_path))
}

/**
 * Deletes a template: the row and its private object.
 *
 * Safe with respect to issued certificates. `certificates` holds no reference to
 * a template, no artefact bytes are stored anywhere, and
 * `get_certificate_verification` returns no template column — so a certificate
 * that was already issued and printed keeps verifying afterwards. What is lost is
 * the organizer's saved design, and any future regeneration uses a different
 * template.
 */
export async function deleteCertificateTemplate(
  eventId: string,
  templateId: string
): Promise<void> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  await deleteTemplate(client, eventId, templateId)
}
