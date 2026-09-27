import { FONT_HEADING, FONT_SANS } from '@/config/fonts'
import { formatEventDate, formatEventTime } from '@/lib/format'
import { POSTER_PRESETS, type PosterData } from '@/features/design/types'
import type { DesignImages, DesignTemplate, DrawContext } from '@/features/design/lib/types'
import {
  buildPalette,
  centeredRule,
  drawContained,
  drawCover,
  drawLogoOrMonogram,
  drawQr,
  drawTextBlock,
  fillGradient,
  fillRoundedRect,
  layoutText,
} from '@/features/design/lib/canvas'

/** Poster templates. 4:5 at 1080x1350, the usual social/print portrait ratio. */
const POSTER_WIDTH = 1080
const POSTER_HEIGHT = 1350
const MARGIN = 80

const SANS = { family: FONT_SANS, weight: '500' } as const
const SANS_BOLD = { family: FONT_SANS, weight: '700' } as const
const HEADING_BLACK = { family: FONT_HEADING, weight: '900' } as const

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'EK'
  const first = parts[0]?.[0] ?? 'E'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

type Chrome = 'announcement' | 'thanks'

function drawPoster(
  ctx: DrawContext,
  data: PosterData,
  images: DesignImages,
  chrome: Chrome
): void {
  const { event, contentType, message, showQr } = data
  const preset = POSTER_PRESETS[contentType]
  const palette = buildPalette(event.theme)
  const centre = POSTER_WIDTH / 2

  fillRoundedRect(ctx, { x: 0, y: 0, width: POSTER_WIDTH, height: POSTER_HEIGHT }, 0, palette.paper)

  if (chrome === 'announcement') {
    // Cover image bleeds off the top third, with a brand wash over it so the
    // logo and eyebrow stay readable on any photo.
    if (images.cover) {
      drawCover(ctx, images.cover, { x: 0, y: 0, width: POSTER_WIDTH, height: 560 })
    }
    fillGradient(
      ctx,
      { x: 0, y: 0, width: POSTER_WIDTH, height: 620 },
      palette.theme,
      `${palette.theme}00`,
      'vertical'
    )
  } else {
    fillGradient(
      ctx,
      { x: 0, y: 0, width: POSTER_WIDTH, height: POSTER_HEIGHT },
      palette.wash,
      palette.paper,
      'diagonal'
    )
    centeredRule(ctx, centre, 150, 160, palette.theme, 6)
  }

  const onBrand = chrome === 'announcement' ? palette.onTheme : palette.deep
  const softOnBrand = chrome === 'announcement' ? `${palette.onTheme}d0` : palette.inkSoft

  drawLogoOrMonogram(
    ctx,
    images.logo,
    { x: centre - 56, y: 90, width: 112, height: 112 },
    {
      initials: initialsOf(event.name),
      color: chrome === 'announcement' ? '#ffffff' : palette.theme,
      textColor: chrome === 'announcement' ? palette.theme : palette.onTheme,
      radius: 22,
    }
  )

  const eyebrowLayout = layoutText(ctx, preset.eyebrow, {
    font: SANS_BOLD,
    maxWidth: POSTER_WIDTH - MARGIN * 2,
    maxLines: 1,
    maxSize: 38,
    minSize: 26,
  })
  drawTextBlock(ctx, {
    layout: eyebrowLayout,
    x: centre,
    y: 236,
    color: softOnBrand,
    align: 'center',
  })

  const titleLayout = layoutText(ctx, event.name, {
    font: HEADING_BLACK,
    maxWidth: POSTER_WIDTH - MARGIN * 2 - 40,
    maxLines: chrome === 'announcement' ? 2 : 3,
    maxSize: chrome === 'announcement' ? 112 : 100,
    minSize: 52,
  })
  drawTextBlock(ctx, {
    layout: titleLayout,
    x: centre,
    y: 300,
    color: onBrand,
    align: 'center',
  })

  // Flow from below the measured title. The thank-you variant has no photo
  // header, so its title can run to three lines; a fixed body offset put the
  // message straight through it.
  const bodyTop = 300 + titleLayout.height + (chrome === 'announcement' ? 90 : 60)

  // The footer sits on the bottom margin, so the flowing content is bounded
  // above it rather than being allowed to run into it.
  const footerTop = POSTER_HEIGHT - MARGIN - 70
  const bodyBottom = footerTop - 40

  const messageLayout = layoutText(ctx, message, {
    font: SANS,
    maxWidth: POSTER_WIDTH - MARGIN * 2 - 60,
    maxLines: 4,
    maxSize: 50,
    minSize: 30,
    maxHeight: Math.max(0, bodyBottom - bodyTop - 120),
  })
  drawTextBlock(ctx, {
    layout: messageLayout,
    x: centre,
    y: bodyTop,
    color: palette.inkSoft,
    align: 'center',
  })

  // Facts panel: date, time, venue, each on its own row so nothing reflows.
  let cursorY = bodyTop + messageLayout.height + 50
  const facts = [
    `${formatEventDate(event.date)}`,
    `${formatEventTime(event.startTime)} – ${formatEventTime(event.endTime)}`,
    event.venue,
  ]

  const panelHeight = 40 + facts.length * 74
  fillRoundedRect(
    ctx,
    { x: MARGIN, y: cursorY, width: POSTER_WIDTH - MARGIN * 2, height: panelHeight },
    24,
    chrome === 'announcement' ? palette.wash : '#ffffff'
  )

  facts.forEach((fact, index) => {
    const factLayout = layoutText(ctx, fact, {
      font: index === 0 ? SANS_BOLD : SANS,
      maxWidth: POSTER_WIDTH - MARGIN * 2 - 80,
      maxLines: 1,
      maxSize: index === 0 ? 48 : 42,
      minSize: 24,
    })
    drawTextBlock(ctx, {
      layout: factLayout,
      x: centre,
      y: cursorY + 28 + index * 74,
      color: index === 0 ? palette.ink : palette.inkSoft,
      align: 'center',
    })
  })

  cursorY += panelHeight + 40

  // Optional QR, for the announcement variant only. Pinned to the bottom so the
  // poster keeps a predictable silhouette whether or not it is shown.
  if (showQr && cursorY + 200 <= bodyBottom) {
    const size = 200
    drawQr(ctx, images.qr, { x: centre - size / 2, y: POSTER_HEIGHT - MARGIN - size, size })
  } else if (images.cover && chrome === 'thanks') {
    // Thank-you variant uses the cover as a band under the facts panel.
    drawContained(ctx, images.cover, {
      x: MARGIN,
      y: cursorY,
      width: POSTER_WIDTH - MARGIN * 2,
      height: Math.max(0, footerTop - cursorY - 30),
    })
  }

  const footerLayout = layoutText(ctx, event.organizerName, {
    font: SANS_BOLD,
    maxWidth: POSTER_WIDTH - MARGIN * 2,
    maxLines: 1,
    maxSize: 40,
    minSize: 26,
  })
  drawTextBlock(ctx, {
    layout: footerLayout,
    x: centre,
    y: POSTER_HEIGHT - MARGIN - 30,
    color: palette.inkSoft,
    align: 'center',
  })
}

export const POSTER_TEMPLATES: readonly DesignTemplate<PosterData>[] = [
  {
    id: 'poster-announcement',
    kind: 'poster',
    name: 'Announcement',
    blurb: 'Photo header, facts panel, optional QR for the door.',
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    page: { format: 'a4', orientation: 'portrait' },
    outputs: ['png', 'pdf'],
    draw: (ctx, data, images) => drawPoster(ctx, data, images, 'announcement'),
  },
  {
    id: 'poster-thank-you',
    kind: 'poster',
    name: 'Thank You',
    blurb: 'Soft brand wash with a closing message and cover band.',
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    page: { format: 'a4', orientation: 'portrait' },
    outputs: ['png', 'pdf'],
    draw: (ctx, data, images) => drawPoster(ctx, data, images, 'thanks'),
  },
]
