import type {
  AnyDesignData,
  CertificateData,
  CertificateType,
  EventBrand,
  ParticipantInfo,
} from '@/features/design/types'
import type { DesignImages, DesignTemplate } from '@/features/design/lib/types'
import { renderDesign } from '@/features/design/lib/render'
import { canvasToPdfBlob } from '@/features/design/lib/export'
import { sanitizeFilename } from '@/lib/filename'
import { buildZip, downloadBlob, type ZipEntry } from '@/lib/zip'
import { toParticipantType } from '@/lib/participantType'

/**
 * Bulk certificate generation.
 *
 * The loop is deliberately serial and yields between recipients. A full A4 canvas
 * is about 35 MB of backing store, so rendering 45 of them concurrently would
 * exhaust the tab; generating one at a time and releasing each canvas keeps peak
 * memory flat no matter how long the list is.
 *
 * Failures are collected rather than thrown. One recipient whose photo will not
 * decode, or whose name is somehow unrenderable, must not cost the organizer the
 * other 44 certificates — but it must also not vanish, so the run ends with an
 * explicit list of who was left out and why.
 */

export type BulkRecipient = {
  participant: ParticipantInfo
  /** The certificate's own verification token, from the issued record. */
  verificationToken: string
  /** Extra fields a custom template can place: speaker title and affiliation. */
  title?: string | null
  organization?: string | null
}

export type BulkProgress = {
  completed: number
  total: number
  currentName: string
}

export type BulkFailure = {
  name: string
  reason: string
}

export type BulkGenerateOptions = {
  event: EventBrand
  recipients: readonly BulkRecipient[]
  certificateType: CertificateType
  template: DesignTemplate<CertificateData>
  /** Origin used to build the verification URL the QR encodes. */
  origin: string
  onProgress?: (progress: BulkProgress) => void
  /** Yields to the event loop so the progress bar can paint. */
  onYield?: () => Promise<void>
}

export type BulkGenerateResult = {
  entries: ZipEntry[]
  completed: number
  failed: BulkFailure[]
  filename: string
}

/** The public URL a certificate's QR points at. Carries only the opaque token. */
export function certificateVerificationUrl(origin: string, verificationToken: string): string {
  return `${origin.replace(/\/+$/, '')}/verify/certificate/${verificationToken}`
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'This certificate could not be rendered.'
}

export async function generateCertificatesInBulk(
  options: BulkGenerateOptions
): Promise<BulkGenerateResult> {
  const { event, recipients, certificateType, template, origin, onProgress, onYield } = options

  const entries: ZipEntry[] = []
  const failed: BulkFailure[] = []
  const total = recipients.length

  for (const [index, recipient] of recipients.entries()) {
    onProgress?.({ completed: index, total, currentName: recipient.participant.name })

    try {
      const data: CertificateData = {
        event,
        recipient: recipient.participant,
        certificateType,
      }

      const images: DesignImages = {}
      const qrUrl = certificateVerificationUrl(origin, recipient.verificationToken)
      const { encodeQr } = await import('@/lib/qr')
      const qr = await encodeQr(qrUrl, { size: 512 })
      if (qr) images.qr = qr

      const canvas = await renderDesign(template, data, images, { scale: 1 })
      try {
        const blob = await canvasToPdfBlob(canvas, template.page)
        entries.push({
          // Zero-padded so the archive unzips in a stable, ordered sequence.
          name: `${String(index + 1).padStart(3, '0')} ${sanitizeFilename(
            recipient.participant.name,
            'pdf'
          )}`,
          blob,
        })
      } finally {
        // Release the backing store before the next iteration allocates one.
        canvas.width = 0
        canvas.height = 0
      }
    } catch (error) {
      failed.push({ name: recipient.participant.name, reason: describe(error) })
    }

    onProgress?.({ completed: index + 1, total, currentName: recipient.participant.name })
    await (onYield ?? nextFrame)()
  }

  return {
    entries,
    completed: entries.length,
    failed,
    filename: sanitizeFilename(
      `${event.name} ${certificateType} certificates (${participantGroupLabel(recipients)})`,
      'zip'
    ),
  }
}

function participantGroupLabel(recipients: readonly BulkRecipient[]): string {
  const first = recipients[0]
  if (!first) return 'certificates'
  return toParticipantType(first.participant.sourceRole) === 'SPEAKER' ? 'speakers' : 'participants'
}

/**
 * Bundles the run into one archive and hands it to the browser.
 *
 * Throws when nothing succeeded, because an empty archive is a silent failure
 * the organizer would only notice after opening it.
 */
export async function downloadCertificateArchive(result: BulkGenerateResult): Promise<void> {
  if (result.entries.length === 0) {
    throw new Error('No certificates could be generated, so there is nothing to download.')
  }
  downloadBlob(await buildZip(result.entries), result.filename)
}

export type { AnyDesignData }
