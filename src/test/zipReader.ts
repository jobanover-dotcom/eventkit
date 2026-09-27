/**
 * A minimal ZIP reader for tests.
 *
 * The bulk-download path is the one place a failure is invisible from the
 * outside: an archive can be structurally valid, correctly named, and still hold
 * nothing. Asserting on the writer's return value proves nothing, so the archive
 * is taken apart and its entries compared to what went in.
 *
 * This reads the central directory rather than scanning, so it agrees with what a
 * real extractor does, and it inflates deflated entries because `client-zip` uses
 * `CompressionStream` when the runtime offers one. Both methods are therefore
 * handled, and an unknown one throws rather than returning plausible nonsense.
 */

export type ReadZipEntry = {
  name: string
  uncompressedSize: number
  data: Uint8Array
}

const SIG_LOCAL = [0x50, 0x4b, 0x03, 0x04]
const SIG_CENTRAL = [0x50, 0x4b, 0x01, 0x02]
const SIG_EOCD = [0x50, 0x4b, 0x05, 0x06]

const METHOD_STORED = 0
const METHOD_DEFLATE = 8

function matches(bytes: Uint8Array, at: number, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[at + index] === byte)
}

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8)
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0
  )
}

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Reads an archive into its entries, in the order they appear. */
export async function readZipEntries(blob: Blob): Promise<ReadZipEntry[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer())

  const eocd = findFromEnd(bytes, SIG_EOCD)
  const count = u16(bytes, eocd + 10)

  const entries: ReadZipEntry[] = []
  let cursor = 0

  for (let i = 0; i < count; i += 1) {
    const central = find(bytes, SIG_CENTRAL, cursor)
    if (central < 0) throw new Error('no central directory record')

    const method = u16(bytes, central + 10)
    const compressedSize = u32(bytes, central + 20)
    const uncompressedSize = u32(bytes, central + 24)
    const nameLength = u16(bytes, central + 28)
    const extraLength = u16(bytes, central + 30)
    const commentLength = u16(bytes, central + 32)
    const localOffset = u32(bytes, central + 42)
    const name = new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + nameLength))

    if (!matches(bytes, localOffset, SIG_LOCAL)) throw new Error(`no local header for ${name}`)

    // The local header repeats the name and extra-field lengths, and the extra
    // field there can differ from the central one, so the data offset comes from
    // the local header rather than being assumed.
    const localNameLength = u16(bytes, localOffset + 26)
    const localExtraLength = u16(bytes, localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const raw = bytes.subarray(start, start + compressedSize)

    let data: Uint8Array
    if (method === METHOD_STORED) {
      data = raw.slice()
    } else if (method === METHOD_DEFLATE) {
      data = await inflate(raw)
    } else {
      throw new Error(`unsupported compression method ${method} in ${name}`)
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`${name}: expected ${uncompressedSize} bytes, read ${data.length}`)
    }

    entries.push({ name, uncompressedSize, data })
    cursor = central + 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function find(bytes: Uint8Array, signature: readonly number[], from: number): number {
  for (let i = from; i + signature.length <= bytes.length; i += 1) {
    if (matches(bytes, i, signature)) return i
  }
  return -1
}

function findFromEnd(bytes: Uint8Array, signature: readonly number[]): number {
  for (let i = bytes.length - signature.length; i >= 0; i -= 1) {
    if (matches(bytes, i, signature)) return i
  }
  throw new Error('not a ZIP: no end-of-central-directory record')
}
