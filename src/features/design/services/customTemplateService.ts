import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { getOwnedEvent } from '@/features/events/services/eventService'
import { createClient } from '@/lib/supabase/server'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import { readHeaderBytes, sniffImageType } from '@/features/info/lib/imageType'
import { PLACEHOLDER_HEX } from '@/features/design/lib/customTemplate/placeholder'
import type { TemplateField } from '@/features/design/lib/customTemplate/fields'
import {
  MAX_TEMPLATE_BYTES,
  TEMPLATE_MIME,
  type CustomTemplateRecord,
  type UploadTemplateValues,
} from '@/features/design/schemas/customTemplate.schema'

/**
 * Custom template storage.
 *
 * Artwork lives in a **private** bucket, not `event-assets`. An organizer's
 * working template is their asset, not public event content, so reading it goes
 * through a server-issued signed URL and the bucket policies scope every object
 * to the owning organizer. No public URL for a template ever exists.
 *
 * The bytes are sniffed, not trusted. `File.type` is supplied by the browser, so
 * a script renamed `template.png` arrives claiming to be an image; the PNG
 * signature is what is actually checked. Dimensions are read back from the
 * decoded image the client measured, cross-checked against a generous ceiling so
 * a hostile client cannot ask the renderer to allocate an enormous canvas.
 */

type Client = SupabaseClient<Database>
type TemplateRow = Database['public']['Tables']['event_design_templates']['Row']

const BUCKET = 'event-templates'
const MIN_EDGE = 64
const MAX_EDGE = 8000
/** How long a preview URL stays usable. Long enough to render, short enough to expire. */
const SIGNED_URL_TTL_SECONDS = 60 * 30

type StoredPlaceholder = {
  x: number
  y: number
  width: number
  height: number
  field: TemplateField | null
}

export type PlaceholderRectWithField = {
  x: number
  y: number
  width: number
  height: number
  field: TemplateField | null
}

function toRecord(row: TemplateRow, signedUrl: string): CustomTemplateRecord {
  const placeholders = (row.placeholders as unknown as StoredPlaceholder[]).map((entry) => ({
    x: entry.x,
    y: entry.y,
    width: entry.width,
    height: entry.height,
    field: entry.field ?? null,
  }))

  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CustomTemplateRecord['kind'],
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    placeholders,
    signedUrl,
    createdAt: row.created_at,
  }
}

async function signTemplateUrl(client: Client, storagePath: string): Promise<string> {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error) throw error
  return data.signedUrl
}

/** Every custom template for an event, optionally narrowed to one design kind. */
export async function listCustomTemplates(
  eventId: string,
  kind?: CustomTemplateRecord['kind']
): Promise<CustomTemplateRecord[]> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  let query = client
    .from('event_design_templates')
    .select(
      'id, event_id, name, kind, storage_path, image_width, image_height, placeholders, created_at'
    )
    .eq('event_id', eventId)

  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as TemplateRow[]
  const records: CustomTemplateRecord[] = []
  for (const row of rows) {
    records.push(toRecord(row, await signTemplateUrl(client, row.storage_path)))
  }
  return records
}

/**
 * Uploads artwork and stores its mapping in one step.
 *
 * The organizer maps fields in the same request that saves the image, so a
 * half-configured template — artwork with no mapping — never becomes visible in
 * the picker.
 */
export async function uploadCustomTemplate(
  values: UploadTemplateValues,
  file: File,
  imageSize: { width: number; height: number }
): Promise<CustomTemplateRecord> {
  const event = await getOwnedEvent(values.eventId)
  const client = await createClient()

  if (file.size === 0) {
    throw new AppError(ACTION_ERROR_CODES.VALIDATION_FAILED, 'That file is empty.')
  }

  if (file.size > MAX_TEMPLATE_BYTES) {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      'Templates must be 5 MB or smaller. Export a smaller PNG and try again.'
    )
  }

  // The type is checked from the bytes. A browser-declared MIME type proves
  // nothing, and a template is decoded and drawn straight into a canvas.
  const sniffed = sniffImageType(await readHeaderBytes(file))
  if (sniffed !== 'image/png') {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      'Upload a PNG file. PSD and PDF files are not supported — export your design as a PNG.'
    )
  }

  if (file.type && file.type !== TEMPLATE_MIME) {
    throw new AppError(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      'Upload a PNG file. PSD and PDF files are not supported — export your design as a PNG.'
    )
  }

  assertUsableDimensions(imageSize)

  const storagePath = `${event.organizer_id}/${event.id}/templates/${crypto.randomUUID()}.png`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: TEMPLATE_MIME,
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) {
    throw new AppError(
      ACTION_ERROR_CODES.INTERNAL_ERROR,
      'The template could not be uploaded. Please try again.'
    )
  }

  const placeholders = values.placeholders.map((entry) => ({
    x: entry.x,
    y: entry.y,
    width: entry.width,
    height: entry.height,
    field: entry.field,
  }))

  const { data, error } = await client
    .from('event_design_templates')
    .insert({
      event_id: event.id,
      name: values.name,
      kind: values.kind,
      storage_path: storagePath,
      image_width: imageSize.width,
      image_height: imageSize.height,
      placeholders,
    })
    .select(
      'id, event_id, name, kind, storage_path, image_width, image_height, placeholders, created_at'
    )
    .single()

  if (error) {
    // Do not leave an orphaned object behind if the row could not be written.
    await client.storage
      .from(BUCKET)
      .remove([storagePath])
      .catch(() => {})
    throw error
  }

  return toRecord(data as TemplateRow, await signTemplateUrl(client, storagePath))
}

/** Updates the field mapping. The artwork is untouched. */
export async function saveCustomTemplateConfig(
  eventId: string,
  templateId: string,
  placeholders: readonly PlaceholderRectWithField[]
): Promise<CustomTemplateRecord> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  const { data, error } = await client
    .from('event_design_templates')
    .update({
      placeholders: placeholders.map((entry) => ({
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
        field: entry.field,
      })),
    })
    .eq('id', templateId)
    .eq('event_id', eventId)
    .select(
      'id, event_id, name, kind, storage_path, image_width, image_height, placeholders, created_at'
    )
    .single()

  if (error) throw error

  const row = data as TemplateRow
  return toRecord(row, await signTemplateUrl(client, row.storage_path))
}

export async function deleteCustomTemplate(eventId: string, templateId: string): Promise<void> {
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

/**
 * Rejects an implausible canvas.
 *
 * The client reports the size it decoded, but the value is untrusted: a
 * template of 200000px would ask the renderer for a canvas far beyond what a
 * browser will allocate, and the failure would surface as an unexplained render
 * error rather than a validation message.
 */
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

export { PLACEHOLDER_HEX }
