import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { canvasToPdfBlob, downloadPng, sanitizeFilename } from './export'
import { buildZip, type ZipEntry } from '@/lib/zip'
import { readZipEntries } from '@/test/zipReader'
import { withBlobStream } from '@/test/blobStream'

/**
 * PDF export, asserted on the bytes that come out.
 *
 * The reason this file exists: a bulk run produced one correctly named but
 * *empty* file per recipient, and the failure was invisible from the outside
 * because the archive was well-formed and non-zero in size. Nothing was checking
 * that a generated PDF actually contained a picture.
 *
 * jsPDF embeds the raster uncompressed, so the image XObject's dictionary states
 * its true width and height. That gives a content assertion rather than a length
 * one: a certificate exported without its artwork, or as a blank page, cannot
 * present a matching `/Width` and `/Height` XObject at all.
 */

/** A real PNG, so the PDF is built from genuine image bytes. */
function pngDataUrl(width: number, height: number, rgb: [number, number, number]): string {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4
    png.data[offset] = rgb[0]
    png.data[offset + 1] = rgb[1]
    png.data[offset + 2] = rgb[2]
    png.data[offset + 3] = 255
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

/** A canvas stand-in: `buildPdf` only reads its size and rasterises it. */
function fakeCanvas(width: number, height: number, body: string): HTMLCanvasElement {
  return {
    width,
    height,
    toDataURL: () => body,
  } as unknown as HTMLCanvasElement
}

async function pdfText(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString('latin1')
}

const A4_LANDSCAPE = { format: 'a4', orientation: 'landscape' } as const

describe('canvasToPdfBlob', () => {
  it('produces a structurally valid PDF', async () => {
    const blob = await canvasToPdfBlob(
      fakeCanvas(1920, 1080, pngDataUrl(1920, 1080, [12, 34, 56])),
      A4_LANDSCAPE
    )

    expect(blob.type).toBe('application/pdf')
    expect(await pdfText(blob)).toMatch(/^%PDF-/)
  })

  it('embeds the raster at the canvas size, so the artwork is really in there', async () => {
    const text = await pdfText(
      await canvasToPdfBlob(
        fakeCanvas(1920, 1080, pngDataUrl(1920, 1080, [12, 34, 56])),
        A4_LANDSCAPE
      )
    )

    expect(text).toContain('/Subtype /Image')
    expect(text).toMatch(/\/Width\s+1920/)
    expect(text).toMatch(/\/Height\s+1080/)
  })

  it('embeds the full pixel data rather than a placeholder', async () => {
    // jsPDF stores the raster uncompressed as 8-bit RGB, so the stream length is
    // width x height x 3. A blank or dropped image cannot reach this size.
    const text = await pdfText(
      await canvasToPdfBlob(fakeCanvas(400, 300, pngDataUrl(400, 300, [1, 2, 3])), A4_LANDSCAPE)
    )

    expect(text).toMatch(/\/Length\s+360000/)
  })

  it('fails loudly rather than writing a blank PDF when the raster is empty', async () => {
    // The requirement is that a broken export is never silent. jsPDF rejects an
    // unreadable image, so a certificate cannot come out as a valid-looking but
    // empty page: the run reports the failure and names the recipient.
    await expect(
      canvasToPdfBlob(
        { width: 1920, height: 1080, toDataURL: () => '' } as unknown as HTMLCanvasElement,
        A4_LANDSCAPE
      )
    ).rejects.toThrow()
  })

  it('honours a declared page, filling it exactly with no margin', async () => {
    const text = await pdfText(
      await canvasToPdfBlob(fakeCanvas(1920, 1080, pngDataUrl(1920, 1080, [9, 9, 9])), A4_LANDSCAPE)
    )

    // A4 landscape: 297mm x 210mm, which jsPDF writes in points at full float
    // precision.
    expect(text).toMatch(/\/MediaBox\s*\[0 0 841\.88\d* 595\.27\d*\]/)
  })

  it('falls back to a fitted A4 portrait page when none is declared', async () => {
    const text = await pdfText(
      await canvasToPdfBlob(fakeCanvas(1200, 1600, pngDataUrl(1200, 1600, [4, 5, 6])))
    )
    expect(text).toMatch(/\/MediaBox\s*\[0 0 595\.27\d* 841\.88\d*\]/)
  })
})

describe('a generated certificate inside an archive', () => {
  it('lands the artwork in the PDF, not just a valid container', async () => {
    // The end-to-end shape of the reported bug: an archive that looks right and
    // contains nothing. Asserted on the extracted PDF's own image XObject.
    const pdf = await canvasToPdfBlob(
      fakeCanvas(1920, 1080, pngDataUrl(1920, 1080, [200, 30, 90])),
      A4_LANDSCAPE
    )

    const entries: ZipEntry[] = [
      { name: '001 Juan Dela Cruz.pdf', blob: withBlobStream(pdf) },
      { name: '002 Ana Reyes.pdf', blob: withBlobStream(pdf) },
    ]

    const archive = await buildZip(entries)
    expect(archive.size).toBeGreaterThan(0)

    // Entries are read back out of the archive rather than sniffed in its bytes,
    // because a large entry is deflated and its PDF would not be visible there.
    const extracted = await readZipEntries(archive)
    expect(extracted.map((entry) => entry.name)).toEqual([
      '001 Juan Dela Cruz.pdf',
      '002 Ana Reyes.pdf',
    ])

    for (const entry of extracted) {
      expect(entry.uncompressedSize, entry.name).toBeGreaterThan(0)
      const text = new TextDecoder('latin1').decode(entry.data)
      expect(text, entry.name).toMatch(/^%PDF-/)
      expect(text, entry.name).toMatch(/\/Subtype\s*\/Image/)
      // The certificate's own dimensions, so a blank or dropped artwork fails.
      expect(text, entry.name).toMatch(/\/Width\s+1920/)
      expect(text, entry.name).toMatch(/\/Height\s+1080/)
    }
  })
})

/**
 * Download names are built from participant names, which arrive from a public
 * registration form. This is the boundary that keeps a crafted name from
 * turning into a path or a shell surprise.
 */
describe('sanitizeFilename', () => {
  it('keeps an ordinary name intact', () => {
    expect(sanitizeFilename('Maria Dela Cruz', 'png')).toBe('Maria Dela Cruz.png')
  })

  it('replaces path separators and reserved characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j', 'png')).toBe('a-b-c-d-e-f-g-h-i-j.png')
  })

  it('does not let a name escape into a directory', () => {
    const result = sanitizeFilename('../../etc/passwd', 'png')
    expect(result).not.toContain('/')
    expect(result).not.toContain('..')
  })

  it('strips control characters', () => {
    const result = sanitizeFilename(
      `bad${String.fromCharCode(0)}name${String.fromCharCode(7)}`,
      'png'
    )
    expect(result).toBe('badname.png')
  })

  it('collapses whitespace and trims the edges', () => {
    expect(sanitizeFilename('  spaced    out  ', 'png')).toBe('spaced out.png')
  })

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFilename('   ', 'png')).toBe('design.png')
    expect(sanitizeFilename('...', 'png')).toBe('design.png')
  })

  it('caps the length', () => {
    const result = sanitizeFilename('x'.repeat(500), 'png')
    expect(result.length).toBeLessThanOrEqual(84)
  })

  it('normalises the extension', () => {
    expect(sanitizeFilename('name', 'PNG')).toBe('name.png')
    expect(sanitizeFilename('name', '../exe')).toBe('name.exe')
  })

  it('never returns an empty extension', () => {
    expect(sanitizeFilename('name', '...')).toBe('name.png')
  })
})

describe('downloadPng', () => {
  it('refuses rather than downloading an empty file', async () => {
    const created: string[] = []
    const originalCreate = URL.createObjectURL
    const originalClick = HTMLAnchorElement.prototype.click
    URL.createObjectURL = ((blob: Blob) => {
      created.push(String(blob.size))
      return 'blob:stub'
    }) as typeof URL.createObjectURL
    HTMLAnchorElement.prototype.click = () => {}

    try {
      await expect(
        downloadPng(
          {
            toBlob: (callback: (value: Blob | null) => void) => callback(null),
          } as unknown as HTMLCanvasElement,
          'x'
        )
      ).rejects.toThrow(/prepared/i)
      expect(created).toHaveLength(0)
    } finally {
      URL.createObjectURL = originalCreate
      HTMLAnchorElement.prototype.click = originalClick
    }
  })
})
