import { describe, expect, it } from 'vitest'
import { PHOTO_PLACEHOLDER_HEX } from '@/features/design/lib/canvas/colorKey'
import {
  defaultPhotoFrameConfig,
  parsePhotoFrameDesignConfig,
  photoFrameDesignConfigSchema,
} from '@/features/design/schemas/photoFrameConfig'

/**
 * A custom photo frame's saved configuration.
 *
 * The properties worth pinning: the key colour is the product's, and the shape
 * of the config carries no claim about the artwork. A frame's photo area is
 * derived from the stored PNG when it is loaded to render, so a row that claims
 * otherwise has to be impossible to write here rather than merely ignored.
 */

describe('defaultPhotoFrameConfig', () => {
  it('uses the contract key colour', () => {
    expect(defaultPhotoFrameConfig().photoFrame.keyColor).toBe(PHOTO_PLACEHOLDER_HEX)
  })

  it('carries the two keys the design_config CHECK requires', () => {
    const config = defaultPhotoFrameConfig()
    // Migration 0003's CHECK is unconditional across kinds and was left in place
    // deliberately. These are the accommodation, and nothing reads them.
    expect(config.recipientName).toEqual({})
    expect(config.certificateType).toEqual({})
    expect(photoFrameDesignConfigSchema.safeParse(config).success).toBe(true)
  })

  it('records nothing about the artwork itself', () => {
    // No detected flag, no pixel count, no bounds, no mask. The photo area is
    // read back out of the PNG, so none of these could be trusted if present.
    const config = defaultPhotoFrameConfig() as Record<string, unknown>
    const frame = config.photoFrame as Record<string, unknown>
    expect(Object.keys(frame)).toEqual(['keyColor'])
    expect(JSON.stringify(config)).not.toMatch(/pixel|bounds|mask|hasPhoto|found/i)
  })
})

describe('parsePhotoFrameDesignConfig', () => {
  it('round-trips a written config', () => {
    const config = defaultPhotoFrameConfig()
    expect(parsePhotoFrameDesignConfig(config)).toEqual(config)
  })

  it('falls back to the contract colour when a row predates the key', () => {
    const parsed = parsePhotoFrameDesignConfig({ recipientName: {}, certificateType: {} })
    expect(parsed?.photoFrame.keyColor).toBe(PHOTO_PLACEHOLDER_HEX)
  })

  it('tolerates a hand-edited row that dropped the vestigial keys', () => {
    // Optional on read, so a row edited in the dashboard still loads.
    const parsed = parsePhotoFrameDesignConfig({ photoFrame: { keyColor: '#22ff00' } })
    expect(parsed?.photoFrame.keyColor).toBe(PHOTO_PLACEHOLDER_HEX)
  })

  it('keeps a stored key colour, so the column can describe itself', () => {
    const parsed = parsePhotoFrameDesignConfig({
      recipientName: {},
      certificateType: {},
      photoFrame: { keyColor: '#00ff7f' },
    })
    expect(parsed?.photoFrame.keyColor).toBe('#00ff7f')
  })

  it('rejects a malformed key colour rather than storing it', () => {
    expect(
      parsePhotoFrameDesignConfig({
        recipientName: {},
        certificateType: {},
        photoFrame: { keyColor: 'chroma' },
      })
    ).toBeNull()
  })

  it('returns null rather than throwing on junk, so one bad row cannot take down the page', () => {
    expect(parsePhotoFrameDesignConfig(null)).toBeNull()
    expect(parsePhotoFrameDesignConfig('nonsense')).toBeNull()
    expect(parsePhotoFrameDesignConfig(42)).toBeNull()
    expect(parsePhotoFrameDesignConfig({ photoFrame: 'not-an-object' })).toBeNull()
  })

  it('ignores extra keys, so a certificate row cannot become a frame row', () => {
    // A certificate's text layers are not a frame's configuration. It still
    // parses, because the frame's own fields are what the renderer reads, but
    // nothing certificate-specific is carried forward.
    const parsed = parsePhotoFrameDesignConfig({
      recipientName: {},
      certificateType: {},
      textLayers: [{ id: 'a', field: 'recipientName', x: 0 }],
    })
    expect(parsed).not.toBeNull()
    expect(parsed && 'textLayers' in parsed).toBe(false)
  })
})
