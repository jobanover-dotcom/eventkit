import type { DrawContext } from '@/features/design/lib/types'

/**
 * A recording stand-in for `CanvasRenderingContext2D`.
 *
 * jsdom has no canvas implementation and the project adds no native canvas
 * dependency, so this is how the drawing layer is tested. It records every draw
 * and text call, and reports text widths from a fixed metric so layout is
 * predictable across machines.
 *
 * Two things make it useful rather than decorative:
 *   - `draw()` calls assert nothing left the canvas bounds.
 *   - `texts()` returns every string drawn, so overflow and truncation can be
 *     checked by value.
 */

export type RecordedText = {
  text: string
  x: number
  y: number
  maxWidth: number
  font: string
  align: CanvasTextAlign
}

export type RecordedDraw = {
  op: string
  args: unknown[]
}

/** A placed raster, tracked so it can be checked against drawn text. */
export type PlacedImage = {
  left: number
  right: number
  top: number
  bottom: number
  label: string
}

export type FakeContext = DrawContext & {
  calls: RecordedDraw[]
  texts: RecordedText[]
  reset: () => void
  /** Text drawn outside the recorded bounds, if the context was told about any. */
  setBounds: (width: number, height: number) => void
  overflowingTexts: () => RecordedText[]
  /** Bounding box of every drawn string, for collision checks. */
  textRects: () => TextRect[]
  /** Every raster placed on the canvas, for collision checks. */
  imageRects: () => PlacedImage[]
}

export const CHAR_WIDTH_RATIO = 0.55
const LINE_HEIGHT_RATIO = 0.6

/** Font shorthand: `700 48px 'Family', sans-serif`. */
function parseFont(font: string): { size: number; lineHeight: number } {
  const match = /(\d+(?:\.\d+)?)px/.exec(font)
  const size = match?.[1] ? Number(match[1]) : 16
  return { size, lineHeight: size * LINE_HEIGHT_RATIO }
}

export function createFakeContext(): FakeContext {
  const calls: RecordedDraw[] = []
  const texts: RecordedText[] = []
  const imageRects: PlacedImage[] = []

  // Clip tracking. `drawCover` deliberately draws an oversized image and lets
  // the clip crop it, so a raw drawImage rect is not what the viewer sees.
  // Without this, a correctly cropped photo reads as overlapping the caption.
  type Box = { left: number; right: number; top: number; bottom: number }
  let pathBox: Box | null = null
  let clipBox: Box | null = null
  const clipStack: (Box | null)[] = []

  const trackPath = (args: unknown[]) => {
    const [x, y, w, h] = args as [number, number, number, number]
    const next = { left: x, right: x + w, top: y, bottom: y + h }
    pathBox = pathBox
      ? {
          left: Math.min(pathBox.left, next.left),
          right: Math.max(pathBox.right, next.right),
          top: Math.min(pathBox.top, next.top),
          bottom: Math.max(pathBox.bottom, next.bottom),
        }
      : next
  }
  let bounds: { width: number; height: number } | null = null
  let currentFont = '16px sans-serif'

  // Real canvas state is restored by restore(). Mirroring that here is what makes
  // the save/restore discipline in the draw helpers observable in tests.
  type State = {
    font: string
    fillStyle: string | CanvasGradient
    strokeStyle: string | CanvasGradient
    lineWidth: number
    textAlign: CanvasTextAlign
    textBaseline: CanvasTextBaseline
    globalAlpha: number
    letterSpacing: string
  }

  let state: State = {
    font: currentFont,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    letterSpacing: '0px',
  }
  const stack: State[] = []

  const record = (op: string, ...args: unknown[]) => {
    calls.push({ op, args })
  }

  const ctx = {
    calls,
    texts,

    get font() {
      return state.font
    },
    set font(value: string) {
      state = { ...state, font: value }
      record('font', value)
    },
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(value: string | CanvasGradient) {
      state = { ...state, fillStyle: value }
      record('fillStyle', value)
    },
    get strokeStyle() {
      return state.strokeStyle
    },
    set strokeStyle(value: string | CanvasGradient) {
      state = { ...state, strokeStyle: value }
      record('strokeStyle', value)
    },
    get lineWidth() {
      return state.lineWidth
    },
    set lineWidth(value: number) {
      state = { ...state, lineWidth: value }
      record('lineWidth', value)
    },
    get textAlign() {
      return state.textAlign
    },
    set textAlign(value: CanvasTextAlign) {
      state = { ...state, textAlign: value }
      record('textAlign', value)
    },
    get textBaseline() {
      return state.textBaseline
    },
    set textBaseline(value: CanvasTextBaseline) {
      state = { ...state, textBaseline: value }
      record('textBaseline', value)
    },
    get globalAlpha() {
      return state.globalAlpha
    },
    set globalAlpha(value: number) {
      state = { ...state, globalAlpha: value }
      record('globalAlpha', value)
    },
    get letterSpacing() {
      return state.letterSpacing
    },
    set letterSpacing(value: string) {
      state = { ...state, letterSpacing: value }
      record('letterSpacing', value)
    },

    save: () => {
      stack.push(state)
      clipStack.push(clipBox)
      record('save')
    },
    restore: () => {
      const previous = stack.pop()
      if (previous) state = previous
      clipBox = clipStack.pop() ?? null
      record('restore')
    },

    scale: (...args: unknown[]) => record('scale', ...args),
    translate: (...args: unknown[]) => record('translate', ...args),
    beginPath: () => {
      pathBox = null
      record('beginPath')
    },
    closePath: () => record('closePath'),
    moveTo: (...args: unknown[]) => record('moveTo', ...args),
    lineTo: (...args: unknown[]) => record('lineTo', ...args),
    arc: (...args: unknown[]) => record('arc', ...args),
    rect: (...args: unknown[]) => {
      trackPath(args)
      record('rect', ...args)
    },
    roundRect: (...args: unknown[]) => {
      trackPath(args)
      record('roundRect', ...args)
    },
    fill: () => record('fill'),
    stroke: () => record('stroke'),
    clip: () => {
      if (pathBox) clipBox = pathBox
      record('clip')
    },
    clearRect: (...args: unknown[]) => record('clearRect', ...args),

    fillRect: (...args: unknown[]) => record('fillRect', ...args),
    fillText: (text: string, x: number, y: number) => {
      const { size } = parseFont(state.font)
      texts.push({
        text,
        x,
        y,
        maxWidth: String(text).length * size * CHAR_WIDTH_RATIO,
        font: state.font,
        align: state.textAlign,
      })
      record('fillText', text, x, y)
    },

    measureText: (text: string) => {
      const { size } = parseFont(state.font)
      return { width: String(text).length * size * CHAR_WIDTH_RATIO } as TextMetrics
    },

    createLinearGradient: () => {
      const gradient = {
        addColorStop: (offset: number, color: string) => {
          record('addColorStop', offset, color)
        },
      }
      return gradient as unknown as CanvasGradient
    },

    createRadialGradient: () => {
      const gradient = {
        addColorStop: (offset: number, color: string) => {
          record('addColorStop', offset, color)
        },
      }
      return gradient as unknown as CanvasGradient
    },

    drawImage: (...args: unknown[]) => {
      // Canvas accepts several source forms; the 3-argument shorthand is
      // (image, dx, dy) and the 5-argument form is (image, dx, dy, dw, dh).
      const [, dx, dy, dw, dh] = args as [unknown, number, number, number?, number?]
      const drawn: Box = { left: dx, right: dx + (dw ?? 0), top: dy, bottom: dy + (dh ?? 0) }
      const visible = clipBox
        ? {
            left: Math.max(drawn.left, clipBox.left),
            right: Math.min(drawn.right, clipBox.right),
            top: Math.max(drawn.top, clipBox.top),
            bottom: Math.min(drawn.bottom, clipBox.bottom),
          }
        : drawn

      if (visible.right > visible.left && visible.bottom > visible.top) {
        imageRects.push({ ...visible, label: 'image' })
      }
      record('drawImage', ...args)
    },

    setLineDash: (...args: unknown[]) => record('setLineDash', ...args),

    setBounds(width: number, height: number) {
      bounds = { width, height }
    },

    reset() {
      calls.length = 0
      texts.length = 0
      imageRects.length = 0
      stack.length = 0
      currentFont = '16px sans-serif'
      state = {
        font: currentFont,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        textAlign: 'start',
        textBaseline: 'alphabetic',
        globalAlpha: 1,
        letterSpacing: '0px',
      }
    },

    overflowingTexts() {
      const limit = bounds
      if (!limit) return []
      return texts.filter((entry) => {
        const { left, right } = horizontalExtent(entry)
        return (
          left < -1 ||
          entry.y < -1 ||
          right > limit.width + 1 ||
          entry.y + parseFont(entry.font).size > limit.height + 1
        )
      })
    },

    imageRects() {
      return imageRects
    },

    textRects() {
      return texts.map((entry) => {
        const { left, right } = horizontalExtent(entry)
        return {
          text: entry.text,
          left,
          right,
          top: entry.y,
          // `layoutText` spaces lines by round(size * 1.2); use the same figure so
          // consecutive lines of one block do not read as a collision.
          bottom: entry.y + parseFont(entry.font).size * LINE_SPACING,
        }
      })
    },
  }

  return ctx as unknown as FakeContext
}

/** The default line-height multiplier used by `layoutText`. */
export const LINE_SPACING = 1.2

/** Tolerance for rounding between the layout engine and this approximation. */
const COLLISION_EPSILON = 2

export type TextRect = {
  text: string
  left: number
  right: number
  top: number
  bottom: number
}

type CollisionRect = { left: number; right: number; top: number; bottom: number; label: string }

/**
 * Pairs of drawn strings whose boxes intersect.
 *
 * Being inside the page is not the same as being legible: a title can sit
 * perfectly within the canvas and still print on top of the message. This is the
 * check that catches a layout that flows from fixed offsets instead of from
 * measured content.
 */
export function findTextCollisions(rects: readonly TextRect[]): [CollisionRect, CollisionRect][] {
  return findRectCollisions(
    rects.map((rect) => ({ ...rect, label: `"${rect.text}"` })),
    (i, j) => rects[i]?.text === rects[j]?.text && rects[i]?.top === rects[j]?.top
  )
}

/**
 * Any two rects that intersect.
 *
 * Placed rasters are included alongside text because a QR plate landing on the
 * course line is the same defect as two strings overlapping, and a page-bounds
 * check cannot see it: both shapes are comfortably inside the page.
 */
export function findRectCollisions(
  rects: readonly CollisionRect[],
  isHarmless: (i: number, j: number) => boolean = () => false
): [CollisionRect, CollisionRect][] {
  const collisions: [CollisionRect, CollisionRect][] = []

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i]
      const b = rects[j]
      if (!a || !b) continue
      if (isHarmless(i, j)) continue

      const overlaps =
        a.left < b.right - COLLISION_EPSILON &&
        b.left < a.right - COLLISION_EPSILON &&
        a.top < b.bottom - COLLISION_EPSILON &&
        b.top < a.bottom - COLLISION_EPSILON

      if (overlaps) collisions.push([a, b])
    }
  }

  return collisions
}

/**
 * Canvas alignment decides whether `x` is the left edge, the centre, or the
 * right edge of the string. Without this, every centre-aligned heading in every
 * template would look like it overflows.
 */
export function horizontalExtent(entry: RecordedText): { left: number; right: number } {
  if (entry.align === 'center') {
    return { left: entry.x - entry.maxWidth / 2, right: entry.x + entry.maxWidth / 2 }
  }
  if (entry.align === 'right' || entry.align === 'end') {
    return { left: entry.x - entry.maxWidth, right: entry.x }
  }
  return { left: entry.x, right: entry.x + entry.maxWidth }
}
