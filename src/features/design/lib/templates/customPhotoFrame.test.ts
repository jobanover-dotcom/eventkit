import { describe, expect, it } from 'vitest'
import { createFakeContext } from '@/features/design/lib/canvas/fakeContext'
import { PHOTO_PLACEHOLDER_HEX } from '@/features/design/lib/canvas/colorKey'
import {
  buildCustomPhotoFrameTemplate,
  drawMaskedPhoto,
  type CustomPhotoFrameSource,
} from '@/features/design/lib/templates/customPhotoFrame'
import { SAMPLE_EVENT, SAMPLE_PHOTO_FRAME_DATA } from '@/features/design/lib/sampleData'
import type { DesignImages } from '@/features/design/lib/types'

/**
 * Custom photo frame compositing, asserted with the same recording fake
 * context the built-in templates use.
 *
 * The properties that matter: the photo is masked to the key area rather than
 * covering the frame, the composite op is scoped so it cannot erase the frame,
 * and the key colour itself never reaches the output.
 */

const WIDTH = 1080
const HEIGHT = 1350
const BOUNDS = { x: 100, y: 200, width: 400, height: 500 }

/**
 * A context-free canvas. jsdom has the element but no 2D implementation, and
 * `sourceSize` only reads its dimensions, which is all `drawCover` needs to
 * work out the cover crop and hand the rest to the recording context.
 */
function image(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function source(overrides: Partial<CustomPhotoFrameSource> = {}): CustomPhotoFrameSource {
  return {
    frame: image(WIDTH, HEIGHT),
    mask: image(WIDTH, HEIGHT),
    width: WIDTH,
    height: HEIGHT,
    bounds: BOUNDS,
    ...overrides,
  }
}

const WITH_PHOTO: DesignImages = { photo: image(900, 600) }
const NO_PHOTO: DesignImages = {}

describe('drawMaskedPhoto', () => {
  it('masks the photo through the key area', () => {
    const ctx = createFakeContext()
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO, source())

    const ops = ctx.calls.map((call) => call.op)
    const photoAt = ops.indexOf('drawImage')
    const compositeAt = ops.indexOf('globalCompositeOperation')
    const maskAt = ops.lastIndexOf('drawImage')

    // Cover-crop first, then the composite, then the mask. The order is the
    // whole mechanism: `destination-in` has to come after the photo exists and
    // before the mask is applied.
    expect(photoAt).toBeGreaterThan(-1)
    expect(compositeAt).toBeGreaterThan(photoAt)
    expect(maskAt).toBeGreaterThan(compositeAt)
  })

  it('applies the mask with destination-in', () => {
    const ctx = createFakeContext()
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO, source())

    const applied = ctx.calls.filter(
      (call) => call.op === 'globalCompositeOperation' && call.args[0] === 'destination-in'
    )
    expect(applied).toHaveLength(1)
  })

  it('restores source-over, so the mask cannot bleed into later drawing', () => {
    const ctx = createFakeContext()
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO, source())

    const values = ctx.calls
      .filter((call) => call.op === 'globalCompositeOperation')
      .map((call) => call.args[0])
    expect(values).toEqual(['destination-in', 'source-over'])
  })

  it('scopes the composite op inside a save and restore pair', () => {
    const ctx = createFakeContext()
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO, source())

    const ops = ctx.calls.map((call) => call.op)
    const compositeAt = ops.indexOf('globalCompositeOperation')
    // Draws the frame's own state before, and hands it back after.
    expect(ops.lastIndexOf('save')).toBeLessThan(compositeAt)
    expect(ops.lastIndexOf('restore')).toBeGreaterThan(compositeAt)
  })

  it('keeps the photo inside the masked area', () => {
    const ctx = createFakeContext()
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO, source())

    const drawn = ctx.imageRects()
    // Two draws land here: the cover-cropped photo, then the full-frame mask.
    // The photo is the one the clip applies to.
    const photo = drawn[0]
    expect(photo).toBeDefined()
    expect(photo?.left).toBeGreaterThanOrEqual(BOUNDS.x)
    expect(photo?.right).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width)
    expect(photo?.top).toBeGreaterThanOrEqual(BOUNDS.y)
    expect(photo?.bottom).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height)
  })

  it('draws the mask across the whole frame, not just the bounds', () => {
    const ctx = createFakeContext()
    const mask = image(WIDTH, HEIGHT)
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO, source({ mask }))

    // The mask is a full-frame alpha layer; drawing it only inside the bounds
    // would be the same as drawing a rectangle.
    const maskCall = ctx.calls.filter((call) => call.op === 'drawImage').at(-1)
    expect(maskCall?.args.slice(1)).toEqual([0, 0, WIDTH, HEIGHT])
  })

  it('fills the masked area with a neutral tone when no photo is chosen', () => {
    const ctx = createFakeContext()
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, NO_PHOTO, source())

    const fill = ctx.calls.find((call) => call.op === 'fillRect')
    expect(fill?.args).toEqual([BOUNDS.x, BOUNDS.y, BOUNDS.width, BOUNDS.height])
    // Still masked, so the fill cannot spill past the photo area.
    expect(ctx.calls.some((call) => call.op === 'globalCompositeOperation')).toBe(true)
  })

  it('never emits the key colour', () => {
    const ctx = createFakeContext()
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, NO_PHOTO, source())
    drawMaskedPhoto(createFakeContext(), SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO, source())

    const emitted = JSON.stringify(ctx.calls).toLowerCase()
    expect(emitted).not.toContain(PHOTO_PLACEHOLDER_HEX)
  })

  it('draws nothing at all when the artwork has no key colour', () => {
    const ctx = createFakeContext()
    drawMaskedPhoto(ctx, SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO, source({ bounds: null }))

    expect(ctx.calls).toHaveLength(0)
  })
})

describe('buildCustomPhotoFrameTemplate', () => {
  it("describes a photo frame at the frame's own dimensions", () => {
    const template = buildCustomPhotoFrameTemplate({
      id: 'custom-photo-frame-1',
      name: 'Graduation Arch',
      frame: image(1200, 1500),
      width: 1200,
      height: 1500,
      mask: null,
    })

    expect(template).toMatchObject({
      id: 'custom-photo-frame-1',
      name: 'Graduation Arch',
      kind: 'photo_frame',
      width: 1200,
      height: 1500,
      outputs: ['png'],
    })
    // A frame is a social image, not paper, so it must not claim a PDF page.
    expect(template.page).toBeUndefined()
  })

  it('tells the organizer the key colour is what the photo replaces', () => {
    const template = buildCustomPhotoFrameTemplate({
      id: 'custom-photo-frame-2',
      name: 'Graduation Arch',
      frame: image(1080, 1350),
      width: 1080,
      height: 1350,
      mask: null,
    })

    expect(template.blurb).toContain(PHOTO_PLACEHOLDER_HEX)
  })

  it('draws the frame artwork untouched', () => {
    const template = buildCustomPhotoFrameTemplate({
      id: 'custom-photo-frame-3',
      name: 'Graduation Arch',
      frame: image(1080, 1350),
      width: 1080,
      height: 1350,
      mask: null,
    })

    const ctx = createFakeContext()
    template.draw(ctx, SAMPLE_PHOTO_FRAME_DATA, NO_PHOTO)

    const first = ctx.calls.find((call) => call.op === 'drawImage')
    expect(first?.args.slice(1)).toEqual([0, 0, 1080, 1350])
  })

  it('renders the frame alone when there is no key colour to mask into', () => {
    // The mask is derived from the stored artwork, so artwork without a key
    // colour is simply a frame with no photo area. It must not throw, and it
    // must not invent a photo area.
    const template = buildCustomPhotoFrameTemplate({
      id: 'custom-photo-frame-4',
      name: 'No Placeholder',
      frame: image(1080, 1350),
      width: 1080,
      height: 1350,
      mask: null,
    })

    const ctx = createFakeContext()
    expect(() => template.draw(ctx, SAMPLE_PHOTO_FRAME_DATA, WITH_PHOTO)).not.toThrow()
    expect(ctx.calls.some((call) => call.op === 'globalCompositeOperation')).toBe(false)
  })
})

describe('SAMPLE_PHOTO_FRAME_DATA', () => {
  it('is a photo frame design the custom renderer can be driven with', () => {
    expect(SAMPLE_PHOTO_FRAME_DATA.event).toBe(SAMPLE_EVENT)
  })
})
