import { describe, expect, it } from 'vitest'
import { readHeaderBytes, sniffAcceptedImageType, sniffImageType } from './imageType'

/**
 * The bytes decide, not the browser.
 *
 * `File.type` is supplied by the client, so a script renamed to `map.png`
 * arrives claiming `image/png`. These tests use real file signatures, because
 * the whole point is that the check does not trust the label.
 */

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0]
const GIF_87A_HEADER = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
const GIF_89A_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const RIFF_HEADER = [0x52, 0x49, 0x46, 0x46]

function bytes(...values: number[]): Uint8Array {
  // Pad to a full header so length is never the reason a match fails.
  return Uint8Array.from([...values, ...new Array(16).fill(0)])
}

function webp(): Uint8Array {
  const out = bytes(...RIFF_HEADER, 0x00, 0x00, 0x00, 0x00)
  out.set([0x57, 0x45, 0x42, 0x50], 8) // "WEBP" at offset 8
  return out
}

describe('sniffImageType', () => {
  it('detects PNG', () => {
    expect(sniffImageType(bytes(...PNG_HEADER))).toBe('image/png')
  })

  it('detects JPEG', () => {
    expect(sniffImageType(bytes(...JPEG_HEADER))).toBe('image/jpeg')
  })

  it.each([
    ['GIF87a', GIF_87A_HEADER],
    ['GIF89a', GIF_89A_HEADER],
  ])('detects %s', (_label, header) => {
    expect(sniffImageType(bytes(...header))).toBe('image/gif')
  })

  it('detects WebP from its RIFF container and payload tag', () => {
    expect(sniffImageType(webp())).toBe('image/webp')
  })

  it('does not call a bare RIFF container WebP', () => {
    // "RIFF" + size + "WAVE" is an audio file, not an image.
    const wav = bytes(...RIFF_HEADER, 0x00, 0x00, 0x00, 0x00)
    wav.set([0x57, 0x41, 0x56, 0x45], 8) // "WAVE"
    expect(sniffImageType(wav)).toBeNull()
  })

  it.each([
    ['an HTML document', [0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]],
    ['a PDF', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]],
    ['a zip archive', [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]],
    ['a shebang script', [0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e, 0x2f, 0x73, 0x68]],
    ['a PHP script', [0x3c, 0x3f, 0x70, 0x68, 0x70, 0x20, 0x65, 0x63, 0x68, 0x6f]],
  ])('rejects %s', (_label, header) => {
    expect(sniffImageType(bytes(...header))).toBeNull()
  })

  it('rejects a file too short to classify', () => {
    expect(sniffImageType(Uint8Array.from([0x89, 0x50]))).toBeNull()
  })

  it('rejects empty input', () => {
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })
})

describe('sniffAcceptedImageType', () => {
  it.each([
    [PNG_HEADER, 'image/png'],
    [JPEG_HEADER, 'image/jpeg'],
    [GIF_89A_HEADER, 'image/gif'],
  ])('accepts a supported type', (header, expected) => {
    expect(sniffAcceptedImageType(bytes(...header))).toBe(expected)
  })

  it('returns null for a non-image, so the caller rejects it once', () => {
    expect(sniffAcceptedImageType(bytes(0x3c, 0x3f, 0x70, 0x68, 0x70))).toBeNull()
  })
})

describe('readHeaderBytes', () => {
  it('reads only the leading bytes, not the whole file', async () => {
    // `as BlobPart` because a Uint8Array's buffer may be a SharedArrayBuffer,
    // which Blob does not accept.
    const file = new File([bytes(...PNG_HEADER) as BlobPart], 'map.png', { type: 'image/png' })
    const header = await readHeaderBytes(file)

    expect(header.length).toBe(16)
    expect(sniffImageType(header)).toBe('image/png')
  })

  it('returns fewer bytes for a file smaller than the header', async () => {
    const header = await readHeaderBytes(new File([Uint8Array.from([1, 2, 3])], 'tiny.png'))
    expect(header.length).toBe(3)
    expect(sniffImageType(header)).toBeNull()
  })
})
