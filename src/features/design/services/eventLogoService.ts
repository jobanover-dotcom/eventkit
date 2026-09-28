import 'server-only'
import { getOwnedEvent } from '@/features/events/services/eventService'
import { createClient } from '@/lib/supabase/server'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'
import { readHeaderBytes, sniffAcceptedImageType } from '@/features/info/lib/imageType'
import { ACCEPTED_IMAGE_TYPES } from '@/features/design/schemas/design.schema'
import { formatMegabytes, MAX_UPLOAD_BYTES } from '@/lib/uploadLimits'

/**
 * The event's logo, used by every design.
 *
 * The column and the bucket both already existed — `events.logo_url`, and the
 * public `event-assets` bucket the venue map uses — but nothing ever wrote the
 * column, so the badge template's logo area always fell through to its monogram
 * fallback. This is the write, and nothing more: no new bucket, no new column, no
 * new table.
 *
 * Modelled on `uploadEventMap`, which does the same job for a different image on
 * the same bucket. The parts worth keeping identical are the byte sniffing (a
 * declared `File.type` is browser-supplied, so a script renamed `.png` arrives
 * claiming to be an image), the server-generated path (never a client-supplied
 * name, so there is no traversal to defend), the orphaned-object cleanup when the
 * row cannot be written, and the organizer-prefix check before deleting anything.
 *
 * The upload runs on the caller's own session rather than a service-role key, so
 * the bucket's write policy is a real second check and not a bypassed one.
 */

const EXTENSION_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

const BUCKET = 'event-assets'

export async function uploadEventLogo(eventId: string, file: File): Promise<{ logoUrl: string }> {
  const event = await getOwnedEvent(eventId)
  const client = await createClient()

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new AppError(ACTION_ERROR_CODES.UPLOAD_REJECTED, 'Choose a PNG, JPEG, or WebP image.')
  }

  if (file.size === 0) {
    throw new AppError(ACTION_ERROR_CODES.UPLOAD_REJECTED, 'That file is empty.')
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(
      ACTION_ERROR_CODES.UPLOAD_REJECTED,
      `The logo must be ${formatMegabytes(MAX_UPLOAD_BYTES)} or smaller.`
    )
  }

  // The declared type is client-supplied, so the bytes decide. This is also the
  // only check available here: a Server Action handles the file on the server,
  // where `createImageBitmap` does not exist in Node.
  const header = await readHeaderBytes(file)
  const actualType = sniffAcceptedImageType(header)

  if (!actualType) {
    throw new AppError(
      ACTION_ERROR_CODES.UPLOAD_REJECTED,
      'That file is not a PNG, JPEG, or WebP image.'
    )
  }

  // A declared type that disagrees with the bytes means a renamed file, which is
  // never a legitimate upload.
  if (file.type !== actualType) {
    throw new AppError(ACTION_ERROR_CODES.UPLOAD_REJECTED, 'That file is not a valid image.')
  }

  const extension = EXTENSION_BY_TYPE[actualType]
  const objectPath = `${event.organizer_id}/${event.id}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(objectPath, file, { contentType: actualType, upsert: false })

  if (uploadError) {
    // Logged rather than returned: storage errors can carry bucket policy text
    // that has no business in front of an organizer.
    throw new AppError(
      ACTION_ERROR_CODES.UPLOAD_REJECTED,
      'The logo could not be uploaded. Please try again.'
    )
  }

  // Synchronous and unable to fail — it builds the URL for a bucket that is
  // `public: true`, so a sessionless browser can read it back.
  const { data: urlData } = client.storage.from(BUCKET).getPublicUrl(objectPath)
  const publicUrl = urlData.publicUrl

  if (!publicUrl) {
    await client.storage
      .from(BUCKET)
      .remove([objectPath])
      .catch(() => undefined)
    throw new AppError(ACTION_ERROR_CODES.INTERNAL_ERROR, 'The logo could not be published.')
  }

  const { error: updateError } = await client
    .from('events')
    .update({ logo_url: publicUrl })
    .eq('id', event.id)

  if (updateError) {
    // Never leave an orphaned object behind if the row could not be pointed at it.
    await client.storage
      .from(BUCKET)
      .remove([objectPath])
      .catch(() => undefined)
    throw new AppError(ACTION_ERROR_CODES.INTERNAL_ERROR, 'The logo could not be saved.')
  }

  // Best effort: the previous logo is superseded, but failing to delete it must
  // not fail an otherwise successful upload.
  if (event.logo_url) await removeSupersededLogo(client, event.logo_url, event.organizer_id)

  return { logoUrl: publicUrl }
}

/**
 * Clears the event logo, so designs fall back to their monogram.
 *
 * The object goes with it, but only after the row no longer points at it, so a
 * failed delete leaves an unreferenced file rather than a design referencing a
 * deleted one.
 */
export async function removeEventLogo(eventId: string): Promise<void> {
  const event = await getOwnedEvent(eventId)
  const client = await createClient()

  if (!event.logo_url) return

  const { error } = await client.from('events').update({ logo_url: null }).eq('id', event.id)
  if (error) {
    throw new AppError(ACTION_ERROR_CODES.INTERNAL_ERROR, 'The logo could not be removed.')
  }

  await removeSupersededLogo(client, event.logo_url, event.organizer_id)
}

/**
 * Deletes the object behind a previous `logo_url`, ignoring any failure.
 *
 * The path is re-derived from the URL and then required to sit under the
 * organizer's own prefix, so a hand-edited `logo_url` pointing at somebody else's
 * object can never turn a replace or a remove into a delete of another
 * organizer's file.
 */
async function removeSupersededLogo(
  client: Awaited<ReturnType<typeof createClient>>,
  previousUrl: string,
  organizerId: string
): Promise<void> {
  const marker = '/object/public/event-assets/'
  const index = previousUrl.indexOf(marker)
  if (index === -1) return

  let path: string
  try {
    path = decodeURIComponent(previousUrl.slice(index + marker.length))
  } catch {
    return
  }

  if (!path.startsWith(`${organizerId}/`)) return
  if (path.includes('..')) return

  await client.storage
    .from(BUCKET)
    .remove([path])
    .catch(() => undefined)
}
