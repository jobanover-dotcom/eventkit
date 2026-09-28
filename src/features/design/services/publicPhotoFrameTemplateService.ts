import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { LoadablePhotoFrame } from '@/features/design/lib/templates/loadPhotoFrameTemplate'

/**
 * The public read of an organizer's custom photo frames.
 *
 * Deliberately separate from `photoFrameTemplateService`, which is the
 * organizer-only path: that one proves ownership through `getOwnedEvent` and
 * returns a template whatever its kind. This one has no session to check, because
 * a visitor has none, and it returns only frames of an event the visitor can
 * already see.
 *
 * **How the read is permitted.** `anon` has no grant and no policy on
 * `event_design_templates`, and the `event-templates` bucket is private with an
 * organizer-only select policy. Rather than widen either, migration 00006 adds two
 * `security definer` functions that carry their own authorization, following the
 * pattern `get_certificate_verification` already established:
 *
 *   * `get_public_photo_frame_templates(event)` returns the frame metadata for a
 *     visible event, and
 *   * `is_public_photo_frame_artwork(path)` is what a new `anon` select policy on
 *     the bucket calls, so the artwork bytes are reachable for exactly those
 *     frames and nothing else in the bucket.
 *
 * The signed URL is then minted here through the Storage API, as the organizer
 * path does, from the storage path the function returned.
 *
 * **Nothing about the visitor.** There is no participant lookup, no registration,
 * and no write of any kind. A visitor's own photo never reaches this module; it
 * stays in their browser.
 */

/** Long enough to decode, draw, and download; short enough to be a dead link soon. */
const SIGNED_URL_TTL_SECONDS = 60 * 30

type PublicFrameRow = {
  template_id: string
  template_name: string
  image_width: string
  image_height: string
  artwork_path: string
  updated_at: string
}

/**
 * The public event's custom photo frames, newest first.
 *
 * Returns an empty list rather than throwing on any failure. This is a page
 * enhancement: a visitor can make a photo with the built-in frames whatever
 * happens here, and a public page that 500s because a template read failed would
 * be a worse outcome than a page offering fewer frames. The organizer's own view
 * still surfaces the failure, so it is not hidden.
 */
export async function listPublicPhotoFrameTemplates(
  eventId: string
): Promise<LoadablePhotoFrame[]> {
  const client = await createClient()

  const { data, error } = await client.rpc('get_public_photo_frame_templates', {
    p_event_id: eventId,
  })

  if (error) {
    // A missing function means migration 00006 has not been applied. That is a
    // deployment state, not a user error, so it is logged and treated as "this
    // event has no custom frames" rather than surfaced.
    logger.warn('public_photo_frame_templates_unavailable', {
      code: error.code,
      message: error.message,
    })
    return []
  }

  const rows = (data ?? []) as PublicFrameRow[]
  const templates: LoadablePhotoFrame[] = []

  for (const row of rows) {
    const { data: signed, error: signError } = await client.storage
      .from('event-templates')
      .createSignedUrl(row.artwork_path, SIGNED_URL_TTL_SECONDS)

    // One unreadable artwork must not cost the visitor the other frames, so this
    // skips the row and carries on.
    if (signError || !signed?.signedUrl) {
      logger.warn('public_photo_frame_artwork_unreadable', { message: signError?.message })
      continue
    }

    templates.push({
      id: row.template_id,
      name: row.template_name,
      // The generated types report `integer` as a string, so these are parsed
      // rather than trusted as already-numeric.
      imageWidth: Number(row.image_width),
      imageHeight: Number(row.image_height),
      signedUrl: signed.signedUrl,
      // Coerced rather than assigned: the generated type says `string`, which is
      // what supabase-js returns over JSON, but a Postgres driver would hand back
      // a Date. The value is only ever read as part of the reload key, and
      // asserting the shape we depend on is cheaper than debugging a `[object
      // Object]` in a template key later.
      updatedAt: String(row.updated_at),
    })
  }

  return templates
}
