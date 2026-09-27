import { LIMITS } from '@/features/certificates/templates/configSchema'
import type {
  CertificateBounds,
  CertificateDesignConfig,
  TextLayer,
} from '@/features/certificates/templates/types'

/**
 * Layer geometry, as pure functions.
 *
 * The editor is a scaled view of a full-resolution PNG, so every number it
 * touches has to cross a coordinate boundary: a pointer position arrives in CSS
 * pixels and must leave in PNG pixels. Doing that arithmetic here rather than
 * inside pointer handlers keeps the conversions in one place and makes the
 * behaviour assertable without a browser, a canvas, or a real drag.
 *
 * Nothing in this file reads the DOM.
 */

/**
 * What the organizer grabs to resize.
 *
 * Four corners and four sides, the way a box in a familiar design tool behaves:
 * a corner changes both axes, a side changes only the one it is on. Resizing the
 * box never changes the font — those stay separate controls, because a wider box
 * is a different intent from bigger type.
 */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** Every handle, in the order the editor renders them. */
export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
] as const

/** The smallest a text box may become, in PNG pixels. */
export const MIN_LAYER_SIZE = LIMITS.minLayerSize

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const round = (value: number) => Math.round(value)

/**
 * Keeps a layer inside the artwork.
 *
 * A layer that overhangs the edge would print a name half off the page, and the
 * editor offers no way to see that happened, so the boundary is enforced on
 * every mutation rather than only at save time.
 */
export function clampLayer(layer: TextLayer, bounds: CertificateBounds): TextLayer {
  const width = clamp(layer.width, MIN_LAYER_SIZE, bounds.width)
  const height = clamp(layer.height, MIN_LAYER_SIZE, bounds.height)

  return {
    ...layer,
    width: round(width),
    height: round(height),
    x: round(clamp(layer.x, 0, Math.max(0, bounds.width - width))),
    y: round(clamp(layer.y, 0, Math.max(0, bounds.height - height))),
  }
}

export function clampConfig(
  config: CertificateDesignConfig,
  bounds: CertificateBounds
): CertificateDesignConfig {
  return { ...config, textLayers: config.textLayers.map((layer) => clampLayer(layer, bounds)) }
}

/** Moves a layer by a delta in PNG pixels. */
export function moveLayer(
  layer: TextLayer,
  dx: number,
  dy: number,
  bounds: CertificateBounds
): TextLayer {
  return clampLayer({ ...layer, x: layer.x + dx, y: layer.y + dy }, bounds)
}

/**
 * Resizes from a corner.
 *
 * The grabbed edge stays put, which is what makes a resize feel attached to the
 * grab point rather than to the box's top-left. Dragging a west handle left grows
 * the box leftward; dragging a north handle up grows it upward. A corner moves
 * both, and a side handle moves only the axis it is named for.
 */
export function resizeLayer(
  layer: TextLayer,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  bounds: CertificateBounds
): TextLayer {
  // Derived from the handle's own letters rather than enumerated per corner, so
  // adding a side handle needs no change here.
  const west = handle.includes('w')
  const north = handle.includes('n')
  // An east/south handle changes only size; a north/west one also moves origin.
  const growsX = west || handle.includes('e')
  const growsY = north || handle.includes('s')

  let x = west ? layer.x + dx : layer.x
  let y = north ? layer.y + dy : layer.y
  let width = growsX ? (west ? layer.width - dx : layer.width + dx) : layer.width
  let height = growsY ? (north ? layer.height - dy : layer.height + dy) : layer.height

  // The layer cannot be dragged past an edge, so a resize that would push the
  // moving edge outside the artwork is clamped and the fixed edge absorbs the
  // difference rather than the box inverting.
  if (x < 0) {
    width += x
    x = 0
  }
  if (y < 0) {
    height += y
    y = 0
  }
  if (x + width > bounds.width) width = bounds.width - x
  if (y + height > bounds.height) height = bounds.height - y

  if (width < MIN_LAYER_SIZE) {
    if (west) x = Math.min(x, layer.x + layer.width - MIN_LAYER_SIZE)
    width = MIN_LAYER_SIZE
  }
  if (height < MIN_LAYER_SIZE) {
    if (north) y = Math.min(y, layer.y + layer.height - MIN_LAYER_SIZE)
    height = MIN_LAYER_SIZE
  }

  return clampLayer({ ...layer, x, y, width, height }, bounds)
}

/** Fraction of the canvas a position must sit within to count as a snap. */
export const SNAP_TOLERANCE_RATIO = 0.006

export function snapTolerance(bounds: CertificateBounds): number {
  return Math.max(4, Math.round(Math.min(bounds.width, bounds.height) * SNAP_TOLERANCE_RATIO))
}

/**
 * Snaps a value to the nearest candidate if it is within tolerance.
 *
 * `null` means "no candidate was close enough", which the caller treats as "keep
 * the position the organizer chose" — snapping is assistance, never a constraint.
 */
export function snapValue(
  value: number,
  candidates: readonly number[],
  tolerance: number
): number | null {
  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value)
    if (distance <= tolerance && distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }

  return best
}

/**
 * Snaps a layer's centre to the artwork's centre lines.
 *
 * Only the two centrelines are offered. Snapping is assistance, and the one
 * adjustment an organizer makes constantly is centring a name; adding a grid
 * would be a design tool rather than a certificate editor. The candidates are
 * deliberately the *canvas* guides and never the layer's own position, or every
 * layer would report itself as snapped while going nowhere.
 */
export function snapLayer(
  layer: TextLayer,
  bounds: CertificateBounds,
  tolerance = snapTolerance(bounds)
): { layer: TextLayer; snappedX: boolean; snappedY: boolean } {
  const snappedX = snapValue(layer.x + layer.width / 2, [bounds.width / 2], tolerance)
  const snappedY = snapValue(layer.y + layer.height / 2, [bounds.height / 2], tolerance)

  const next: TextLayer = { ...layer }

  if (snappedX !== null) {
    // The box moves; the text's alignment inside it is untouched.
    next.x = Math.round(snappedX - layer.width / 2)
  }
  if (snappedY !== null) {
    next.y = Math.round(snappedY - layer.height / 2)
  }

  return {
    layer: clampLayer(next, bounds),
    snappedX: snappedX !== null,
    snappedY: snappedY !== null,
  }
}

/**
 * CSS geometry for the editor overlay, as percentages of the artwork.
 *
 * The overlay is scaled to whatever width the browser gives it, so storing CSS
 * pixels would make a template render differently at different window sizes. The
 * editor renders from these percentages and converts back through
 * `scaleToImage` when the organizer moves something.
 */
export function layerStylePercent(layer: TextLayer, bounds: CertificateBounds) {
  return {
    left: `${(layer.x / bounds.width) * 100}%`,
    top: `${(layer.y / bounds.height) * 100}%`,
    width: `${(layer.width / bounds.width) * 100}%`,
    height: `${(layer.height / bounds.height) * 100}%`,
  }
}

/** Converts a CSS-pixel measurement to image pixels. */
export function scaleToImage(value: number, displaySize: number, imageSize: number): number {
  if (displaySize <= 0) return 0
  return (value / displaySize) * imageSize
}

/** Converts an image-pixel measurement to CSS pixels. */
export function scaleToDisplay(value: number, imageSize: number, displaySize: number): number {
  if (imageSize <= 0) return 0
  return (value / imageSize) * displaySize
}

/** Fraction of the artwork a default text box occupies, when the design gives no hint. */
const DEFAULT_LAYER_WIDTH_RATIO = 0.55
const DEFAULT_LAYER_HEIGHT_RATIO = 0.12

/**
 * A new text box, placed sensibly on a canvas of the given size.
 *
 * The artwork is the designer's, so there is no detected rectangle to start from:
 * the box goes in the middle third, wide enough to hold a name and tall enough to
 * read as a nameplate. The organizer drags it from here; these numbers only have
 * to be a good first impression, not correct.
 */
export function newTextLayer(
  bounds: CertificateBounds,
  overrides: Partial<TextLayer> = {}
): TextLayer {
  const width = clamp(
    Math.round(bounds.width * DEFAULT_LAYER_WIDTH_RATIO),
    MIN_LAYER_SIZE,
    bounds.width
  )
  const height = clamp(
    Math.round(bounds.height * DEFAULT_LAYER_HEIGHT_RATIO),
    MIN_LAYER_SIZE,
    bounds.height
  )
  const x = Math.round((bounds.width - width) / 2)
  const y = Math.round((bounds.height - height) / 2)
  // Proportional to the box so the type is proportionate to the space, and
  // clamped so a tiny box on a big canvas does not open with unreadable text.
  const fontSize = clamp(Math.round(height * 0.55), LIMITS.minFontSize, LIMITS.maxFontSize)

  return clampLayer(
    {
      id: crypto.randomUUID(),
      field: 'recipientName',
      x,
      y,
      width,
      height,
      fontFamily: 'inter',
      fontSize,
      fontWeight: 700,
      italic: false,
      color: '#111111',
      horizontalAlign: 'center',
      verticalAlign: 'middle',
      letterSpacing: 0,
      lineHeight: 1.1,
      ...overrides,
    },
    bounds
  )
}

/** An empty configuration: a template with nothing placed on it yet. */
export function emptyConfig(): CertificateDesignConfig {
  return { recipientName: {}, certificateType: {}, textLayers: [] }
}
