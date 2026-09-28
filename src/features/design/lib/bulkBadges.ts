import type { BadgeData, BadgeRole, EventBrand, ParticipantInfo } from '@/features/design/types'
import type { DesignTemplate } from '@/features/design/lib/types'
import { renderDesign, resolveDesignImages, canvasToBlob } from '@/features/design/lib/render'
import { canvasToPdfBlob } from '@/features/design/lib/export'
import { sanitizeFilename } from '@/lib/filename'
import { buildZip, downloadBlob, type ZipEntry } from '@/lib/zip'

/**
 * Bulk badge generation.
 *
 * A run is the single-badge flow repeated: same template, same renderer, same
 * image resolution, same export. There is no badge-specific draw path here, so a
 * badge downloaded one at a time and a badge from a run of two hundred are the
 * same pixels.
 *
 * **The QR is not new.** `resolveDesignImages` reads `participant.qrToken`, the
 * identity the participant registered with and the one the check-in scanner
 * already reads, and that is what gets printed. No token is created, rotated, or
 * regenerated here, and none reaches a filename, a progress label, a failure
 * message, or a log. The only thing this module knows about the person is their
 * name, which is what the file is called.
 *
 * The loop is serial and yields between badges for the same reason certificates
 * do: each render allocates a full canvas, and a roster of a few hundred
 * concurrent ones would exhaust the tab. Releasing each canvas as it is collected
 * keeps peak memory flat however long the list is.
 *
 * Failures are collected rather than thrown. One participant whose name will not
 * fit must not cost the organizer the rest of the room — but it must not vanish
 * either, so the run ends with an explicit list of who was left out and why.
 */

export type BulkBadgeTarget = {
  participant: ParticipantInfo
  /**
   * The role printed on this badge.
   *
   * Resolved by the caller, because the choice of whose role to use is a UI
   * decision: the organizer's own, or one label for the whole batch.
   */
  role: BadgeRole
}

export type BulkBadgeProgress = {
  completed: number
  total: number
  currentName: string
}

export type BulkBadgeFailure = {
  name: string
  reason: string
}

export type BulkBadgeOutput = 'png' | 'pdf'

export type BulkBadgeOptions = {
  event: EventBrand
  targets: readonly BulkBadgeTarget[]
  template: DesignTemplate<BadgeData>
  /** Taken from the template's declared outputs, so a choice is always valid. */
  output: BulkBadgeOutput
  onProgress?: (progress: BulkBadgeProgress) => void
  /** Yields to the event loop so the progress bar can paint. */
  onYield?: () => Promise<void>
}

export type BulkBadgeResult = {
  entries: ZipEntry[]
  completed: number
  failed: BulkBadgeFailure[]
  filename: string
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * A render failure, described for an organizer.
 *
 * Deliberately a fixed sentence rather than the raw message: a failure could
 * surface text from deep in image or QR encoding, and this list is organizer-facing
 * UI. The participant's name is already beside it, which is what identifies the
 * badge.
 */
function describe(): string {
  return 'This badge could not be rendered.'
}

function toBlob(
  canvas: HTMLCanvasElement,
  output: BulkBadgeOutput,
  page: DesignTemplate<BadgeData>['page']
): Promise<Blob> {
  if (output === 'pdf') return canvasToPdfBlob(canvas, page)

  // The PNG path already exists for the single download; reusing it means the two
  // flows cannot encode differently.
  return canvasToBlob(canvas).then((blob) => {
    if (!blob) throw new Error('The badge could not be prepared for download.')
    return blob
  })
}

export async function generateBadgesInBulk(options: BulkBadgeOptions): Promise<BulkBadgeResult> {
  const { event, targets, template, output, onProgress, onYield } = options

  const entries: ZipEntry[] = []
  const failed: BulkBadgeFailure[] = []
  const total = targets.length

  for (const [index, target] of targets.entries()) {
    const name = target.participant.name
    onProgress?.({ completed: index, total, currentName: name })

    try {
      const data: BadgeData = {
        event,
        participant: target.participant,
        role: target.role,
      }

      // The same call the single-badge preview and download use, so the QR and the
      // logo on a bulk badge are resolved exactly as they are on a solo one.
      const images = await resolveDesignImages({ data, includeQr: true })
      const canvas = await renderDesign(template, data, images, { scale: 1 })
      try {
        const blob = await toBlob(canvas, output, template.page)
        entries.push({
          // Zero-padded so the archive unzips in a stable, ordered sequence, and
          // named for the person rather than their id.
          name: `${String(index + 1).padStart(3, '0')} ${sanitizeFilename(name, output)}`,
          blob,
        })
      } finally {
        // Release the backing store before the next iteration allocates one.
        canvas.width = 0
        canvas.height = 0
      }
    } catch {
      failed.push({ name, reason: describe() })
    }

    onProgress?.({ completed: index + 1, total, currentName: name })
    await (onYield ?? nextFrame)()
  }

  return {
    entries,
    completed: entries.length,
    failed,
    filename: sanitizeFilename(`${event.name} badges (${total})`, 'zip'),
  }
}

/**
 * Bundles the run into one archive and hands it to the browser.
 *
 * Throws when nothing succeeded, because an empty archive is a silent failure the
 * organizer would only discover after opening it.
 */
export async function downloadBadgeArchive(result: BulkBadgeResult): Promise<void> {
  if (result.entries.length === 0) {
    throw new Error('No badges could be generated, so there is nothing to download.')
  }
  downloadBlob(await buildZip(result.entries), result.filename)
}
