import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import { readHeaderBytes, sniffImageType } from '@/features/info/lib/imageType'
import { logger } from '@/lib/logger'

/**
 * Shared storage for organizer-uploaded design templates.
 *
 * Custom certificates and custom photo frames are the same shape of problem —
 * a PNG the organizer designed elsewhere, stored byte for byte in a **private**
 * bucket, read back through short-lived signed URLs, with a small `jsonb`
 * configuration beside it. That plumbing lives here once so the two kinds
 * cannot drift apart on the parts that matter: the bucket, the byte sniffing,
 * the dimension bounds, and the cleanup of an orphaned object when the row
 * fails to write.
 *
 * Nothing here decodes, inspects, or re-encodes the artwork. The reported
 * dimensions are used only for the range check and to give the renderer the
 * coordinate space its configuration lives in.
 *
 * Ownership is deliberately **not** checked here. Callers run their own
 * `getOwnedEvent` before touching these helpers, which keeps the authorization
 * decision in one obvious place per operation rather than hidden in a shared
 * helper.
 */

type Client = SupabaseClient<Database>
export type TemplateRow = Database['public']['Tables']['event_design_templates']['Row']

/** Kinds that may carry organizer-uploaded artwork. */
export type TemplateKind = 'certificate' | 'photo_frame'

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

export async function signTemplateUrl(client: Client, storagePath: string): Promise<string> {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

/**
 * Rejects anything the bucket or the database would reject anyway, so the
 * failure is a sentence aimed at the organizer rather than a PostgREST error.
 *
 * The bytes are sniffed, never trusted. `File.type` is supplied by the browser,
 * so a script renamed `template.png` arrives claiming to be an image; the PNG
 * signature is the real check, and these bytes are what gets drawn onto a
 * canvas.
 */
export async function assertPngUpload(file: Blob): Promise<void> {
  if (file.size === 0) {
    throw new AppError(ACTION_ERROR_CODES.VALIDATION_FAILED, 'That file is empty.')
  }
  if (file.size > MAX_TEMPLATE_BYTES) {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      'Templates must be 5 MB or smaller. Export a smaller PNG and try again.'
    )
  }

  const sniffed = sniffImageType(await readHeaderBytes(file))
  if (sniffed !== 'image/png') {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      'Upload a PNG file. PSD and PDF are not supported — export your design as a PNG.'
    )
  }
}

export function assertUsableDimensions(size: { width: number; height: number }): void {
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

/** Every stored template of one kind for an event, newest first. */
export async function listTemplateRows(
  client: Client,
  eventId: string,
  kind: TemplateKind
): Promise<TemplateRow[]> {
  const { data, error } = await client
    .from('event_design_templates')
    .select(COLUMNS)
    .eq('event_id', eventId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as TemplateRow[]
}

export async function getTemplateRow(
  client: Client,
  eventId: string,
  templateId: string
): Promise<TemplateRow> {
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
  return data as TemplateRow
}

/**
 * Uploads the artwork and writes its row, removing the object again if the row
 * cannot be written.
 *
 * The object is the organizer's own file, stored exactly as uploaded.
 */
export async function createTemplate(input: {
  client: Client
  event: { id: string; organizer_id: string }
  kind: TemplateKind
  name: string
  imageSize: { width: number; height: number }
  designConfig: Json
  file: Blob
  /** Distinguishes the two upload failure logs. */
  logScope: string
}): Promise<TemplateRow> {
  const { client, event, kind, name, imageSize, designConfig, file, logScope } = input

  await assertPngUpload(file)
  assertUsableDimensions(imageSize)

  const storagePath = `${event.organizer_id}/${event.id}/templates/${crypto.randomUUID()}.png`
  const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, file, {
    contentType: TEMPLATE_MIME,
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) {
    // The real cause is logged and then deliberately not shown. A Storage error
    // can carry bucket or policy text that has no business in front of an
    // organizer, and the user-facing message stays generic for that reason.
    //
    // Every precondition above has already passed by this point — the file is a
    // valid PNG within the size and dimension limits — so whatever is left is
    // either a row-level security decision or a Storage-side rejection, and
    // only the error text distinguishes them.
    logger.error(`${logScope}_upload_failed`, {
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
      name,
      kind,
      storage_path: storagePath,
      image_width: imageSize.width,
      image_height: imageSize.height,
      design_config: designConfig,
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

  return data as TemplateRow
}

/** Renames a template. Its artwork and configuration are untouched. */
export async function renameTemplate(input: {
  client: Client
  eventId: string
  templateId: string
  name: string
}): Promise<TemplateRow> {
  const { data, error } = await input.client
    .from('event_design_templates')
    .update({ name: input.name })
    .eq('id', input.templateId)
    .eq('event_id', input.eventId)
    .select(COLUMNS)
    .single()

  if (error) throw error
  return data as TemplateRow
}

/** Deletes a template: the row and its private object. */
export async function deleteTemplate(
  client: Client,
  eventId: string,
  templateId: string
): Promise<void> {
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
