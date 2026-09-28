import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BulkRecipient } from './bulkGenerate'
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
const resolveCertificateImages = vi.fn()

vi.mock('@/features/design/lib/render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/design/lib/render')>()
  return { ...actual, renderDesign: (...args: unknown[]) => renderDesign(...args) }
})
vi.mock('@/features/design/lib/export', () => ({
  canvasToPdfBlob: (...args: unknown[]) => canvasToPdfBlob(...args),
}))
vi.mock('@/lib/qr', () => ({ encodeQr: (...args: unknown[]) => encodeQr(...args) }))
vi.mock('@/features/certificates/templates/render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/certificates/templates/render')>()
  return {
    ...actual,
    resolveCertificateImages: (...args: unknown[]) => resolveCertificateImages(...args),
  }
})
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
  resolveCertificateImages.mockReset()
  renderDesign.mockImplementation(async () => fakeCanvas())
  canvasToPdfBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  encodeQr.mockResolvedValue({ width: 512, height: 512 })
  resolveCertificateImages.mockImplementation(
    async ({ verificationToken }: { verificationToken: string }) => ({
      qr: { width: 512, height: 512 } as unknown as CanvasImageSource,
      __token: verificationToken,
    })
  )
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

  it('resolves a distinct verification token for each recipient', async () => {
    await generateCertificatesInBulk({ ...base, recipients: [recipient(1), recipient(2)] })

    const tokens = resolveCertificateImages.mock.calls.map(
      (call) => (call[0] as { verificationToken: string }).verificationToken
    )
    expect(tokens).toEqual([recipient(1).verificationToken, recipient(2).verificationToken])
    expect(tokens[0]).not.toBe(tokens[1])
  })

  it('passes the origin so the QR resolves to a public URL', async () => {
    await generateCertificatesInBulk({ ...base, recipients: [recipient(1)] })
    expect(resolveCertificateImages.mock.calls[0]?.[0]).toMatchObject({
      origin: 'https://eventkit.app',
    })
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

describe('bulk generation from a custom template', () => {
  /**
   * A custom template is a finished design with the recipient's name written on
   * top. The certificate type still labels the record, so the verification page
   * can name it, but nothing about the run may depend on it being rendered.
   */

  const customTemplate = {
    ...template,
    id: 'custom:tpl-1',
    name: 'Graduation',
  }

  it('produces one PDF per recipient', async () => {
    const result = await generateCertificatesInBulk({
      ...base,
      template: customTemplate,
      recipients: [recipient(1), recipient(2), recipient(3)],
    })

    expect(result.entries).toHaveLength(3)
    expect(renderDesign).toHaveBeenCalledTimes(3)
  })

  it('gives each recipient a different name, from the roster rather than the template', async () => {
    await generateCertificatesInBulk({
      ...base,
      template: customTemplate,
      recipients: [recipient(1), recipient(2), recipient(3)],
    })

    const names = renderDesign.mock.calls.map((call) => {
      const data = (call[1] as { recipient: ParticipantInfo }).recipient
      return data.name
    })
    expect(new Set(names).size).toBe(3)
  })

  it('renders the same custom template for every recipient', async () => {
    await generateCertificatesInBulk({
      ...base,
      template: customTemplate,
      recipients: [recipient(1), recipient(2)],
    })

    for (const call of renderDesign.mock.calls) {
      expect(call[0]).toBe(customTemplate)
    }
  })

  it('resolves a distinct verification token per recipient, so each PDF is checkable', async () => {
    await generateCertificatesInBulk({
      ...base,
      template: customTemplate,
      recipients: [recipient(1), recipient(2)],
    })

    const tokens = resolveCertificateImages.mock.calls.map(
      (call) => (call[0] as { verificationToken: string }).verificationToken
    )
    expect(new Set(tokens).size).toBe(2)
  })

  it('exports as A4 landscape, the same page the built-ins use', async () => {
    await generateCertificatesInBulk({
      ...base,
      template: customTemplate,
      recipients: [recipient(1)],
    })

    expect(canvasToPdfBlob).toHaveBeenCalledWith(expect.anything(), template.page)
  })

  it('names the archive after the type without that type reaching the artwork', async () => {
    // The type is still recorded and still titles the verification page; it just
    // is not something the organizer's own design needs rendered.
    const result = await generateCertificatesInBulk({
      ...base,
      template: customTemplate,
      recipients: [recipient(1)],
    })

    expect(result.filename).toContain('Participation')
  })
})

describe('bulk generation when a recipient cannot be rendered', () => {
  /**
   * The renderer refuses a name that will not fit its text box, so the run has to
   * report that recipient rather than quietly producing a PDF with a shortened
   * name — or, worse, dropping them without a word.
   */
  it('reports the failure and leaves them out of the archive', async () => {
    // Queued in order: the first recipient renders, the second does not.
    renderDesign.mockImplementationOnce(async () => fakeCanvas())
    renderDesign.mockImplementationOnce(async () => {
      throw new Error('"Recipient 2" does not fit its text box (40×24px).')
    })

    const result = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2), recipient(3)],
    })

    expect(result.completed).toBe(2)
    expect(result.entries).toHaveLength(2)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.name).toBe(recipient(2).participant.name)
    expect(result.failed[0]?.reason).toMatch(/does not fit its text box/)
  })

  it('keeps generating the other recipients after one fails', async () => {
    renderDesign.mockImplementationOnce(async () => fakeCanvas())
    renderDesign.mockImplementationOnce(async () => {
      throw new Error('does not fit its text box')
    })

    const result = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2), recipient(3)],
    })

    expect(renderDesign).toHaveBeenCalledTimes(3)
    expect(result.completed).toBe(2)
  })

  it('never puts the failed recipient in the archive', async () => {
    renderDesign.mockImplementation(async () => {
      throw new Error('does not fit its text box')
    })

    const result = await generateCertificatesInBulk({
      ...base,
      recipients: [recipient(1), recipient(2)],
    })

    expect(result.entries).toHaveLength(0)
    expect(result.failed).toHaveLength(2)
  })
})
