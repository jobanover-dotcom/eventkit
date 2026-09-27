import { MAP_IMAGE_TYPES, type MapImageType } from '@/features/info/schemas/info.schema'

/**
 * Identifies an uploaded image by its bytes.
 *
 * `File.type` comes from the browser and is trivially forged — a PHP script
 * renamed to `map.png` arrives claiming `image/png`. Sniffing the magic number
 * is the actual trust boundary, and unlike `createImageBitmap` it works in Node,
 * which matters because a Server Action's file handling runs on the server.
 *
 * Pure and dependency-free, so it is unit-testable without a canvas.
 */

/** How many leading bytes are needed to classify any accepted format. */
const HEADER_BYTES = 16

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const GIF_87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
const GIF_89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

/** Returns the detected type, or null when the bytes are not a supported image. */
export function sniffImageType(bytes: Uint8Array): MapImageType | null {
  if (bytes.length < HEADER_BYTES) return null

  if (startsWith(bytes, PNG)) return 'image/png'
  if (startsWith(bytes, JPEG)) return 'image/jpeg'
  if (startsWith(bytes, GIF_87A) || startsWith(bytes, GIF_89A)) return 'image/gif'
  // WebP is a RIFF container, so the payload tag sits at offset 8.
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp'

  return null
}

/**
 * The detected type when it is one this module accepts.
 *
 * Returning null for both "not an image" and "an image type we do not accept"
 * keeps the caller from having to distinguish them, and both are rejected the
 * same way.
 */
export function sniffAcceptedImageType(bytes: Uint8Array): MapImageType | null {
  const detected = sniffImageType(bytes)
  return MAP_IMAGE_TYPES.includes(detected as MapImageType) ? detected : null
}

/** Reads only the header of a file, so a large image is not pulled into memory. */
export async function readHeaderBytes(file: Blob): Promise<Uint8Array> {
  const slice = file.slice(0, HEADER_BYTES)
  return new Uint8Array(await slice.arrayBuffer())
}
