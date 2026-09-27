import { describe, expect, it } from 'vitest'
import { buildZip, type ZipEntry } from './zip'
import { readZipEntries } from '@/test/zipReader'
import { withBlobStream } from '@/test/blobStream'

/**
 * The ZIP writer, asserted by reading the archive back.
 *
 * This exists because of a bug that no amount of "did it throw?" testing would
 * have caught. `client-zip` reads each entry's bytes from an `input` key. An
 * object carrying a `name` and a `blob` matches its *folder* variant instead, so
 * the archive came out well-formed, threw nothing, had exactly the right number
 * of correctly named entries — and every one of them was empty. An organizer
 * opened the ZIP to find one blank item per recipient.
 *
 * A length check alone would not have caught it either: the broken archive was
 * 160 bytes, comfortably non-zero. So these tests parse the central directory,
 * extract each entry's bytes, and compare them to what went in.
 */

/** A stand-in for a generated PDF. The content only has to be non-trivial. */
function pdfBytes(marker: string): Blob {
  const header = new TextEncoder().encode(`%PDF-1.7\n${marker}\n`)
  return withBlobStream(
    new Blob([header, new Uint8Array(2048).fill(header[0]!)], { type: 'application/pdf' })
  )
}

describe('buildZip', () => {
  it('refuses an empty run', async () => {
    await expect(buildZip([])).rejects.toThrow(/nothing to download/i)
  })

  it('produces an archive with one entry per certificate', async () => {
    const entries: ZipEntry[] = [
      { name: '001 Ana Reyes.pdf', blob: pdfBytes('ana') },
      { name: '002 Ben Cruz.pdf', blob: pdfBytes('ben') },
    ]

    const read = await readZipEntries(await buildZip(entries))
    expect(read).toHaveLength(2)
    expect(read.map((entry) => entry.name)).toEqual(['001 Ana Reyes.pdf', '002 Ben Cruz.pdf'])
  })

  it('puts the actual file contents in each entry', async () => {
    // The regression this suite was written for. The broken mapping produced one
    // correctly named entry per recipient and not one byte of content.
    const original = pdfBytes('juan')
    const [entry] = await readZipEntries(await buildZip([{ name: '001 Juan.pdf', blob: original }]))

    expect(entry).toBeDefined()
    const expected = new Uint8Array(await original.arrayBuffer())
    expect(entry!.uncompressedSize).toBe(expected.length)
    expect(entry!.data.length).toBe(expected.length)
    expect(Array.from(entry!.data.subarray(0, 20))).toEqual(Array.from(expected.subarray(0, 20)))
  })

  it('keeps entries independent, with no content bleeding between them', async () => {
    const read = await readZipEntries(
      await buildZip([
        { name: '001 Ana.pdf', blob: pdfBytes('ANA-MARKER') },
        { name: '002 Ben.pdf', blob: pdfBytes('BEN-MARKER') },
      ])
    )

    const asText = read.map((entry) => new TextDecoder().decode(entry.data))
    expect(asText[0]).toContain('ANA-MARKER')
    expect(asText[0]).not.toContain('BEN-MARKER')
    expect(asText[1]).toContain('BEN-MARKER')
    expect(asText[1]).not.toContain('ANA-MARKER')
  })

  it('preserves order, so the archive unzips in sequence', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'].map(
      (letter) => `00${letter.charCodeAt(0) - 96} ${letter}.pdf`
    )
    const read = await readZipEntries(
      await buildZip(names.map((name) => ({ name, blob: pdfBytes(name) })))
    )
    expect(read.map((entry) => entry.name)).toEqual(names)
  })

  it('scales to a realistic bulk run', async () => {
    const entries: ZipEntry[] = Array.from({ length: 45 }, (_, index) => ({
      name: `${String(index + 1).padStart(3, '0')} Recipient ${index + 1}.pdf`,
      blob: pdfBytes(`recipient-${index}`),
    }))

    const blob = await buildZip(entries)
    const read = await readZipEntries(blob)

    expect(read).toHaveLength(45)
    for (const [index, entry] of read.entries()) {
      expect(entry.uncompressedSize, entry.name).toBeGreaterThan(0)
      expect(new TextDecoder().decode(entry.data), entry.name).toContain(`recipient-${index}`)
    }
  })

  it('carries a name with a space and a non-ASCII character through intact', async () => {
    // Filenames come from real names, so this is the common case rather than an
    // edge one.
    const read = await readZipEntries(
      await buildZip([{ name: '001 María de la Cruz.pdf', blob: pdfBytes('maria') }])
    )
    expect(read[0]?.name).toBe('001 María de la Cruz.pdf')
  })
})
