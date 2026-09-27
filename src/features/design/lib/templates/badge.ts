import { FONT_HEADING, FONT_SANS } from '@/config/fonts'
import { formatEventDateShort } from '@/lib/format'
import type { BadgeData, BadgeRole } from '@/features/design/types'
import type { DesignImages, DesignTemplate, DrawContext } from '@/features/design/lib/types'
import {
  buildPalette,
  centeredRule,
  drawContained,
  drawLogoOrMonogram,
  drawQr,
  drawTextBlock,
  fillGradient,
  fillRoundedRect,
  layoutText,
  strokeRoundedRect,
} from '@/features/design/lib/canvas'

/**
 * Badge templates. 3.5in x 5in at 300dpi, the size a lanyard slot expects.
 *
 * Both share one layout and differ only in chrome, which is the point of the
 * split: a third badge is a new `draw`, not a new generator.
 */
const BADGE_WIDTH = 1050
const BADGE_HEIGHT = 1500
const MARGIN = 72

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

type Chrome = 'classic' | 'modern'

function drawBadge(ctx: DrawContext, data: BadgeData, images: DesignImages, chrome: Chrome): void {
  const { event, participant, role } = data
  const palette = buildPalette(event.theme)

  fillRoundedRect(ctx, { x: 0, y: 0, width: BADGE_WIDTH, height: BADGE_HEIGHT }, 0, palette.paper)

  if (chrome === 'modern') {
    // A solid brand header with the QR punched out of the lower panel.
    fillGradient(
      ctx,
      { x: 0, y: 0, width: BADGE_WIDTH, height: 620 },
      palette.theme,
      palette.accent,
      'diagonal'
    )
  } else {
    // Classic keeps the paper and uses rules plus a thick brand spine.
    ctx.fillStyle = palette.theme
    ctx.fillRect(0, 0, 34, BADGE_HEIGHT)
    strokeRoundedRect(
      ctx,
      { x: MARGIN, y: MARGIN, width: BADGE_WIDTH - MARGIN * 2, height: BADGE_HEIGHT - MARGIN * 2 },
      24,
      palette.theme,
      6
    )
  }

  const onBrand = chrome === 'modern' ? palette.onTheme : palette.ink
  const softOnBrand = chrome === 'modern' ? `${palette.onTheme}cc` : palette.inkSoft
  const centre = BADGE_WIDTH / 2

  drawLogoOrMonogram(
    ctx,
    images.logo,
    {
      x: centre - 90,
      y: chrome === 'modern' ? 96 : 120,
      width: 180,
      height: 180,
    },
    {
      initials: initialsOf(event.name),
      color: chrome === 'modern' ? '#ffffff' : palette.wash,
      textColor: chrome === 'modern' ? palette.theme : palette.deep,
      radius: chrome === 'modern' ? 32 : 20,
    }
  )

  const eventLabel = layoutText(ctx, event.name, {
    font: SANS_BOLD,
    maxWidth: BADGE_WIDTH - MARGIN * 2 - 60,
    maxLines: 2,
    maxSize: 64,
    minSize: 34,
  })
  drawTextBlock(ctx, {
    layout: eventLabel,
    x: centre,
    y: chrome === 'modern' ? 320 : 350,
    color: onBrand,
    align: 'center',
  })

  const whenLabel = layoutText(ctx, `${formatEventDateShort(event.date)} · ${event.venue}`, {
    font: SANS,
    maxWidth: BADGE_WIDTH - MARGIN * 2 - 60,
    maxLines: 2,
    maxSize: 40,
    minSize: 26,
  })
  drawTextBlock(ctx, {
    layout: whenLabel,
    x: centre,
    y: chrome === 'modern' ? 320 + eventLabel.height + 16 : 350 + eventLabel.height + 16,
    color: softOnBrand,
    align: 'center',
  })

  if (chrome === 'modern') {
    centeredRule(ctx, centre, 566, 160, `${palette.onTheme}66`, 3)
  }

  // Name is the headline. Generous box, large floor size, and the fit engine
  // handles a 120-character name without touching the QR.
  // The QR plate and the participant code are pinned to the bottom from the
  // inside edge, so a three-line name can never push the code across the border.
  const codeLayout = layoutText(ctx, participant.code, {
    font: SANS_BOLD,
    maxWidth: BADGE_WIDTH - MARGIN * 2,
    maxLines: 1,
    maxSize: 40,
    minSize: 24,
  })
  const qrSize = 260
  const codeTop = BADGE_HEIGHT - MARGIN - codeLayout.height - 10
  const qrTop = codeTop - 26 - qrSize

  // The role pill and the course line are laid out first so the name can be
  // given whatever vertical space is genuinely left. Budgeting the other way
  // round let a two-line name push the course line underneath the QR plate.
  const nameTop = 700
  const rolePillHeight = 84
  const contentBottom = qrTop - 32

  const courseParts = [participant.course, participant.yearSection].filter((part): part is string =>
    Boolean(part)
  )
  const courseLayout =
    courseParts.length > 0
      ? layoutText(ctx, courseParts.join(' \u00b7 '), {
          font: SANS,
          maxWidth: BADGE_WIDTH - MARGIN * 2 - 40,
          maxLines: 2,
          maxSize: 46,
          minSize: 30,
        })
      : null

  const reserved = rolePillHeight + 36 + (courseLayout ? courseLayout.height + 16 : 0) + 28 // gap between the name and the pill
  const nameBudget = Math.max(120, contentBottom - nameTop - reserved)

  const nameLayout = layoutText(ctx, participant.name, {
    font: HEADING_BLACK,
    maxWidth: BADGE_WIDTH - MARGIN * 2 - 40,
    maxLines: 3,
    maxSize: 132,
    minSize: 52,
    maxHeight: nameBudget,
  })
  drawTextBlock(ctx, {
    layout: nameLayout,
    x: centre,
    y: nameTop,
    color: palette.ink,
    align: 'center',
  })

  let cursorY = nameTop + nameLayout.height + 28

  const roleText: BadgeRole = role
  const roleWidth = 300
  fillRoundedRect(
    ctx,
    { x: centre - roleWidth / 2, y: cursorY, width: roleWidth, height: 84 },
    42,
    chrome === 'modern' ? palette.theme : palette.wash
  )
  ctx.save()
  ctx.fillStyle = chrome === 'modern' ? palette.onTheme : palette.deep
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 46px ${FONT_SANS}`
  ctx.fillText(roleText, centre, cursorY + 44)
  ctx.restore()
  cursorY += rolePillHeight + 36

  if (courseLayout) {
    drawTextBlock(ctx, {
      layout: courseLayout,
      x: centre,
      y: cursorY,
      color: palette.inkSoft,
      align: 'center',
    })
  }

  drawQr(ctx, images.qr, { x: centre - qrSize / 2, y: qrTop, size: qrSize })

  drawTextBlock(ctx, {
    layout: codeLayout,
    x: centre,
    y: codeTop,
    color: palette.inkSoft,
    align: 'center',
  })

  if (chrome === 'modern' && images.cover) {
    // Modern hides a sliver of the event cover behind the header rule.
    drawContained(ctx, images.cover, {
      x: 0,
      y: 596,
      width: BADGE_WIDTH,
      height: 24,
    })
  }
}

export const BADGE_TEMPLATES: readonly DesignTemplate<BadgeData>[] = [
  {
    id: 'badge-classic',
    kind: 'badge',
    name: 'Classic',
    blurb: 'Paper badge with a brand spine and printed rules.',
    width: BADGE_WIDTH,
    height: BADGE_HEIGHT,
    page: { format: 'a4', orientation: 'portrait' },
    outputs: ['png', 'pdf'],
    draw: (ctx, data, images) => drawBadge(ctx, data, images, 'classic'),
  },
  {
    id: 'badge-modern',
    kind: 'badge',
    name: 'Modern',
    blurb: 'Full-bleed brand header with a soft corner glow.',
    width: BADGE_WIDTH,
    height: BADGE_HEIGHT,
    page: { format: 'a4', orientation: 'portrait' },
    outputs: ['png', 'pdf'],
    draw: (ctx, data, images) => drawBadge(ctx, data, images, 'modern'),
  },
]
