import { FONT_HEADING, FONT_SANS } from '@/config/fonts'
import { formatEventDate } from '@/lib/format'
import { CERTIFICATE_PRESETS, type CertificateData } from '@/features/design/types'
import type { DesignImages, DesignTemplate, DrawContext } from '@/features/design/lib/types'
import {
  buildPalette,
  centeredRule,
  drawLogoOrMonogram,
  drawTextBlock,
  fillGradient,
  fillRoundedRect,
  layoutText,
  strokeLine,
  strokeRoundedRect,
} from '@/features/design/lib/canvas'

/**
 * Certificate templates. A4 landscape at 300dpi.
 *
 * The certificate type drives the wording; the template only decides how that
 * wording looks. Both are PDF-first, so `outputs` is PDF only.
 */
const CERT_WIDTH = 3508
const CERT_HEIGHT = 2480
const MARGIN = 200

const SANS = { family: FONT_SANS, weight: '500' } as const
const SANS_BOLD = { family: FONT_SANS, weight: '700' } as const
const HEADING = { family: FONT_HEADING, weight: '800' } as const
const HEADING_BLACK = { family: FONT_HEADING, weight: '900' } as const

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'EK'
  const first = parts[0]?.[0] ?? 'E'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

type Chrome = 'classic' | 'modern'

function drawCertificate(
  ctx: DrawContext,
  data: CertificateData,
  images: DesignImages,
  chrome: Chrome
): void {
  const { event, recipient, certificateType } = data
  const preset = CERTIFICATE_PRESETS[certificateType]
  const palette = buildPalette(event.theme)
  const centre = CERT_WIDTH / 2

  fillRoundedRect(ctx, { x: 0, y: 0, width: CERT_WIDTH, height: CERT_HEIGHT }, 0, palette.paper)

  if (chrome === 'modern') {
    // A brand band top and bottom leaves a clean white field for the text.
    fillGradient(
      ctx,
      { x: 0, y: 0, width: CERT_WIDTH, height: 340 },
      palette.theme,
      palette.accent,
      'diagonal'
    )
    fillGradient(
      ctx,
      { x: 0, y: CERT_HEIGHT - 200, width: CERT_WIDTH, height: 200 },
      palette.accent,
      palette.theme,
      'diagonal'
    )
  } else {
    // Classic is a double rule inset from the trim, the way a printed
    // certificate usually looks.
    strokeRoundedRect(
      ctx,
      { x: 90, y: 90, width: CERT_WIDTH - 180, height: CERT_HEIGHT - 180 },
      20,
      palette.theme,
      10
    )
    strokeRoundedRect(
      ctx,
      { x: 130, y: 130, width: CERT_WIDTH - 260, height: CERT_HEIGHT - 260 },
      14,
      palette.theme,
      3
    )
  }

  const onBrand = chrome === 'modern' ? palette.onTheme : palette.ink
  const softOnBrand = chrome === 'modern' ? `${palette.onTheme}cc` : palette.inkSoft

  // Logo, or a monogram so the top never reads as an empty mistake.
  if (chrome === 'modern') {
    drawLogoOrMonogram(
      ctx,
      images.logo,
      { x: centre - 90, y: 100, width: 180, height: 180 },
      {
        initials: initialsOf(event.name),
        color: '#ffffff',
        textColor: palette.theme,
        radius: 28,
      }
    )
  } else {
    drawLogoOrMonogram(
      ctx,
      images.logo,
      { x: centre - 90, y: 220, width: 180, height: 180 },
      {
        initials: initialsOf(event.name),
        color: palette.wash,
        textColor: palette.deep,
        radius: 20,
      }
    )
  }

  const titleLayout = layoutText(ctx, preset.title, {
    font: HEADING_BLACK,
    maxWidth: CERT_WIDTH - MARGIN * 2,
    maxLines: 2,
    maxSize: 200,
    minSize: 96,
  })
  const titleTop = chrome === 'modern' ? 420 : 500
  drawTextBlock(ctx, {
    layout: titleLayout,
    x: centre,
    y: titleTop,
    color: onBrand,
    align: 'center',
  })

  centeredRule(
    ctx,
    centre,
    titleTop + titleLayout.height + 70,
    420,
    chrome === 'modern' ? palette.theme : palette.deep,
    8
  )

  // The body is laid out first, then centred in the band between the title and
  // the signature row. Laying it out and drawing it in one pass left a hole
  // above the signatures when the recipient name was short, and squeezed the
  // event name to nothing when it was long.
  const rowY = CERT_HEIGHT - 560
  const bandTop = titleTop + titleLayout.height + 150
  const bandBottom = rowY - 50
  const gap = 56
  const nameRuleGap = 44

  const givenLabel = layoutText(ctx, 'THIS IS PRESENTED TO', {
    font: SANS_BOLD,
    maxWidth: CERT_WIDTH - MARGIN * 2,
    maxLines: 1,
    maxSize: 54,
    minSize: 40,
  })

  // The recipient is the point of the document, so it gets the largest box and
  // the highest floor size on the page.
  const nameLayout = layoutText(ctx, recipient.name, {
    font: HEADING,
    maxWidth: CERT_WIDTH - MARGIN * 2 - 200,
    maxLines: 2,
    maxSize: 220,
    minSize: 96,
  })

  const bodyLayout = layoutText(ctx, preset.recognition, {
    font: SANS,
    maxWidth: CERT_WIDTH - MARGIN * 2 - 200,
    maxLines: 2,
    maxSize: 78,
    minSize: 48,
  })

  const eventLayout = layoutText(ctx, event.name, {
    font: HEADING,
    maxWidth: CERT_WIDTH - MARGIN * 2 - 200,
    maxLines: 2,
    maxSize: 120,
    minSize: 60,
  })

  const bodyTotal =
    givenLabel.height +
    gap +
    nameLayout.height +
    nameRuleGap +
    gap +
    bodyLayout.height +
    gap +
    eventLayout.height

  const bandHeight = bandBottom - bandTop
  let cursorY = bandTop + Math.max(0, (bandHeight - bodyTotal) / 2)

  drawTextBlock(ctx, {
    layout: givenLabel,
    x: centre,
    y: cursorY,
    color: softOnBrand,
    align: 'center',
  })
  cursorY += givenLabel.height + gap

  drawTextBlock(ctx, {
    layout: nameLayout,
    x: centre,
    y: cursorY,
    color: palette.ink,
    align: 'center',
  })
  cursorY += nameLayout.height + nameRuleGap

  strokeLine(
    ctx,
    centre - nameLayout.width / 2 - 80,
    cursorY,
    centre + nameLayout.width / 2 + 80,
    cursorY,
    chrome === 'modern' ? palette.wash : palette.theme,
    4
  )
  cursorY += gap

  drawTextBlock(ctx, {
    layout: bodyLayout,
    x: centre,
    y: cursorY,
    color: palette.inkSoft,
    align: 'center',
  })
  cursorY += bodyLayout.height + gap

  drawTextBlock(ctx, {
    layout: eventLayout,
    x: centre,
    y: cursorY,
    color: palette.deep,
    align: 'center',
  })

  // Signature row: organizer on the left, date on the right, on a shared rule.
  const columnWidth = (CERT_WIDTH - MARGIN * 2) / 2 - 120

  strokeLine(ctx, MARGIN, rowY + 190, MARGIN + columnWidth, rowY + 190, palette.theme, 3)
  strokeLine(
    ctx,
    CERT_WIDTH - MARGIN - columnWidth,
    rowY + 190,
    CERT_WIDTH - MARGIN,
    rowY + 190,
    palette.theme,
    3
  )

  const signatoryLayout = layoutText(ctx, event.organizerName, {
    font: SANS_BOLD,
    maxWidth: columnWidth,
    maxLines: 1,
    maxSize: 62,
    minSize: 36,
  })
  drawTextBlock(ctx, {
    layout: signatoryLayout,
    x: MARGIN + columnWidth / 2,
    y: rowY + 90,
    color: palette.ink,
    align: 'center',
  })

  const dateLayout = layoutText(ctx, formatEventDate(event.date), {
    font: SANS_BOLD,
    maxWidth: columnWidth,
    maxLines: 1,
    maxSize: 62,
    minSize: 36,
  })
  drawTextBlock(ctx, {
    layout: dateLayout,
    x: CERT_WIDTH - MARGIN - columnWidth / 2,
    y: rowY + 90,
    color: palette.ink,
    align: 'center',
  })

  ctx.save()
  ctx.fillStyle = palette.inkSoft
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = `600 40px ${FONT_SANS}`
  ctx.fillText('Organizer', MARGIN + columnWidth / 2, rowY + 210)
  ctx.fillText('Date', CERT_WIDTH - MARGIN - columnWidth / 2, rowY + 210)
  ctx.restore()
}

export const CERTIFICATE_TEMPLATES: readonly DesignTemplate<CertificateData>[] = [
  {
    id: 'certificate-classic',
    kind: 'certificate',
    name: 'Classic',
    blurb: 'Double rule, centred serif-weight heading, signature row.',
    width: CERT_WIDTH,
    height: CERT_HEIGHT,
    page: { format: 'a4', orientation: 'landscape' },
    outputs: ['pdf'],
    draw: (ctx, data, images) => drawCertificate(ctx, data, images, 'classic'),
  },
  {
    id: 'certificate-modern',
    kind: 'certificate',
    name: 'Modern',
    blurb: 'Brand bands top and bottom with a white content field.',
    width: CERT_WIDTH,
    height: CERT_HEIGHT,
    page: { format: 'a4', orientation: 'landscape' },
    outputs: ['pdf'],
    draw: (ctx, data, images) => drawCertificate(ctx, data, images, 'modern'),
  },
]
