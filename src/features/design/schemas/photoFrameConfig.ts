import { z } from 'zod'
import { PHOTO_PLACEHOLDER_HEX } from '@/features/design/lib/canvas/colorKey'

/**
 * The saved configuration of a custom photo frame.
 *
 * A custom frame is the organizer's PNG, used exactly as uploaded. The single
 * thing EventKit needs to know is which colour marks the photo area — and
 * even that is fixed by the product contract rather than chosen per template.
 * It is stored so the configuration is self-describing and so a future
 * multi-key frame needs no column change; on read it falls back to the
 * contract colour, so a row written before it existed still loads.
 *
 * **No detection result is stored.** Nothing here records whether a photo area
 * was found, how many pixels matched, or where the mask ended up. That is
 * deliberate: the mask is derived from the artwork at render time, so a client
 * cannot assert a photo area into existence by writing a flag. Artwork with no
 * key colour in it simply renders with no photo.
 *
 * The two sibling keys are **vestigial**. Migration 0003 attached an
 * unconditional CHECK to `design_config` on this table requiring
 * `recipientName` and `certificateType` to be present as objects, written back
 * when the certificate editor still located fixed placeholder rectangles.
 * Nothing in the application reads them for either kind. They are kept so the
 * live constraint stays satisfied without a database migration, and they are
 * optional on read so a hand-edited row that drops them still loads.
 */
export type PhotoFrameDesignConfig = {
  recipientName: Record<string, never>
  certificateType: Record<string, never>
  photoFrame: {
    keyColor: string
  }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** The two keys migration 0003's CHECK requires, optional on read. */
const vestigialLayerKey = z.object({}).passthrough().optional()

export const photoFrameDesignConfigSchema = z.object({
  recipientName: vestigialLayerKey,
  certificateType: vestigialLayerKey,
  photoFrame: z
    .object({
      keyColor: z.string().regex(HEX_COLOR, 'Choose a colour like #22ff00.'),
    })
    .optional(),
})

export type PhotoFrameDesignConfigInput = z.input<typeof photoFrameDesignConfigSchema>
export type PhotoFrameDesignConfigOutput = z.output<typeof photoFrameDesignConfigSchema>

/** The configuration written for every new custom photo frame. */
export function defaultPhotoFrameConfig(): PhotoFrameDesignConfig {
  return {
    recipientName: {},
    certificateType: {},
    photoFrame: { keyColor: PHOTO_PLACEHOLDER_HEX },
  }
}

/**
 * Parses a stored `jsonb` value, returning null rather than throwing.
 *
 * A row written by an older build, or edited by hand in the dashboard, must not
 * be able to take down the photo frame page. Returning null lets the caller skip
 * that one template and carry on with the rest.
 */
export function parsePhotoFrameDesignConfig(value: unknown): PhotoFrameDesignConfig | null {
  const parsed = photoFrameDesignConfigSchema.safeParse(value)
  if (!parsed.success) return null

  return {
    recipientName: {},
    certificateType: {},
    photoFrame: { keyColor: parsed.data.photoFrame?.keyColor ?? PHOTO_PLACEHOLDER_HEX },
  }
}
