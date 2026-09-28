import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The custom photo frame lifecycle, against a mocked Supabase client.
 *
 * The property that matters most here: a frame is written as `kind =
 * 'photo_frame'`. Certificates and frames share one table and one store, so
 * nothing but this write keeps a frame out of the certificate list and a
 * certificate out of the frame list.
 */

const from = vi.fn()
const getOwnedEvent = vi.fn()
const upload = vi.fn()
const remove = vi.fn()
const createSignedUrl = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from,
    storage: { from: () => ({ upload, remove, createSignedUrl }) },
  }),
}))
vi.mock('@/features/events/services/eventService', () => ({
  getOwnedEvent: (...args: unknown[]) => getOwnedEvent(...args),
}))

const { createPhotoFrameTemplate, listPhotoFrameTemplates } = await import(
  './photoFrameTemplateService'
)
const { defaultPhotoFrameConfig } = await import('@/features/design/schemas/photoFrameConfig')

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const EVENT = { id: EVENT_ID, organizer_id: 'owner-1' }

/** Objects live under the organizer, then the event, then a random leaf. */
const STORAGE_PATH = `owner-1/${EVENT_ID}/templates/fixed-uuid.png`

const PNG = new Blob(
  [
    new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      )
    ),
  ],
  { type: 'image/png' }
)

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'frame-1',
    event_id: EVENT_ID,
    name: 'Graduation arch',
    storage_path: 'owner-1/e/templates/a.png',
    image_width: 1080,
    image_height: 1350,
    design_config: defaultPhotoFrameConfig(),
    created_at: '2026-09-27T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
    ...overrides,
  }
}

/** Chainable query stub that records what was written and filtered on. */
function query(rows: unknown[], capture?: { insert?: unknown; filters?: Record<string, string> }) {
  const chain: Record<string, unknown> = {}
  let single = false

  for (const method of ['select', 'order']) chain[method] = vi.fn(() => chain)

  chain.eq = vi.fn((column: string, value: string) => {
    if (capture) capture.filters = { ...capture.filters, [column]: value }
    return chain
  })
  chain.single = vi.fn(() => {
    single = true
    return chain
  })
  chain.maybeSingle = chain.single
  chain.insert = vi.fn((payload: unknown) => {
    if (capture) capture.insert = payload
    return chain
  })
  chain.update = vi.fn(() => chain)
  chain.delete = vi.fn(() => chain)

  // PostgREST resolves when the awaited query builder settles, so the terminal
  // methods hand back the result the service destructures.
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: single ? rows[0] : rows, error: null }).then(resolve)

  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  getOwnedEvent.mockResolvedValue(EVENT)
  upload.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/a.png' },
    error: null,
  })
  vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid' })
})

describe('createPhotoFrameTemplate', () => {
  it('writes the frame as kind photo_frame', async () => {
    const capture: { insert?: unknown } = {}
    from.mockReturnValue(query([row()], capture))

    await createPhotoFrameTemplate({
      eventId: EVENT_ID,
      name: 'Graduation arch',
      imageSize: { width: 1080, height: 1350 },
      designConfig: defaultPhotoFrameConfig(),
      file: PNG,
    })

    expect(capture.insert).toMatchObject({ kind: 'photo_frame' })
  })

  it('stores the key colour and nothing about the artwork', async () => {
    const capture: { insert?: unknown } = {}
    from.mockReturnValue(query([row()], capture))

    await createPhotoFrameTemplate({
      eventId: EVENT_ID,
      name: 'Graduation arch',
      imageSize: { width: 1080, height: 1350 },
      designConfig: defaultPhotoFrameConfig(),
      file: PNG,
    })

    const written = capture.insert as { design_config: Record<string, unknown> }
    expect(written.design_config.photoFrame).toEqual({ keyColor: '#22ff00' })
    // The photo area is derived from the stored PNG, so no detection result is
    // written and none could be trusted if it were.
    expect(JSON.stringify(written.design_config)).not.toMatch(/pixel|bounds|hasPhoto|mask/i)
  })

  it('proves ownership before writing anything', async () => {
    from.mockReturnValue(query([row()]))

    await createPhotoFrameTemplate({
      eventId: EVENT_ID,
      name: 'Graduation arch',
      imageSize: { width: 1080, height: 1350 },
      designConfig: defaultPhotoFrameConfig(),
      file: PNG,
    })

    expect(getOwnedEvent).toHaveBeenCalledWith(EVENT_ID)
  })

  it('uploads the organizer\u2019s own bytes, unmodified, into the shared bucket', async () => {
    from.mockReturnValue(query([row()]))

    await createPhotoFrameTemplate({
      eventId: EVENT_ID,
      name: 'Graduation arch',
      imageSize: { width: 1080, height: 1350 },
      designConfig: defaultPhotoFrameConfig(),
      file: PNG,
    })

    expect(upload).toHaveBeenCalledWith(
      STORAGE_PATH,
      PNG,
      expect.objectContaining({ contentType: 'image/png', upsert: false })
    )
  })

  it('rejects a non-PNG before storing anything', async () => {
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/png' })

    await expect(
      createPhotoFrameTemplate({
        eventId: EVENT_ID,
        name: 'Graduation arch',
        imageSize: { width: 1080, height: 1350 },
        designConfig: defaultPhotoFrameConfig(),
        file: jpeg,
      })
    ).rejects.toThrow(/PNG/i)

    expect(upload).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a frame outside the dimension bounds the table allows', async () => {
    await expect(
      createPhotoFrameTemplate({
        eventId: EVENT_ID,
        name: 'Graduation arch',
        imageSize: { width: 8, height: 8 },
        designConfig: defaultPhotoFrameConfig(),
        file: PNG,
      })
    ).rejects.toThrow(/between 64 and 8000/)
  })

  it('leaves no orphaned object when the row cannot be written', async () => {
    const chain = query([])
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: 'check violated' } }).then(resolve)
    from.mockReturnValue(chain)

    await expect(
      createPhotoFrameTemplate({
        eventId: EVENT_ID,
        name: 'Graduation arch',
        imageSize: { width: 1080, height: 1350 },
        designConfig: defaultPhotoFrameConfig(),
        file: PNG,
      })
    ).rejects.toThrow()

    expect(remove).toHaveBeenCalledWith([STORAGE_PATH])
  })
})

describe('listPhotoFrameTemplates', () => {
  it('filters by kind, so a certificate never appears as a frame', async () => {
    const capture: { filters?: Record<string, string> } = {}
    from.mockReturnValue(query([row()], capture))

    const templates = await listPhotoFrameTemplates(EVENT_ID)

    expect(capture.filters).toMatchObject({ event_id: EVENT_ID, kind: 'photo_frame' })
    expect(templates).toHaveLength(1)
    expect(templates[0]?.name).toBe('Graduation arch')
  })

  it('returns the artwork as a short-lived signed link', async () => {
    from.mockReturnValue(query([row()]))

    const [template] = await listPhotoFrameTemplates(EVENT_ID)

    expect(template?.signedUrl).toBe('https://signed.example/a.png')
  })

  it('proves ownership before reading', async () => {
    from.mockReturnValue(query([]))

    await listPhotoFrameTemplates(EVENT_ID)

    expect(getOwnedEvent).toHaveBeenCalledWith(EVENT_ID)
  })

  it('fails loudly on a row whose config is unusable', async () => {
    from.mockReturnValue(query([row({ design_config: { photoFrame: { keyColor: 'nope' } } })]))

    await expect(listPhotoFrameTemplates(EVENT_ID)).rejects.toThrow(/not usable|re-upload/i)
  })
})
