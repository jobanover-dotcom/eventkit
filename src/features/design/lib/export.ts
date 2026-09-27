import type { jsPDF } from 'jspdf'
import type { DesignTemplate, PdfPage } from '@/features/design/lib/types'
import { sanitizeFilename } from '@/lib/filename'
import { canvasToBlob, canvasToPngDataUrl } from '@/features/design/lib/render'

/**
 * Download helpers.
 *
 * jsPDF is imported dynamically: it is by far the heaviest dependency in the
 * project and only the certificate, badge, and poster flows need it, so it must
 * not sit in the shared bundle.
 */

const A4_PORTRAIT_MM = { width: 210, height: 297 }
const A4_LANDSCAPE_MM = { width: 297, height: 210 }

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export async function downloadPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await canvasToBlob(canvas)
  if (!blob) throw new Error('The image could not be prepared for download.')
  triggerDownload(URL.createObjectURL(blob), sanitizeFilename(filename, 'png'))
}

/**
 * Builds the jsPDF document for a rendered canvas.
 *
 * Extracted so a bulk run can collect the bytes instead of saving one file per
 * certificate. A design with a declared `page` fills that page exactly;
 * otherwise the image is fitted into A4 portrait with a margin, so nothing is
 * cropped.
 */
async function buildPdf(canvas: HTMLCanvasElement, page?: PdfPage): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf')

  const orientation = page?.orientation ?? 'portrait'
  const size = orientation === 'landscape' ? A4_LANDSCAPE_MM : A4_PORTRAIT_MM
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })

  const margin = page ? 0 : 10
  const availableWidth = size.width - margin * 2
  const availableHeight = size.height - margin * 2
  const ratio = canvas.width / canvas.height

  let width = availableWidth
  let height = width / ratio
  if (height > availableHeight) {
    height = availableHeight
    width = height * ratio
  }

  pdf.addImage(
    canvasToPngDataUrl(canvas),
    'PNG',
    (size.width - width) / 2,
    (size.height - height) / 2,
    width,
    height
  )

  return pdf
}

export async function downloadPdf(
  canvas: HTMLCanvasElement,
  filename: string,
  page?: PdfPage
): Promise<void> {
  const pdf = await buildPdf(canvas, page)
  pdf.save(sanitizeFilename(filename, 'pdf'))
}

/**
 * The same page as `downloadPdf`, as bytes.
 *
 * Used by bulk generation, which needs every certificate in one archive. Kept
 * next to the single-file path so the two cannot drift apart in page size,
 * orientation, or fit.
 */
export async function canvasToPdfBlob(canvas: HTMLCanvasElement, page?: PdfPage): Promise<Blob> {
  const pdf = await buildPdf(canvas, page)
  return pdf.output('blob')
}

export { sanitizeFilename }

export function supportsOutput(template: DesignTemplate<never>, output: 'png' | 'pdf'): boolean {
  return template.outputs.includes(output)
}
