import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The event logo write, against a mocked Supabase client.
 *
 * The security-relevant properties, each of which is a way this endpoint could
 * otherwise be abused:
 *
 *   * the bytes decide the type, so a script renamed `.png` is rejected;
 *   * the object path is generated server-side, so there is no traversal to defend;
 *   * a failed row write does not leave an orphaned object behind;
 *   * deleting a superseded object only ever touches the organizer's own prefix.
 */

const from = vi.fn()
const getOwnedEvent = vi.fn()
const upload = vi.fn()
const remove = vi.fn()
const getPublicUrl = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from,
    storage: { from: () => ({ upload, remove, getPublicUrl }) },
  }),
}))
vi.mock('@/features/events/services/eventService', () => ({
  getOwnedEvent: (...args: unknown[]) => getOwnedEvent(...args),
}))

const { removeEventLogo, uploadEventLogo } = await import('./eventLogoService')
const { formatMegabytes, MAX_UPLOAD_BYTES } = await import('@/lib/uploadLimits')

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const ORGANIZER = 'owner-1'
const EVENT = { id: EVENT_ID, organizer_id: ORGANIZER, logo_url: null as string | null }

const PUBLIC_BASE = 'https://assets.example/object/public/event-assets/'

/** Real leading bytes, so the byte sniffer actually classifies the file. */
const PNG_HEADER = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]

function png(overrides: Partial<File> = {}): File {
  return new File([new Uint8Array(PNG_HEADER)], 'logo.png', {
    type: 'image/png',
    ...overrides,
  }) as File
}

/** Chainable query stub that records what was written. */
function query(capture?: { update?: unknown; where?: Record<string, unknown> }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq']) {
    chain[method] = vi.fn((column?: string, value?: unknown) => {
      if (capture && column) capture.where = { ...capture.where, [column]: value }
      return chain
    })
  }
  chain.update = vi.fn((payload: unknown) => {
    if (capture) capture.update = payload
    return chain
  })
  chain.single = vi.fn(() => chain)
  chain.maybeSingle = chain.single

  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve)

  return chain
}

function failingQuery(message = 'denied') {
  const chain = query()
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: null, error: { message } }).then(resolve)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  getOwnedEvent.mockResolvedValue(EVENT)
  upload.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  getPublicUrl.mockReturnValue({
    data: { publicUrl: `${PUBLIC_BASE}${ORGANIZER}/${EVENT_ID}/fixed-uuid.png` },
  })
  from.mockReturnValue(query())
  vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid' })
})

describe('uploadEventLogo', () => {
  it('proves ownership before writing anything', async () => {
    await uploadEventLogo(EVENT_ID, png())

    expect(getOwnedEvent).toHaveBeenCalledWith(EVENT_ID)
  })

  it('points the event row at the uploaded logo', async () => {
    const capture: { update?: unknown; where?: Record<string, unknown> } = {}
    from.mockReturnValue(query(capture))

    const { logoUrl } = await uploadEventLogo(EVENT_ID, png())

    expect(capture.update).toEqual({ logo_url: logoUrl })
    expect(capture.where).toMatchObject({ id: EVENT_ID })
  })

  it('generates the object path server-side, under the organizer\u2019s own prefix', async () => {
    await uploadEventLogo(EVENT_ID, png())

    expect(upload).toHaveBeenCalledWith(
      `${ORGANIZER}/${EVENT_ID}/fixed-uuid.png`,
      expect.anything(),
      expect.objectContaining({ contentType: 'image/png', upsert: false })
    )
  })

  it('never derives the path from the uploaded file\u2019s name', async () => {
    // A name like `../../other-owner/x.png` must not reach storage as a path.
    await uploadEventLogo(EVENT_ID, png({ name: '../../other-owner/steal.png' }))

    const path = upload.mock.calls[0]?.[0] as string
    expect(path).toBe(`${ORGANIZER}/${EVENT_ID}/fixed-uuid.png`)
    expect(path).not.toContain('..')
  })

  it('rejects a file whose bytes are not an image, whatever it claims', async () => {
    const notAnImage = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'logo.png', {
      type: 'image/png',
    }) as File

    await expect(uploadEventLogo(EVENT_ID, notAnImage)).rejects.toThrow(/not a PNG, JPEG, or WebP/i)
    expect(upload).not.toHaveBeenCalled()
  })

  it('rejects a renamed file whose declared type disagrees with its bytes', async () => {
    // Bytes are a PNG, but the browser said JPEG: never a legitimate upload.
    const liar = new File([new Uint8Array(PNG_HEADER)], 'logo.jpg', { type: 'image/jpeg' }) as File

    await expect(uploadEventLogo(EVENT_ID, liar)).rejects.toThrow(/not a valid image/i)
    expect(upload).not.toHaveBeenCalled()
  })

  it('rejects a type the designs cannot use', async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], 'logo.gif', {
      type: 'image/gif',
    }) as File

    await expect(uploadEventLogo(EVENT_ID, gif)).rejects.toThrow(/PNG, JPEG, or WebP/i)
    expect(upload).not.toHaveBeenCalled()
  })

  it('rejects an empty file', async () => {
    const empty = new File([], 'logo.png', { type: 'image/png' }) as File

    await expect(uploadEventLogo(EVENT_ID, empty)).rejects.toThrow(/empty/i)
  })

  it('rejects a file over the upload limit, which the platform enforces first', async () => {
    const big = png()
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 })

    await expect(uploadEventLogo(EVENT_ID, big)).rejects.toThrow(
      `${formatMegabytes(MAX_UPLOAD_BYTES)} or smaller`
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it('does not surface a storage error to the organizer', async () => {
    upload.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })

    await expect(uploadEventLogo(EVENT_ID, png())).rejects.toThrow(
      'The logo could not be uploaded. Please try again.'
    )
  })

  it('leaves no orphaned object when the row cannot be written', async () => {
    from.mockReturnValue(failingQuery())

    await expect(uploadEventLogo(EVENT_ID, png())).rejects.toThrow()

    expect(remove).toHaveBeenCalledWith([`${ORGANIZER}/${EVENT_ID}/fixed-uuid.png`])
  })

  it('removes the previous logo, but only from the organizer\u2019s own prefix', async () => {
    getOwnedEvent.mockResolvedValue({ ...EVENT, logo_url: `${PUBLIC_BASE}${ORGANIZER}/old.png` })

    await uploadEventLogo(EVENT_ID, png())

    expect(remove).toHaveBeenCalledWith([`${ORGANIZER}/old.png`])
  })

  it('never deletes another organizer\u2019s object on replace', async () => {
    // A hand-edited logo_url pointing out of the organizer's own prefix must be
    // left completely alone.
    getOwnedEvent.mockResolvedValue({ ...EVENT, logo_url: `${PUBLIC_BASE}someone-else/old.png` })

    await uploadEventLogo(EVENT_ID, png())

    expect(remove).not.toHaveBeenCalled()
  })

  it('never deletes an object when the previous url is outside the bucket', async () => {
    getOwnedEvent.mockResolvedValue({
      ...EVENT,
      logo_url: 'https://elsewhere.example/logo.png',
    })

    await uploadEventLogo(EVENT_ID, png())

    expect(remove).not.toHaveBeenCalled()
  })

  it('still succeeds when the superseded object cannot be deleted', async () => {
    getOwnedEvent.mockResolvedValue({ ...EVENT, logo_url: `${PUBLIC_BASE}${ORGANIZER}/old.png` })
    remove.mockRejectedValue(new Error('nope'))

    await expect(uploadEventLogo(EVENT_ID, png())).resolves.toMatchObject({
      logoUrl: expect.stringContaining('fixed-uuid.png'),
    })
  })
})

describe('removeEventLogo', () => {
  it('clears the column so designs fall back to the monogram', async () => {
    getOwnedEvent.mockResolvedValue({ ...EVENT, logo_url: `${PUBLIC_BASE}${ORGANIZER}/old.png` })
    const capture: { update?: unknown } = {}
    from.mockReturnValue(query(capture))

    await removeEventLogo(EVENT_ID)

    expect(capture.update).toEqual({ logo_url: null })
  })

  it('clears the row before deleting the object', async () => {
    // Failing in the other order would leave a design pointing at a missing file.
    getOwnedEvent.mockResolvedValue({ ...EVENT, logo_url: `${PUBLIC_BASE}${ORGANIZER}/old.png` })
    const order: string[] = []

    const chain: Record<string, unknown> = {}
    chain.eq = vi.fn(() => chain)
    chain.update = vi.fn(() => {
      order.push('row')
      return chain
    })
    chain.then = (resolve: (value: unknown) => unknown) => {
      order.push('awaited')
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    from.mockReturnValue(chain)

    remove.mockImplementation(() => {
      order.push('object')
      return Promise.resolve({ error: null })
    })

    await removeEventLogo(EVENT_ID)

    expect(order).toEqual(['row', 'awaited', 'object'])
  })

  it('does nothing when there is no logo to remove', async () => {
    getOwnedEvent.mockResolvedValue(EVENT)

    await removeEventLogo(EVENT_ID)

    expect(from).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('leaves the object alone when the row cannot be cleared', async () => {
    getOwnedEvent.mockResolvedValue({ ...EVENT, logo_url: `${PUBLIC_BASE}${ORGANIZER}/old.png` })
    from.mockReturnValue(failingQuery())

    await expect(removeEventLogo(EVENT_ID)).rejects.toThrow(/could not be removed/i)
    expect(remove).not.toHaveBeenCalled()
  })

  it('never deletes another organizer\u2019s object on remove', async () => {
    getOwnedEvent.mockResolvedValue({ ...EVENT, logo_url: `${PUBLIC_BASE}someone-else/old.png` })

    await removeEventLogo(EVENT_ID)

    expect(remove).not.toHaveBeenCalled()
  })
})
