import { describe, expect, it } from 'vitest'
import {
  MIN_LAYER_SIZE,
  RESIZE_HANDLES,
  clampLayer,
  emptyConfig,
  moveLayer,
  newTextLayer,
  resizeLayer,
  scaleToDisplay,
  scaleToImage,
  snapLayer,
  snapTolerance,
  snapValue,
  type ResizeHandle,
} from './geometry'
import type { CertificateBounds, TextLayer } from './types'

/**
 * Editor geometry, asserted without a browser.
 *
 * The drag and resize code is the part of a template editor most likely to be
 * quietly wrong — an off-by-one in a clamp, a resize that inverts the box, a
 * coordinate stored in screen pixels. All of it is pure arithmetic here, so it
 * can be pinned exactly rather than eyeballed in a canvas.
 */

const BOUNDS: CertificateBounds = { width: 1920, height: 1080 }

let nextId = 0
function layer(overrides: Partial<TextLayer> = {}): TextLayer {
  nextId += 1
  return {
    id: `layer-${nextId}`,
    field: 'recipientName',
    x: 400,
    y: 400,
    width: 800,
    height: 120,
    fontFamily: 'inter',
    fontSize: 42,
    fontWeight: 700,
    italic: false,
    color: '#111111',
    horizontalAlign: 'center',
    verticalAlign: 'middle',
    letterSpacing: 0,
    lineHeight: 1.1,
    ...overrides,
  }
}

describe('clampLayer', () => {
  it('leaves a layer that already fits alone', () => {
    const inside = layer()
    expect(clampLayer(inside, BOUNDS)).toEqual(inside)
  })

  it('keeps a layer inside the right edge', () => {
    const result = clampLayer(layer({ x: 1800 }), BOUNDS)
    expect(result.x + result.width).toBeLessThanOrEqual(BOUNDS.width)
  })

  it('keeps a layer inside the bottom edge', () => {
    const result = clampLayer(layer({ y: 1100 }), BOUNDS)
    expect(result.y + result.height).toBeLessThanOrEqual(BOUNDS.height)
  })

  it('refuses a negative origin', () => {
    const result = clampLayer(layer({ x: -50, y: -80 }), BOUNDS)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('shrinks a layer wider than the artwork', () => {
    const result = clampLayer(layer({ width: 4000 }), BOUNDS)
    expect(result.width).toBe(BOUNDS.width)
  })

  it('rounds to whole pixels so repeated drags do not accumulate drift', () => {
    let current = layer({ x: 400.4, y: 399.6 })
    for (let i = 0; i < 20; i += 1) current = moveLayer(current, 0.1, 0.1, BOUNDS)
    expect(Number.isInteger(current.x)).toBe(true)
    expect(Number.isInteger(current.y)).toBe(true)
  })
})

describe('moveLayer', () => {
  it('moves in both axes', () => {
    const result = moveLayer(layer(), 50, -30, BOUNDS)
    expect(result.x).toBe(450)
    expect(result.y).toBe(370)
  })

  it('will not move a layer off the artwork', () => {
    const result = moveLayer(layer({ x: 0, y: 0 }), -500, -500, BOUNDS)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('cannot move past the far edge', () => {
    const result = moveLayer(layer(), 5000, 5000, BOUNDS)
    expect(result.x + result.width).toBe(BOUNDS.width)
    expect(result.y + result.height).toBe(BOUNDS.height)
  })

  it('preserves every other field', () => {
    const before = layer({ fontSize: 33, italic: true, color: '#ff0000' })
    const result = moveLayer(before, 10, 10, BOUNDS)
    expect(result.fontSize).toBe(33)
    expect(result.italic).toBe(true)
    expect(result.color).toBe('#ff0000')
  })
})

describe('resizeLayer', () => {
  it('grows from the south-east corner', () => {
    const result = resizeLayer(layer(), 'se', 100, 50, BOUNDS)
    expect(result.width).toBe(900)
    expect(result.height).toBe(170)
    expect(result.x).toBe(400)
    expect(result.y).toBe(400)
  })

  it('keeps the north-west corner fixed', () => {
    const result = resizeLayer(layer(), 'nw', -100, -40, BOUNDS)
    expect(result.x).toBe(300)
    expect(result.y).toBe(360)
    expect(result.width).toBe(900)
    expect(result.height).toBe(160)
  })

  it('keeps the south-west corner fixed when resizing from the north-east', () => {
    // A corner drag moves the grabbed corner. The opposite one is the anchor.
    const before = layer()
    const result = resizeLayer(before, 'ne', -100, 0, BOUNDS)
    expect(result.x).toBe(before.x)
    expect(result.y + result.height).toBe(before.y + before.height)
    expect(result.width).toBe(before.width - 100)
  })

  it('keeps the north-east corner fixed when resizing from the south-west', () => {
    const before = layer()
    const result = resizeLayer(before, 'sw', 0, -50, BOUNDS)
    expect(result.y).toBe(before.y)
    expect(result.x + result.width).toBe(before.x + before.width)
    expect(result.height).toBe(before.height - 50)
  })

  it('enforces a minimum size when dragged past the opposite edge', () => {
    const result = resizeLayer(layer(), 'se', -900, -300, BOUNDS)
    expect(result.width).toBe(MIN_LAYER_SIZE)
    expect(result.height).toBe(MIN_LAYER_SIZE)
  })

  it('never inverts the box', () => {
    for (const handle of ['nw', 'ne', 'sw', 'se'] as ResizeHandle[]) {
      const result = resizeLayer(layer(), handle, -5000, -5000, BOUNDS)
      expect(result.width, `${handle} width`).toBeGreaterThanOrEqual(MIN_LAYER_SIZE)
      expect(result.height, `${handle} height`).toBeGreaterThanOrEqual(MIN_LAYER_SIZE)
    }
  })

  it('stays inside the artwork when the fixed corner is dragged out', () => {
    const result = resizeLayer(
      layer({ x: 20, y: 20, width: 200, height: 200 }),
      'nw',
      -400,
      -400,
      BOUNDS
    )
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.x + result.width).toBeLessThanOrEqual(BOUNDS.width)
  })
})

describe('snapping', () => {
  it('snaps a value to a nearby candidate', () => {
    expect(snapValue(955, [960], 10)).toBe(960)
  })

  it('leaves a value alone when nothing is close', () => {
    expect(snapValue(300, [960], 10)).toBeNull()
  })

  it('prefers the nearest candidate', () => {
    expect(snapValue(955, [960, 940], 30)).toBe(960)
    expect(snapValue(943, [960, 940], 30)).toBe(940)
  })

  it('does not consider the value itself a candidate', () => {
    // Guards the bug where a layer's own position was in its candidate list, so
    // it reported itself snapped while going nowhere.
    expect(snapValue(500, [960], 10)).toBeNull()
  })

  it('scales the tolerance to the artwork so it is not unusable on a small design', () => {
    const small = snapTolerance({ width: 600, height: 400 })
    const large = snapTolerance({ width: 6000, height: 4000 })
    expect(small).toBeGreaterThan(0)
    expect(large).toBeGreaterThan(small)
    expect(small).toBeGreaterThanOrEqual(4)
  })

  it('centres a layer on the certificate', () => {
    // A box just off the middle should lock to it.
    const result = snapLayer(layer({ x: 555, y: 475, width: 800, height: 120 }), BOUNDS)
    expect(result.snappedX).toBe(true)
    expect(result.snappedY).toBe(true)
    expect(result.layer.x + result.layer.width / 2).toBe(Math.round(BOUNDS.width / 2))
  })

  it('leaves a deliberately off-centre layer alone', () => {
    const result = snapLayer(layer({ x: 100, y: 100, width: 300, height: 60 }), BOUNDS)
    expect(result.snappedX).toBe(false)
    expect(result.snappedY).toBe(false)
    expect(result.layer.x).toBe(100)
  })

  it('keeps a snapped layer inside the artwork', () => {
    const result = snapLayer(layer({ x: 1100, y: 900, width: 800, height: 120 }), BOUNDS)
    expect(result.layer.x + result.layer.width).toBeLessThanOrEqual(BOUNDS.width)
    expect(result.layer.y + result.layer.height).toBeLessThanOrEqual(BOUNDS.height)
  })
})

describe('coordinate conversion', () => {
  it('scales a CSS measurement up to image pixels', () => {
    // A 960px-wide preview of a 1920px template: a 100px drag is 200 image px.
    expect(scaleToImage(100, 960, 1920)).toBe(200)
  })

  it('scales an image measurement down for display', () => {
    expect(scaleToDisplay(200, 1920, 960)).toBe(100)
  })

  it('round-trips without drift', () => {
    const image = scaleToImage(73, 1287, 1920)
    expect(scaleToDisplay(image, 1920, 1287)).toBeCloseTo(73, 6)
  })

  it('is safe when the display has no size yet', () => {
    expect(scaleToImage(50, 0, 1920)).toBe(0)
    expect(scaleToDisplay(50, 0, 960)).toBe(0)
  })
})

describe('newTextLayer', () => {
  const BOUNDS: CertificateBounds = { width: 1920, height: 1080 }

  it('creates a recipient-name box, which is the only dynamic field', () => {
    expect(newTextLayer(BOUNDS).field).toBe('recipientName')
  })

  it('gives every box a distinct id, so selection addresses the right one', () => {
    const ids = new Set([newTextLayer(BOUNDS).id, newTextLayer(BOUNDS).id, newTextLayer(BOUNDS).id])
    expect(ids.size).toBe(3)
  })

  it('centres the box, which is where a name most often goes', () => {
    const layer = newTextLayer(BOUNDS)
    expect(layer.x + layer.width / 2).toBeCloseTo(BOUNDS.width / 2, 5)
    expect(layer.y + layer.height / 2).toBeCloseTo(BOUNDS.height / 2, 5)
  })

  it('derives a font size from the box height', () => {
    const layer = newTextLayer(BOUNDS)
    expect(layer.fontSize).toBe(Math.round(layer.height * 0.55))
  })

  it('never derives a font size above the ceiling', () => {
    const layer = newTextLayer({ width: 8000, height: 8000 })
    expect(layer.fontSize).toBeLessThanOrEqual(400)
  })

  it('never derives a font size below the readable floor', () => {
    const layer = newTextLayer({ width: 100, height: 40 })
    expect(layer.fontSize).toBeGreaterThanOrEqual(8)
  })

  it('stays inside the artwork it is given', () => {
    const layer = newTextLayer({ width: 120, height: 90 })
    expect(layer.x).toBeGreaterThanOrEqual(0)
    expect(layer.y).toBeGreaterThanOrEqual(0)
    expect(layer.x + layer.width).toBeLessThanOrEqual(120)
    expect(layer.y + layer.height).toBeLessThanOrEqual(90)
  })

  it('accepts overrides supplied by the caller', () => {
    const layer = newTextLayer(BOUNDS, { x: 111, y: 222, fontWeight: 400 })
    expect(layer.x).toBe(111)
    expect(layer.y).toBe(222)
    expect(layer.fontWeight).toBe(400)
  })

  it('clamps an override that would push the box off the artwork', () => {
    const layer = newTextLayer(BOUNDS, { x: 5000, width: 900 })
    expect(layer.x + layer.width).toBeLessThanOrEqual(BOUNDS.width)
  })
})

describe('emptyConfig', () => {
  it('starts with no text boxes at all', () => {
    expect(emptyConfig().textLayers).toEqual([])
  })

  it('carries the two keys migration 0003 requires, as empty objects', () => {
    // They exist only to satisfy the live CHECK and are read by nothing.
    const config = emptyConfig()
    expect(config.recipientName).toEqual({})
    expect(config.certificateType).toEqual({})
  })
})

describe('resize handles', () => {
  const LAYER: TextLayer = { ...newTextLayer({ width: 1920, height: 1080 }) }
  const BOUNDS: CertificateBounds = { width: 1920, height: 1080 }

  it('offers four corners and four sides', () => {
    expect(RESIZE_HANDLES).toHaveLength(8)
    expect(new Set(RESIZE_HANDLES).size).toBe(8)
  })

  it('names every side handle exactly once', () => {
    const sides = RESIZE_HANDLES.filter((handle) => handle.length === 1).sort()
    expect(sides).toEqual(['e', 'n', 's', 'w'])
  })

  it('names every corner handle exactly once', () => {
    const corners = RESIZE_HANDLES.filter((handle) => handle.length === 2).sort()
    expect(corners).toEqual(['ne', 'nw', 'se', 'sw'])
  })

  it('changes both axes from a corner', () => {
    const result = resizeLayer(LAYER, 'se', 40, 30, BOUNDS)
    expect(result.width).toBe(LAYER.width + 40)
    expect(result.height).toBe(LAYER.height + 30)
  })

  it('changes only the width from an east handle', () => {
    const result = resizeLayer(LAYER, 'e', 40, 30, BOUNDS)
    expect(result.width).toBe(LAYER.width + 40)
    expect(result.height).toBe(LAYER.height)
    expect(result.y).toBe(LAYER.y)
  })

  it('changes only the width from a west handle, keeping the right edge put', () => {
    const result = resizeLayer(LAYER, 'w', -40, 30, BOUNDS)
    expect(result.width).toBe(LAYER.width + 40)
    expect(result.height).toBe(LAYER.height)
    expect(result.x + result.width).toBe(LAYER.x + LAYER.width)
  })

  it('changes only the height from a north handle, keeping the bottom edge put', () => {
    const result = resizeLayer(LAYER, 'n', 40, -30, BOUNDS)
    expect(result.height).toBe(LAYER.height + 30)
    expect(result.width).toBe(LAYER.width)
    expect(result.y + result.height).toBe(LAYER.y + LAYER.height)
  })

  it('changes only the height from a south handle', () => {
    const result = resizeLayer(LAYER, 's', 40, 30, BOUNDS)
    expect(result.height).toBe(LAYER.height + 30)
    expect(result.width).toBe(LAYER.width)
  })

  it('never resizing changes the font size', () => {
    // A wider box and larger type are separate decisions in the editor.
    for (const handle of RESIZE_HANDLES) {
      expect(resizeLayer(LAYER, handle, 25, 25, BOUNDS).fontSize, handle).toBe(LAYER.fontSize)
    }
  })

  it('clamps an outward west drag to the left edge of the artwork', () => {
    // Dragging a west handle left grows the box; without a clamp it would run off.
    const result = resizeLayer(LAYER, 'w', -10_000, 0, BOUNDS)
    expect(result.x).toBe(0)
    expect(result.x + result.width).toBeLessThanOrEqual(BOUNDS.width)
  })

  it('holds the minimum size when a side handle is dragged inward', () => {
    expect(resizeLayer(LAYER, 'e', -10_000, 0, BOUNDS).width).toBe(MIN_LAYER_SIZE)
    expect(resizeLayer(LAYER, 'w', 10_000, 0, BOUNDS).width).toBe(MIN_LAYER_SIZE)
    expect(resizeLayer(LAYER, 'n', 0, 10_000, BOUNDS).height).toBe(MIN_LAYER_SIZE)
    expect(resizeLayer(LAYER, 's', 0, -10_000, BOUNDS).height).toBe(MIN_LAYER_SIZE)
  })
})
