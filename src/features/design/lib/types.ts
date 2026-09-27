import type { AnyDesignData, DesignKind, DesignOutput } from '@/features/design/types'

/**
 * The narrow slice of `CanvasRenderingContext2D` that templates may touch.
 *
 * Templates are deterministic: same data and images in, same pixels out. They
 * are also synchronous and never reach for the DOM, a clock, or randomness, so
 * the whole visual layer is testable in jsdom with a recording fake context
 * instead of a real canvas. Declaring the surface explicitly is what keeps that
 * guarantee honest — adding an API here is a deliberate act.
 */
export type DrawContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'scale'
  | 'translate'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'rect'
  | 'roundRect'
  | 'fill'
  | 'stroke'
  | 'clip'
  | 'fillRect'
  | 'clearRect'
  | 'fillText'
  | 'measureText'
  | 'createLinearGradient'
  | 'createRadialGradient'
  | 'drawImage'
  | 'setLineDash'
  | 'font'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'textAlign'
  | 'textBaseline'
  | 'globalAlpha'
>

/**
 * Raster sources a template may draw. Resolved asynchronously by `render.ts`
 * before any drawing starts, so draw functions stay synchronous.
 */
export type DesignImages = {
  logo?: CanvasImageSource
  cover?: CanvasImageSource
  photo?: CanvasImageSource
  qr?: CanvasImageSource
}

export type PdfPage = {
  format: 'a4'
  orientation: 'portrait' | 'landscape'
}

/**
 * A template is data plus one draw function. Adding a third badge means adding
 * one object here, never touching a generator.
 */
export type DesignTemplate<TData extends AnyDesignData = AnyDesignData> = {
  id: string
  kind: DesignKind
  name: string
  /** One line, shown under the template name on the picker card. */
  blurb: string
  /** Export size in pixels. Templates draw in these units; preview scales down. */
  width: number
  height: number
  /** Present when the design has a natural paper size for PDF output. */
  page?: PdfPage
  outputs: readonly DesignOutput[]
  draw: (ctx: DrawContext, data: TData, images: DesignImages) => void
}
