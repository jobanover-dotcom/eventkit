import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { certificateVerificationUrl, type BulkRecipient } from './bulkGenerate'
import { SAMPLE_EVENT, SAMPLE_PARTICIPANT } from '@/features/design/lib/sampleData'
import { CERTIFICATE_TEMPLATES } from '@/features/design/lib/templates'
import type { ParticipantInfo } from '@/features/design/types'

/**
 * Bulk generation, with the canvas and PDF layers mocked out.
 *
 * What is worth proving here is the behaviour around the render loop rather than
 * the pixels: that a run reports progress, that one bad recipient does not cost
 * the organizer the rest of the batch, that canvases are released, and that the
 * archive refuses to be silently short.
 */

const renderDesign = vi.fn()
const canvasToPdfBlob = vi.fn()
const encodeQr = vi.fn()

vi.mock('@/features/design/lib/render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/design/lib/render')>()
  return { ...actual, renderDesign: (...args: unknown[]) => renderDesign(...args) }
})
vi.mock('@/features/design/lib/export', () => ({
  canvasToPdfBlob: (...args: unknown[]) => canvasToPdfBlob(...args),
}))
vi.mock('@/lib/qr', () => ({ encodeQr: (...args: unknown[]) => encodeQr(...args) }))
vi.mock('@/lib/zip', () => ({
  buildZip: vi.fn(),
  downloadBlob: vi.fn(),
}))

const { generateCertificatesInBulk } = await import('./bulkGenerate')

/** A canvas stand-in that records the moment its backing store was released. */
function fakeCanvas() {
  return { width: 3508, height: 2480, __released: false }
}

function recipient(index: number, role = 'Student'): BulkRecipient {
  const participant: ParticipantInfo = {
    ...SAMPLE_PARTICIPANT,
    id: `p${index}`,
    name: `Recipient ${index}`,
    sourceRole: role,
  }
  return { participant, verificationToken: `token${index}`.padEnd(64, '0') }
}

const template = CERTIFICATE_TEMPLATES[0]

beforeEach(() => {
  renderDesign.mockReset()
  canvasToPdfBlob.mockReset()
  encodeQr.mockReset()
  renderDesign.mockImplementation(async () => fakeCanvas())
  canvasToPdfBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  encodeQr.mockResolvedValue({ width: 512, height: 512 })
  // jsdom has no requestAnimationFrame-driven happy path for this loop; the
  // yield is injectable, so tests pass a resolved promise.
  ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= (
    callback: FrameRequestCallback
  ) => {
    callback(0)
    return 0
  }
})

afterEach(() => vi.restoreAllMocks())

const base = {
  event: SAMPLE_EVENT,
  certificateType: 'Participation' as const,
  template,
  origin: 'https://eventkit.app',
  onYield: async () => {},
}

describe('certificateVerificationUrl', () => {
  it('points at the public verification route with only the token', () => {
    const url = certificateVerificationUrl('https://eventkit.app', 'abc')
    expect(url).toBe('https://eventkit.app/verify/certificate/abc')
  })

  it('tolerates a trailing slash on the origin', () => {
    expect(certificateVerificationUrl('https://eventkit.app/', 'abc')).toBe(
      'https://eventkit.app/verify/certificate/abc'
    )
  })

  it('carries no personal data', () => {
    const url = certificateVerificationUrl('https://eventkit.app', 'abc')
    expect(url).not.toContain('@')
    expect(url.split('/').pop()).toBe('abc')
  })
})

describe('generateCertificatesInBulk', () => {
  it('produces one PDF per recipient', async () => {
    const result = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2), recipient(3)],
    })

    expect(result.entries).toHaveLength(3)
    expect(result.completed).toBe(3)
    expect(result.failed).toEqual([])
  })

  it('names entries so the archive unzips in order', async () => {
    const result = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2)],
    })

    expect(result.entries.map((entry) => entry.name)).toEqual([
      '001 Recipient 1.pdf',
      '002 Recipient 2.pdf',
    ])
  })

  it('encodes each recipient’s own verification token', async () => {
    await generateCertificatesInBulk({ ...base, recipients: [recipient(1), recipient(2)] })

    const payloads = encodeQr.mock.calls.map((call) => call[0] as string)
    expect(payloads).toHaveLength(2)
    expect(payloads[0]).toContain(recipient(1).verificationToken)
    expect(payloads[0]).not.toBe(payloads[1])
  })

  it('reports progress for every recipient', async () => {
    const seen: { completed: number; total: number }[] = []
    await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2), recipient(3)],
      onProgress: (progress) => seen.push({ completed: progress.completed, total: progress.total }),
    })

    expect(seen.map((entry) => entry.completed)).toEqual([0, 1, 1, 2, 2, 3])
    expect(seen.every((entry) => entry.total === 3)).toBe(true)
  })

  it('yields between recipients so the progress bar can paint', async () => {
    const onYield = vi.fn(async () => {})
    await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2)],
      onYield,
    })

    expect(onYield).toHaveBeenCalledTimes(2)
  })

  it('releases each canvas so a long run does not exhaust memory', async () => {
    const canvases: ReturnType<typeof fakeCanvas>[] = []
    renderDesign.mockImplementation(async () => {
      const canvas = fakeCanvas()
      canvases.push(canvas)
      return canvas
    })

    await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2), recipient(3)],
    })

    // A 3508×2480 canvas is ~35 MB. Every one of them is dropped to zero.
    expect(canvases).toHaveLength(3)
    for (const canvas of canvases) {
      expect(canvas.width).toBe(0)
      expect(canvas.height).toBe(0)
    }
  })

  it('collects a failure instead of aborting the batch', async () => {
    canvasToPdfBlob
      .mockResolvedValueOnce(new Blob(['pdf']))
      .mockRejectedValueOnce(new Error('This certificate could not be rendered.'))
      .mockResolvedValueOnce(new Blob(['pdf']))

    const result = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2), recipient(3)],
    })

    // Two of three still made it, and the third is named.
    expect(result.entries).toHaveLength(2)
    expect(result.completed).toBe(2)
    expect(result.failed).toEqual([
      { name: 'Recipient 2', reason: 'This certificate could not be rendered.' },
    ])
  })

  it('reports a render failure for one recipient without stopping the loop', async () => {
    renderDesign
      .mockResolvedValueOnce(fakeCanvas())
      .mockRejectedValueOnce(new Error('decode failed'))
      .mockResolvedValueOnce(fakeCanvas())

    const result = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2), recipient(3)],
    })

    expect(result.entries).toHaveLength(2)
    expect(result.failed[0]?.name).toBe('Recipient 2')
  })

  it('returns an empty result rather than throwing for no recipients', async () => {
    const result = await generateCertificatesInBulk({ ...base, recipients: [] })
    expect(result.entries).toEqual([])
    expect(result.completed).toBe(0)
  })

  it('names the archive after the group it generated for', async () => {
    const participants = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1)],
    })
    const speakers = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1, 'Speaker')],
    })

    expect(participants.filename).toContain('participants')
    expect(speakers.filename).toContain('speakers')
    expect(participants.filename.endsWith('.zip')).toBe(true)
  })
})
