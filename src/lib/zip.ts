/**
 * Streaming ZIP writer.
 *
 * A bulk certificate run produces one PDF per recipient, and handing an
 * organizer 45 separate browser downloads does not work: Chrome prompts for
 * multiple-download permission, Safari silently drops all but one, and Firefox
 * queues them. A single archive is the only reliable answer at this size.
 *
 * `client-zip` is used rather than a full archiver because it streams entries
 * as they are added and has no dependencies, so a 45-certificate archive is
 * assembled incrementally instead of held as one buffer that grows without
 * bound.
 */

export type ZipEntry = {
  /** Path inside the archive. Forward slashes only. */
  name: string
  blob: Blob
}

export async function buildZip(entries: readonly ZipEntry[]): Promise<Blob> {
  if (entries.length === 0) {
    throw new Error('There is nothing to download.')
  }

  const { downloadZip } = await import('client-zip')

  // client-zip reads each entry's bytes from an `input` key. An object with a
  // `name` and no `input` matches its *folder* variant instead, so passing our
  // own shape straight through yields a well-formed archive of empty entries:
  // one correctly named empty item per recipient, and no error anywhere. That
  // failure is invisible, so the mapping is explicit and load-bearing — and the
  // wrong version still type-checks, because the folder variant accepts any
  // extra properties.
  return downloadZip(entries.map(({ name, blob }) => ({ name, input: blob }))).blob()
}

/**
 * Triggers a browser download for a blob.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * synchronously after `.click()` can cancel the download in some browsers,
 * because the navigation has not started reading the blob yet.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = href
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  setTimeout(() => URL.revokeObjectURL(href), 30_000)
}
