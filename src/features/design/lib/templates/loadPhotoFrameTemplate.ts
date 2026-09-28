import type { DesignTemplate } from '@/features/design/lib/types'
import type { PhotoFrameData } from '@/features/design/types'
import { loadImage } from '@/features/design/lib/render'
import {
  buildCustomPhotoFrameTemplate,
  detectPhotoFrameMask,
} from '@/features/design/lib/templates/customPhotoFrame'
import type { PhotoFrameTemplate } from '@/features/design/services/photoFrameTemplateService'

/**
 * Everything the browser needs to turn a stored frame into a drawable template.
 *
 * Narrower than the organizer's `PhotoFrameTemplate` on purpose. The loader
 * never reads `designConfig` — a frame's photo area is derived from the artwork's
 * pixels, not from the stored column — so demanding it would only push a value
 * the renderer ignores across the network. On the public page that value would
 * also be serialized into the HTML every visitor receives, which is more than
 * they need to make their own photo.
 *
 * A full organizer record still satisfies this structurally, so both paths share
 * one loader unchanged.
 */
export type LoadablePhotoFrame = Pick<
  PhotoFrameTemplate,
  'id' | 'name' | 'imageWidth' | 'imageHeight' | 'signedUrl' | 'updatedAt'
>

/**
 * Turns a stored frame into a live `DesignTemplate` in the browser.
 *
 * The records are fetched on the server and passed down as props — the storage
 * service is `server-only` and must never reach a client bundle. All that is
 * left here is to decode the signed artwork URL, find the key colour in it, and
 * wrap the result in the same template shape a built-in frame has, which is what
 * lets a custom frame flow through the existing picker, preview, and exporter
 * untouched.
 *
 * **The mask is derived here, from the artwork that is actually loaded.** The
 * stored configuration says nothing about where the photo area is, so a frame's
 * photo area is whatever key colour its own PNG contains. Artwork with none
 * still produces a usable template — it just has no photo area, which the
 * organizer sees in the preview rather than being told about here.
 *
 * Detection runs against whatever `loadImage` returned, which is a downscaled
 * canvas for artwork over its size limit. Detecting against the file's own pixel
 * grid would leave the mask misaligned with the artwork being drawn.
 *
 * A frame whose artwork will not decode resolves to null and is skipped: a
 * signed URL that expired mid-session should drop one option from the list, not
 * break the photo frame page.
 */
export async function loadPhotoFrameTemplate(
  template: LoadablePhotoFrame
): Promise<DesignTemplate<PhotoFrameData> | null> {
  const frame = await loadImage(template.signedUrl)
  if (!frame) return null

  return buildCustomPhotoFrameTemplate({
    id: template.id,
    name: template.name,
    frame,
    width: template.imageWidth,
    height: template.imageHeight,
    mask: detectPhotoFrameMask(frame),
  })
}

export async function loadPhotoFrameTemplates(
  templates: readonly LoadablePhotoFrame[]
): Promise<DesignTemplate<PhotoFrameData>[]> {
  const loaded = await Promise.all(templates.map((template) => loadPhotoFrameTemplate(template)))
  return loaded.filter((template): template is DesignTemplate<PhotoFrameData> => template !== null)
}
