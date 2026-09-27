import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { getOwnedEvent } from '@/features/events/services/eventService'
import { createClient } from '@/lib/supabase/server'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import { readHeaderBytes, sniffImageType } from '@/features/info/lib/imageType'
import { parseDesignConfig } from '@/features/certificates/templates/configSchema'
import type { CertificateDesignConfig } from '@/features/certificates/templates/types'
import { logger } from '@/lib/logger'

/**
 * Custom certificate templates: storage and persistence.
 *
 * Artwork lives in a **private** bucket, read through short-lived signed URLs. An
 * organizer's working design is their asset, not public event content, so no
 * public URL for a template ever exists. Upload, update, and delete are scoped by
 * the event's organizer, matching the table's own RLS.
 *
 * The bytes are sniffed rather than trusted. `File.type` is supplied by the
 * browser, so a script renamed `template.png` arrives claiming to be an image; the
 * PNG signature is the real check. A certificate is drawn straight onto a canvas
 * from these bytes, which is why that matters here.
 *
 * The stored file is the organizer's own, byte for byte. Nothing here decodes it,
 * inspects it, or re-encodes it; the reported image dimensions are used only for
 * the range check below, and to give the renderer the coordinate space its saved
 * text layers live in.
 */

type Client = SupabaseClient<Database>
type TemplateRow = Database['public']['Tables']['event_design_templates']['Row']

export const BUCKET = 'event-templates'

/** Long enough to render, short enough that a leaked link expires. */
const SIGNED_URL_TTL_SECONDS = 60 * 30

const MIN_EDGE = 64
const MAX_EDGE = 8000

/** Mirrors the `event-templates` bucket: 5 MB, PNG only. */
export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024
export const TEMPLATE_MIME = 'image/png' as const

const COLUMNS =
  'id, event_id, name, storage_path, image_width, image_height, design_config, created_at, updated_at' as const

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

async function signUrl(client: Client, storagePath: string): Promise<string> {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

/** Every custom certificate template for an event, newest first. */
export async function listCertificateTemplates(eventId: string): Promise<CertificateTemplate[]> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  const { data, error } = await client
    .from('event_design_templates')
    .select(COLUMNS)
    .eq('event_id', eventId)
    .eq('kind', 'certificate')
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as TemplateRow[]
  const templates: CertificateTemplate[] = []
  for (const row of rows) {
    templates.push(toTemplate(row, await signUrl(client, row.storage_path)))
  }
  return templates
}

export async function getCertificateTemplate(
  eventId: string,
  templateId: string
): Promise<CertificateTemplate> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  const { data, error } = await client
    .from('event_design_templates')
    .select(COLUMNS)
    .eq('id', templateId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new AppError(ACTION_ERROR_CODES.NOT_FOUND, 'That template does not exist.')
  }

  const row = data as TemplateRow
  return toTemplate(row, await signUrl(client, row.storage_path))
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

  if (input.file.size === 0) {
    throw new AppError(ACTION_ERROR_CODES.VALIDATION_FAILED, 'That file is empty.')
  }
  if (input.file.size > MAX_TEMPLATE_BYTES) {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      'Templates must be 5 MB or smaller. Export a smaller PNG and try again.'
    )
  }

  const sniffed = sniffImageType(await readHeaderBytes(input.file))
  if (sniffed !== 'image/png') {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      'Upload a PNG file. PSD and PDF are not supported — export your design as a PNG.'
    )
  }

  assertUsableDimensions(input.imageSize)

  const storagePath = `${event.organizer_id}/${event.id}/templates/${crypto.randomUUID()}.png`
  const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, input.file, {
    contentType: TEMPLATE_MIME,
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) {
    // The real cause is logged and then deliberately not shown. A Storage error
    // can carry bucket or policy text that has no business in front of an
    // organizer, and the user-facing message stays generic for that reason.
    //
    // It used to be discarded entirely, which made this the only failure branch
    // in the whole upload with no diagnostics: the ZIP-style "it failed but I
    // cannot tell you why". The distinction matters because every precondition
    // above has already passed by this point — the file is a valid PNG within the
    // size and dimension limits — so whatever is left is either a row-level
    // security decision or a Storage-side rejection, and only the error text
    // distinguishes them.
    logger.error('certificate_template_upload_failed', {
      bucket: BUCKET,
      path: storagePath,
      supabaseMessage: uploadError.message,
      supabaseCode: uploadError.status,
      policyDenial: /row-level security|not authorized|permission/i.test(uploadError.message),
    })

    throw new AppError(
      ACTION_ERROR_CODES.INTERNAL_ERROR,
      'The template could not be uploaded. Please try again.'
    )
  }

  const { data, error } = await client
    .from('event_design_templates')
    .insert({
      event_id: event.id,
      name: input.name,
      // Certificate-only in this phase. The column stays for future editors.
      kind: 'certificate',
      storage_path: storagePath,
      image_width: input.imageSize.width,
      image_height: input.imageSize.height,
      design_config: input.designConfig,
      created_by: event.organizer_id,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    // Never leave an orphaned object behind if the row could not be written.
    await client.storage
      .from(BUCKET)
      .remove([storagePath])
      .catch(() => {})
    throw error
  }

  const row = data as TemplateRow
  return toTemplate(row, await signUrl(client, storagePath))
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

  const { data, error } = await client
    .from('event_design_templates')
    .update({ name: input.name, design_config: input.designConfig })
    .eq('id', input.templateId)
    .eq('event_id', input.eventId)
    .select(COLUMNS)
    .single()

  if (error) throw error

  const row = data as TemplateRow
  return toTemplate(row, await signUrl(client, row.storage_path))
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

  const { data, error } = await client
    .from('event_design_templates')
    .delete()
    .eq('id', templateId)
    .eq('event_id', eventId)
    .select('storage_path')
    .single()

  if (error) throw error

  await client.storage.from(BUCKET).remove([(data as { storage_path: string }).storage_path])
}

function assertUsableDimensions(size: { width: number; height: number }): void {
  const { width, height } = size
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_EDGE ||
    height < MIN_EDGE ||
    width > MAX_EDGE ||
    height > MAX_EDGE
  ) {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      `Templates must be between ${MIN_EDGE} and ${MAX_EDGE} pixels on each side.`
    )
  }
}
