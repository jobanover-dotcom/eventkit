import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParticipantInfo } from '@/features/design/types'
import { SAMPLE_EVENT } from '@/features/design/lib/sampleData'
import { BADGE_TEMPLATES } from '@/features/design/lib/templates'

/**
 * Bulk badge generation, with the renderer stubbed at its boundaries.
 *
 * The properties that matter for a badge specifically, rather than for the
 * certificate flow this mirrors:
 *
 *  1. Every badge carries *its own* participant's existing check-in token, and no
 *     token is created, rotated, or written anywhere a human or a filename can
 *     read it. A badge that printed somebody else's door code would be a
 *     check-in security bug, not a cosmetic one.
 *  2. The logo and the QR are resolved by the same call the single-badge flow
 *     uses, so a bulk badge is the same pixels as a solo one.
 *  3. One participant who will not render costs that badge and nothing else.
 */

const renderDesign = vi.fn()
const resolveDesignImages = vi.fn()
const canvasToPdfBlob = vi.fn()
const canvasToBlob = vi.fn()
const buildZip = vi.fn()
const downloadBlob = vi.fn()

vi.mock('@/features/design/lib/render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/design/lib/render')>()
  return { ...actual, renderDesign, resolveDesignImages, canvasToBlob }
})
vi.mock('@/features/design/lib/export', () => ({ canvasToPdfBlob, supportsOutput: () => true }))
vi.mock('@/lib/zip', () => ({ buildZip, downloadBlob }))

const { downloadBadgeArchive, generateBadgesInBulk } = await import('./bulkBadges')

/** A canvas stand-in that records the moment its backing store was released. */
function fakeCanvas() {
  return { width: 1080, height: 1350, __released: false }
}

function participant(index: number, overrides: Partial<ParticipantInfo> = {}): ParticipantInfo {
  return {
    id: `p-${index}`,
    name: `Person ${index}`,
    code: `STU-${index}`,
    course: 'BSCS',
    yearSection: '3A',
    sourceRole: 'Student',
    title: null,
    organization: null,
    qrToken: `qr-token-${index}`,
    checkedIn: index % 2 === 0,
    ...overrides,
  }
}

function target(index: number, overrides: Partial<ParticipantInfo> = {}) {
  const person = participant(index, overrides)
  return { participant: person, role: 'Participant' as const }
}

const TEMPLATE = BADGE_TEMPLATES[0]!

/** Records the images resolved per call, so per-participant resolution is visible. */
let resolvedData: unknown[] = []

beforeEach(() => {
  vi.clearAllMocks()
  resolvedData = []

  renderDesign.mockImplementation(() => {
    const canvas = fakeCanvas()
    return Promise.resolve({
      ...canvas,
      set width(value: number) {
        canvas.width = value
        canvas.__released = value === 0
      },
      set height(value: number) {
        canvas.height = value
      },
    })
  })
  resolveDesignImages.mockImplementation(({ data }: { data: unknown }) => {
    resolvedData.push(data)
    return Promise.resolve({})
  })
  canvasToPdfBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  canvasToBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  buildZip.mockResolvedValue(new Blob(['zip']))
})

describe('generateBadgesInBulk', () => {
  it('produces one entry per participant', async () => {
    const result = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2), target(3)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    expect(result.entries).toHaveLength(3)
    expect(result.completed).toBe(3)
    expect(result.failed).toEqual([])
  })

  it('gives each badge its own participant, never a shared one', async () => {
    await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    const names = resolvedData.map(
      (data) => (data as { participant: { name: string } }).participant.name
    )
    expect(names).toEqual(['Person 1', 'Person 2'])
  })

  it('resolves each badge through the shared image path, QR included', async () => {
    await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    // The same call the single-badge preview uses, with the QR on. Not a
    // badge-specific resolver that could drift from it.
    expect(resolveDesignImages).toHaveBeenCalledTimes(2)
    resolvedData.forEach((data) => {
      expect((data as { participant: { qrToken: string } }).participant.qrToken).toMatch(
        /^qr-token-/
      )
    })
    expect(resolveDesignImages).toHaveBeenCalledWith(expect.objectContaining({ includeQr: true }))
  })

  it('reads each participant\u2019s own existing token and mints none', async () => {
    const people = [participant(1), participant(2)]
    const seen: string[] = []

    resolveDesignImages.mockImplementation(
      ({ data }: { data: { participant: ParticipantInfo } }) => {
        seen.push(data.participant.qrToken)
        return Promise.resolve({})
      }
    )

    await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: people.map((person) => ({ participant: person, role: 'Participant' as const })),
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    // Distinct, and identical to what the records already held.
    expect(seen).toEqual(['qr-token-1', 'qr-token-2'])
    expect(new Set(seen).size).toBe(2)
  })

  it('never puts a token in a filename', async () => {
    const result = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [participant(1), participant(2)].map((person) => ({
        participant: person,
        role: 'Participant' as const,
      })),
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    result.entries.forEach((entry) => {
      expect(entry.name).not.toContain('qr-token')
      expect(entry.name).not.toContain('p-1')
      expect(entry.name).not.toContain('p-2')
    })
  })

  it('names entries so the archive unzips in a stable order', async () => {
    const result = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2), target(3)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    expect(result.entries.map((entry) => entry.name)).toEqual([
      '001 Person 1.pdf',
      '002 Person 2.pdf',
      '003 Person 3.pdf',
    ])
  })

  it('uses the chosen format, and the template\u2019s own page for PDF', async () => {
    await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })
    expect(canvasToPdfBlob).toHaveBeenCalledWith(expect.anything(), TEMPLATE.page)
    expect(canvasToBlob).not.toHaveBeenCalled()

    vi.clearAllMocks()
    resolveDesignImages.mockResolvedValue({})
    canvasToBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))

    const png = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1)],
      template: TEMPLATE,
      output: 'png',
      onYield: () => Promise.resolve(),
    })
    expect(png.entries[0]?.name).toBe('001 Person 1.png')
    expect(canvasToBlob).toHaveBeenCalled()
    expect(canvasToPdfBlob).not.toHaveBeenCalled()
  })

  it('neutralizes a name that would otherwise break a filename', async () => {
    const result = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1, { name: '../../etc/passwd' })],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    // Sanitizing neutralizes the separator and the dot run rather than dropping the
    // path, so the assertion is that nothing traversable survives.
    const name = result.entries[0]?.name ?? ''
    expect(name).not.toContain('..')
    expect(name).not.toContain('/')
    expect(name).not.toContain('\\')
    expect(name).toBe('001 -.-etc-passwd.pdf')
  })

  it('renders the organizer\u2019s role choice onto the badge', async () => {
    await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [{ participant: participant(1), role: 'Speaker' }],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    expect((resolvedData[0] as { role: string }).role).toBe('Speaker')
  })

  it('reports progress for every badge, before and after', async () => {
    const seen: number[] = []
    await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2)],
      template: TEMPLATE,
      output: 'pdf',
      onProgress: (progress) => seen.push(progress.completed),
      onYield: () => Promise.resolve(),
    })

    expect(seen).toEqual([0, 1, 1, 2])
  })

  it('yields between badges so the progress bar can paint', async () => {
    const onYield = vi.fn(() => Promise.resolve())

    await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2), target(3)],
      template: TEMPLATE,
      output: 'pdf',
      onYield,
    })

    expect(onYield).toHaveBeenCalledTimes(3)
  })

  it('releases each canvas so a long run does not exhaust memory', async () => {
    const created: { __released: boolean }[] = []

    renderDesign.mockImplementation(() => {
      const record = { __released: false }
      created.push(record)
      return Promise.resolve({
        get width() {
          return 1080
        },
        set width(value: number) {
          record.__released = value === 0
        },
        get height() {
          return 1350
        },
        set height(_value: number) {},
      })
    })

    await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    expect(created).toHaveLength(2)
    created.forEach((canvas) => expect(canvas.__released).toBe(true))
  })

  it('collects a failure instead of aborting the run', async () => {
    renderDesign.mockImplementationOnce(() => Promise.reject(new Error('boom')))

    const result = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    expect(result.entries).toHaveLength(1)
    expect(result.completed).toBe(1)
    expect(result.failed).toEqual([
      { name: 'Person 1', reason: 'This badge could not be rendered.' },
    ])
  })

  it('does not leak an internal error message into a failure', async () => {
    // The failure list is organizer-facing, and a deep failure could carry text
    // from image or QR encoding.
    renderDesign.mockImplementationOnce(() =>
      Promise.reject(new Error('encodeQr failed for token qr-token-1'))
    )

    const result = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    const text = JSON.stringify(result.failed)
    expect(text).not.toContain('qr-token')
    expect(text).not.toContain('encodeQr')
  })

  it('returns an empty result rather than throwing for no targets', async () => {
    const result = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    expect(result.entries).toEqual([])
    expect(result.completed).toBe(0)
  })

  it('names the archive after the event and how many badges it holds', async () => {
    const result = await generateBadgesInBulk({
      event: SAMPLE_EVENT,
      targets: [target(1), target(2)],
      template: TEMPLATE,
      output: 'pdf',
      onYield: () => Promise.resolve(),
    })

    expect(result.filename).toMatch(/\.zip$/)
    expect(result.filename).toContain('2')
  })
})

describe('downloadBadgeArchive', () => {
  it('builds one archive and downloads it', async () => {
    await downloadBadgeArchive({
      entries: [{ name: '001 Person 1.pdf', blob: new Blob(['a']) }],
      completed: 1,
      failed: [],
      filename: 'badges.zip',
    })

    expect(buildZip).toHaveBeenCalledTimes(1)
    expect(downloadBlob).toHaveBeenCalledWith(expect.anything(), 'badges.zip')
  })

  it('refuses to hand over an empty archive', async () => {
    // A silent zero-file ZIP is a failure the organizer would only find on opening.
    await expect(
      downloadBadgeArchive({ entries: [], completed: 0, failed: [], filename: 'badges.zip' })
    ).rejects.toThrow(/nothing to download/i)

    expect(downloadBlob).not.toHaveBeenCalled()
  })
})
