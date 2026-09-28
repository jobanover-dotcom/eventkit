import 'server-only'
import { getOwnedEvent } from '@/features/events/services/eventService'
import { createClient } from '@/lib/supabase/server'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import {
  createTemplate,
  deleteTemplate,
  getTemplateRow,
  listTemplateRows,
  renameTemplate,
  signTemplateUrl,
  type TemplateRow,
} from '@/features/design/services/designTemplateStore'
import {
  parsePhotoFrameDesignConfig,
  type PhotoFrameDesignConfig,
} from '@/features/design/schemas/photoFrameConfig'

/**
 * Custom photo frame templates: storage and persistence.
 *
 * The same private-bucket, untouched-bytes arrangement as custom certificates,
 * over the shared store in `designTemplateStore`. What differs is entirely on
 * the client: a frame's photo area is its key colour, and that mask is derived
 * from the artwork when the template is loaded to render. Nothing is stored
 * about it, so this service only has to hand back the artwork and its
 * coordinates.
 *
 * A photo never touches this module. The attendee's picture is chosen in the
 * browser and never uploaded.
 */

export type PhotoFrameTemplate = {
  id: string
  name: string
  imageWidth: number
  imageHeight: number
  designConfig: PhotoFrameDesignConfig
  /** Short-lived URL for the private artwork. Never a public bucket URL. */
  signedUrl: string
  createdAt: string
  updatedAt: string
}

function toTemplate(row: TemplateRow, signedUrl: string): PhotoFrameTemplate {
  const config = parsePhotoFrameDesignConfig(row.design_config)

  if (!config) {
    // Unreachable through the application, which validates before writing. A row
    // edited by hand must not take the photo frame page down with it.
    throw new AppError(
      ACTION_ERROR_CODES.CONFIG_MISSING,
      'This frame’s saved layout is not usable. Re-upload it.'
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

/** Every custom photo frame for an event, newest first. */
export async function listPhotoFrameTemplates(eventId: string): Promise<PhotoFrameTemplate[]> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  const rows = await listTemplateRows(client, eventId, 'photo_frame')
  const templates: PhotoFrameTemplate[] = []
  for (const row of rows) {
    templates.push(toTemplate(row, await signTemplateUrl(client, row.storage_path)))
  }
  return templates
}

export async function getPhotoFrameTemplate(
  eventId: string,
  templateId: string
): Promise<PhotoFrameTemplate> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  const row = await getTemplateRow(client, eventId, templateId)
  return toTemplate(row, await signTemplateUrl(client, row.storage_path))
}

/**
 * Stores the organizer's frame artwork, exactly as uploaded.
 *
 * The key colour is not a claim about the artwork — whether the frame actually
 * has a photo area is decided from the stored PNG when it is loaded to render.
 */
export async function createPhotoFrameTemplate(input: {
  eventId: string
  name: string
  imageSize: { width: number; height: number }
  designConfig: PhotoFrameDesignConfig
  file: Blob
}): Promise<PhotoFrameTemplate> {
  const event = await getOwnedEvent(input.eventId)
  const client = await createClient()

  const row = await createTemplate({
    client,
    event,
    kind: 'photo_frame',
    name: input.name,
    imageSize: input.imageSize,
    designConfig: input.designConfig,
    file: input.file,
    logScope: 'photo_frame_template',
  })

  return toTemplate(row, await signTemplateUrl(client, row.storage_path))
}

/** Renames a frame. Its artwork is untouched, so no re-upload is needed. */
export async function renamePhotoFrameTemplate(input: {
  eventId: string
  templateId: string
  name: string
}): Promise<PhotoFrameTemplate> {
  await getOwnedEvent(input.eventId)
  const client = await createClient()

  const row = await renameTemplate({ client, ...input })
  return toTemplate(row, await signTemplateUrl(client, row.storage_path))
}

/**
 * Deletes a frame: the row and its private object.
 *
 * Nothing already produced refers to a frame — a rendered photo is a file the
 * organizer downloaded, not a record here — so what is lost is the saved
 * design.
 */
export async function deletePhotoFrameTemplate(eventId: string, templateId: string): Promise<void> {
  await getOwnedEvent(eventId)
  const client = await createClient()

  await deleteTemplate(client, eventId, templateId)
}
