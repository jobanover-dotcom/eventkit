import { FONT_HEADING, FONT_SANS } from '@/config/fonts'
import type { PhotoFrameData } from '@/features/design/types'
import type { DesignImages, DesignTemplate, DrawContext } from '@/features/design/lib/types'
import {
  buildPalette,
  confettiRow,
  drawCover,
  drawTextBlock,
  fillRoundedRect,
  layoutText,
  strokeRoundedRect,
} from '@/features/design/lib/canvas'

/** Photo frame templates. 4:5 at 1080x1350 so it drops straight into a feed. */
const FRAME_WIDTH = 1080
const FRAME_HEIGHT = 1350
const MARGIN = 48

const SANS = { family: FONT_SANS, weight: '500' } as const
const SANS_BOLD = { family: FONT_SANS, weight: '700' } as const
const HEADING = { family: FONT_HEADING, weight: '800' } as const

type Chrome = 'event' | 'school'

function drawFrame(
  ctx: DrawContext,
  data: PhotoFrameData,
  images: DesignImages,
  chrome: Chrome
): void {
  const { event, caption } = data
  const palette = buildPalette(event.theme)
  const centre = FRAME_WIDTH / 2

  fillRoundedRect(ctx, { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT }, 0, palette.paper)

  // The two frames differ in mat width and title scale rather than in a
  // variable border: `school` is a full-bleed brand mat, `event` a slim rule.
  const matInset = chrome === 'school' ? 96 : 56
  const topPanel = chrome === 'school' ? 300 : 250

  if (chrome === 'school') {
    fillRoundedRect(ctx, { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT }, 0, palette.theme)
    confettiRow(ctx, MARGIN, MARGIN, 9, 110, 12, [palette.onTheme, `${palette.onTheme}99`])
  } else {
    strokeRoundedRect(
      ctx,
      { x: MARGIN, y: MARGIN, width: FRAME_WIDTH - MARGIN * 2, height: FRAME_HEIGHT - MARGIN * 2 },
      28,
      palette.theme,
      8
    )
  }

  // The window is sized from the space left between the title panel and the
  // caption/footer block, so the photo always has room and the text below it
  // never lands on top of it.
  const footerLayout = layoutText(ctx, `${event.organizerName} \u00b7 ${event.venue}`, {
    font: SANS_BOLD,
    maxWidth: FRAME_WIDTH - matInset * 2 - 40,
    maxLines: 1,
    maxSize: 34,
    minSize: 22,
  })

  const trimmedCaption = caption.trim()
  const captionBudget = trimmedCaption.length > 0 ? 2 * Math.round(44 * 1.2) : 0
  const footerTop = FRAME_HEIGHT - matInset - 40 - footerLayout.height
  const captionTop = footerTop - (captionBudget > 0 ? captionBudget + 28 : 0)

  const windowX = matInset
  const windowY = topPanel
  const windowWidth = FRAME_WIDTH - matInset * 2
  const windowHeight = Math.max(140, captionTop - 44 - topPanel)

  // Photo window. A placeholder keeps the frame usable when no photo is chosen.
  if (images.photo) {
    drawCover(ctx, images.photo, {
      x: windowX,
      y: windowY,
      width: windowWidth,
      height: windowHeight,
    })
  } else {
    fillRoundedRect(
      ctx,
      { x: windowX, y: windowY, width: windowWidth, height: windowHeight },
      20,
      chrome === 'school' ? `${palette.onTheme}22` : palette.wash
    )

    ctx.save()
    ctx.fillStyle = chrome === 'school' ? `${palette.onTheme}cc` : palette.deep
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 46px ${FONT_SANS}`
    ctx.fillText('Upload a photo', centre, windowY + windowHeight / 2)
    ctx.restore()
  }

  const onBrand = chrome === 'school' ? palette.onTheme : palette.ink
  const softOnBrand = chrome === 'school' ? `${palette.onTheme}cc` : palette.inkSoft

  const titleLayout = layoutText(ctx, event.name, {
    font: HEADING,
    maxWidth: FRAME_WIDTH - matInset * 2 - 40,
    maxLines: 2,
    maxSize: chrome === 'school' ? 84 : 64,
    minSize: 36,
    maxHeight: topPanel - 70,
  })
  drawTextBlock(ctx, {
    layout: titleLayout,
    x: centre,
    y: chrome === 'school' ? 104 : 92,
    color: onBrand,
    align: 'center',
  })

  // An empty caption is a valid choice, so the line is simply not drawn rather
  // than leaving a gap where text should be.
  if (captionBudget > 0) {
    const captionLayout = layoutText(ctx, trimmedCaption, {
      font: SANS,
      maxWidth: FRAME_WIDTH - matInset * 2 - 40,
      maxLines: 2,
      maxSize: 44,
      minSize: 26,
      maxHeight: captionBudget,
    })
    drawTextBlock(ctx, {
      layout: captionLayout,
      x: centre,
      y: captionTop,
      color: softOnBrand,
      align: 'center',
    })
  }

  drawTextBlock(ctx, {
    layout: footerLayout,
    x: centre,
    y: footerTop,
    color: softOnBrand,
    align: 'center',
  })
}

export const PHOTO_FRAME_TEMPLATES: readonly DesignTemplate<PhotoFrameData>[] = [
  {
    id: 'photo-frame-event',
    kind: 'photo_frame',
    name: 'Event Frame',
    blurb: 'Slim brand rule with the event name above the photo.',
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    outputs: ['png'],
    draw: (ctx, data, images) => drawFrame(ctx, data, images, 'event'),
  },
  {
    id: 'photo-frame-school',
    kind: 'photo_frame',
    name: 'School Frame',
    blurb: 'Full brand mat with a wide photo window and confetti edge.',
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    outputs: ['png'],
    draw: (ctx, data, images) => drawFrame(ctx, data, images, 'school'),
  },
]
