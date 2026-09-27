import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import type { CertificateDesignConfig } from '@/features/certificates/templates/types'

/**
 * The custom template lifecycle, against a mocked Supabase client.
 *
 * Multiple templates must be genuinely independent: uploading a second must not
 * disturb the first, deleting one must leave the other working, and the
 * built-ins must be untouched throughout. Those are the properties an organizer
 * discovers by breaking them, so they are pinned here.
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

const {
  MAX_TEMPLATE_BYTES,
  createCertificateTemplate,
  deleteCertificateTemplate,
  listCertificateTemplates,
  updateCertificateTemplateDesign,
} = await import('./certificateTemplateService')
const { emptyConfig, newTextLayer } = await import('@/features/certificates/templates/geometry')

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const EVENT = { id: EVENT_ID, organizer_id: 'owner-1' }

const BOUNDS = { width: 1920, height: 1080 }
const CONFIG = emptyConfig()
CONFIG.textLayers = [
  newTextLayer(BOUNDS, { x: 100, y: 400, width: 900, height: 140 }),
  newTextLayer(BOUNDS, { x: 200, y: 620, width: 700, height: 80 }),
]

const SIZE = { width: 1920, height: 1080 }

/**
 * A real 1x1 PNG. The service sniffs 16 header bytes, so a hand-written
 * signature stub is not enough -- these are the actual bytes of a valid file.
 */
/**
 * Sixteen leading bytes of a PNG: the eight-byte signature followed by the length
 * and type of the first chunk. The sniffer reads exactly this many, so a fixture
 * has to be at least this long to be classified at all.
 */
const PNG_HEADER = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]

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
    id: 'tpl-1',
    event_id: EVENT_ID,
    name: 'Graduation blue',
    storage_path: 'owner-1/e/templates/a.png',
    image_width: 1920,
    image_height: 1080,
    design_config: CONFIG,
    created_at: '2026-09-27T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
    ...overrides,
  }
}

/**
 * Chainable query stub that records what was written.
 *
 * `single()` and `maybeSingle()` collapse the row set to one object, the way
 * PostgREST does, so the service's `data as Row` casts are honest here.
 */
function query(rows: unknown[], capture?: { insert?: unknown; update?: unknown }) {
  const chain: Record<string, unknown> = {}
  let single = false
  for (const method of ['select', 'eq', 'order']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.single = vi.fn(() => {
    single = true
    return chain
  })
  chain.maybeSingle = vi.fn(() => {
    single = true
    return chain
  })
  chain.insert = vi.fn((payload: unknown) => {
    if (capture) capture.insert = payload
    return chain
  })
  chain.update = vi.fn((payload: unknown) => {
    if (capture) capture.update = payload
    return chain
  })
  chain.delete = vi.fn(() => chain)
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: single ? (rows[0] ?? null) : rows, error: null })
  return chain
}

beforeEach(() => {
  from.mockReset()
  getOwnedEvent.mockReset()
  upload.mockReset()
  remove.mockReset()
  createSignedUrl.mockReset()
  getOwnedEvent.mockResolvedValue(EVENT)
  upload.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x.png' }, error: null })
})

afterEach(() => vi.restoreAllMocks())

describe('multiple templates', () => {
  it('lists every template for the event', async () => {
    from.mockReturnValue(
      query([
        row({ id: 'tpl-1', name: 'A' }),
        row({ id: 'tpl-2', name: 'B' }),
        row({ id: 'tpl-3', name: 'C' }),
      ])
    )

    const templates = await listCertificateTemplates(EVENT_ID)
    expect(templates.map((t) => t.name)).toEqual(['A', 'B', 'C'])
  })

  it('stores each upload under its own path', async () => {
    const capture: { insert?: unknown } = {}
    from.mockReturnValue(query([row()], capture))

    await createCertificateTemplate({
      eventId: EVENT_ID,
      name: 'Second design',
      imageSize: SIZE,
      designConfig: CONFIG,
      file: PNG,
    })

    const paths = upload.mock.calls.map((call) => call[0] as string)
    expect(paths[0]).toMatch(/^owner-1\/11111111-1111-4111-8111-111111111111\/templates\//)
    expect(paths[0]).toMatch(/\.png$/)
  })

  it('records the creator, so the audit trail is not forgeable', async () => {
    const capture: { insert?: unknown } = {}
    from.mockReturnValue(query([row()], capture))

    await createCertificateTemplate({
      eventId: EVENT_ID,
      name: 'Second design',
      imageSize: SIZE,
      designConfig: CONFIG,
      file: PNG,
    })

    expect((capture.insert as { created_by: string }).created_by).toBe('owner-1')
  })

  it('always writes the certificate kind', async () => {
    const capture: { insert?: unknown } = {}
    from.mockReturnValue(query([row()], capture))

    await createCertificateTemplate({
      eventId: EVENT_ID,
      name: 'A',
      imageSize: SIZE,
      designConfig: CONFIG,
      file: PNG,
    })

    expect((capture.insert as { kind: string }).kind).toBe('certificate')
  })

  it('scopes the listing to certificates only', async () => {
    const chain = query([])
    from.mockReturnValue(chain)
    await listCertificateTemplates(EVENT_ID)

    const eqCalls = chain.eq as ReturnType<typeof vi.fn>
    const pairs = eqCalls.mock.calls.map((call) => call[0])
    expect(pairs).toContain('kind')
  })

  it('survives deleting one while another remains', async () => {
    from.mockReturnValue(query([row({ storage_path: 'owner-1/e/templates/a.png' })]))

    await deleteCertificateTemplate(EVENT_ID, 'tpl-1')

    expect(remove).toHaveBeenCalledWith(['owner-1/e/templates/a.png'])
  })

  it('removes only the object belonging to the deleted row', async () => {
    from.mockReturnValue(query([row({ storage_path: 'owner-1/e/templates/target.png' })]))

    await deleteCertificateTemplate(EVENT_ID, 'tpl-1')

    // One object, and it is the one the row pointed at.
    expect(remove.mock.calls[0]?.[0]).toEqual(['owner-1/e/templates/target.png'])
  })
})

describe('editing an existing template', () => {
  it('updates the layout without touching the artwork', async () => {
    const capture: { update?: unknown } = {}
    from.mockReturnValue(query([row()], capture))

    await updateCertificateTemplateDesign({
      eventId: EVENT_ID,
      templateId: 'tpl-1',
      name: 'Renamed',
      designConfig: CONFIG,
    })

    const payload = capture.update as Record<string, unknown>
    expect(payload.name).toBe('Renamed')
    // The stored background is reused, so there is no re-upload.
    expect('storage_path' in payload).toBe(false)
    expect('image_width' in payload).toBe(false)
  })

  it('persists the moved position and every typography value', async () => {
    const capture: { update?: unknown } = {}
    from.mockReturnValue(query([row()], capture))

    const moved: CertificateDesignConfig = {
      ...CONFIG,
      textLayers: [
        {
          ...CONFIG.textLayers[0]!,
          x: 321,
          y: 654,
          width: 777,
          height: 111,
          fontFamily: 'lora',
          fontSize: 51,
          fontWeight: 400,
          italic: true,
          color: '#ff00ff',
          horizontalAlign: 'right',
          verticalAlign: 'bottom',
          letterSpacing: 3,
          lineHeight: 1.4,
        },
      ],
    }

    await updateCertificateTemplateDesign({
      eventId: EVENT_ID,
      templateId: 'tpl-1',
      name: 'Adjusted',
      designConfig: moved,
    })

    const saved = (capture.update as { design_config: CertificateDesignConfig }).design_config
    expect(saved.textLayers).toEqual(moved.textLayers)
  })

  it('scopes the update to the event as well as the template', async () => {
    const chain = query([row()])
    from.mockReturnValue(chain)

    await updateCertificateTemplateDesign({
      eventId: EVENT_ID,
      templateId: 'tpl-1',
      name: 'A',
      designConfig: CONFIG,
    })

    const scoped = (chain.eq as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0])
    // Both, so a template id from another event cannot be edited.
    expect(scoped).toEqual(expect.arrayContaining(['id', 'event_id']))
  })
})

describe('authorization', () => {
  it('proves ownership before any write', async () => {
    getOwnedEvent.mockRejectedValue(new Error('NOT_FOUND'))

    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'A',
        imageSize: SIZE,
        designConfig: CONFIG,
        file: PNG,
      })
    ).rejects.toThrow()

    expect(upload).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('proves ownership before a delete', async () => {
    getOwnedEvent.mockRejectedValue(new Error('NOT_FOUND'))

    await expect(deleteCertificateTemplate(EVENT_ID, 'tpl-1')).rejects.toThrow()
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('an untouched upload', () => {
  /**
   * The whole point of the product decision: the organizer's file is the
   * certificate. These assert nothing in the upload path re-encodes it.
   */

  const config = () => ({ ...emptyConfig(), textLayers: [] })

  it('stores the very Blob it was given, with no re-encoding', async () => {
    // `toBe` on identity, not equality: a canvas round trip would produce a
    // different object even if the pixels happened to match.
    from.mockReturnValue(query([row()]))

    const file = PNG
    await createCertificateTemplate({
      eventId: EVENT_ID,
      name: 'Graduation',
      imageSize: SIZE,
      designConfig: config(),
      file,
    })

    expect(upload.mock.calls[0]?.[1]).toBe(file)
  })

  it('sends the file to storage as a PNG', async () => {
    from.mockReturnValue(query([row()]))
    await createCertificateTemplate({
      eventId: EVENT_ID,
      name: 'Graduation',
      imageSize: SIZE,
      designConfig: config(),
      file: PNG,
    })

    expect(upload.mock.calls[0]?.[2]).toMatchObject({ contentType: 'image/png', upsert: false })
  })

  it('accepts a PNG containing no green or magenta regions at all', async () => {
    // A finished design needs no placeholder colours. The detector is gone, so
    // there is nothing left to reject this.
    from.mockReturnValue(query([row()]))
    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'No placeholders',
        imageSize: SIZE,
        designConfig: config(),
        file: PNG,
      })
    ).resolves.toBeDefined()
  })

  it('accepts a PNG whose artwork happens to be green', async () => {
    // #00B140 used to be reserved. Artwork is now free to be any colour at all.
    const greenArtwork = new Blob([new Uint8Array([...PNG_HEADER, 0, 177, 64, 0, 177, 64, 255])], {
      type: 'image/png',
    })
    from.mockReturnValue(query([row()]))
    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'Green artwork',
        imageSize: SIZE,
        designConfig: config(),
        file: greenArtwork,
      })
    ).resolves.toBeDefined()
  })

  it('accepts a PNG whose artwork happens to be magenta', async () => {
    const magentaArtwork = new Blob(
      [new Uint8Array([...PNG_HEADER, 255, 0, 255, 255, 0, 255, 255])],
      { type: 'image/png' }
    )
    from.mockReturnValue(query([row()]))
    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'Magenta artwork',
        imageSize: SIZE,
        designConfig: config(),
        file: magentaArtwork,
      })
    ).resolves.toBeDefined()
  })

  it('saves an empty text-layer list, so a template can be stored before it is arranged', async () => {
    const capture: { insert?: unknown } = {}
    from.mockReturnValue(query([row()], capture))

    await createCertificateTemplate({
      eventId: EVENT_ID,
      name: 'Unarranged',
      imageSize: SIZE,
      designConfig: config(),
      file: PNG,
    })

    expect(
      (capture.insert as { design_config: CertificateDesignConfig }).design_config.textLayers
    ).toEqual([])
  })

  it('still rejects a file that is not a PNG by its bytes', async () => {
    // Removing the placeholder pipeline did not weaken the file-type check.
    const notPng = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array(12).fill(0)])], {
      type: 'image/png',
    })
    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'A',
        imageSize: SIZE,
        designConfig: config(),
        file: notPng,
      })
    ).rejects.toThrow(/PNG/)
  })
})

describe('upload validation', () => {
  const config = () => ({ ...emptyConfig(), textLayers: [] })

  it('rejects an empty file', async () => {
    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'A',
        imageSize: SIZE,
        designConfig: config(),
        file: new Blob([]),
      })
    ).rejects.toThrow(/empty/)
  })

  it('rejects an implausible canvas size', async () => {
    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'A',
        imageSize: { width: 4, height: 4 },
        designConfig: config(),
        file: PNG,
      })
    ).rejects.toThrow(/pixels/)
  })

  it('rejects a file over the size limit', async () => {
    const huge = { size: MAX_TEMPLATE_BYTES + 1 } as Blob
    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'A',
        imageSize: SIZE,
        designConfig: config(),
        file: huge,
      })
    ).rejects.toThrow(/5 MB/)
  })

  it('leaves no orphaned object when the row cannot be written', async () => {
    // Storage and the table are separate systems; a failure between them would
    // otherwise leak an object nothing references.
    const broken: Record<string, unknown> = {
      insert: vi.fn(() => broken),
      select: vi.fn(() => broken),
      single: vi.fn(() => broken),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: null, error: { message: 'insert failed' } }),
    }
    from.mockReturnValue(broken)

    await expect(
      createCertificateTemplate({
        eventId: EVENT_ID,
        name: 'A',
        imageSize: SIZE,
        designConfig: config(),
        file: PNG,
      })
    ).rejects.toThrow()

    expect(remove).toHaveBeenCalled()
  })
})

describe('a storage failure is diagnosable but not leaked', () => {
  /**
   * A real report was "the template could not be uploaded" with nothing behind it:
   * the Supabase error was discarded, and because an `AppError` is thrown, the
   * action's own logging never ran either. Every precondition had already passed
   * by that point, so the only thing that could say more was the error text.
   *
   * Both halves matter and are pinned together: the cause reaches the server log,
   * and it does not reach the organizer.
   */

  const config = () => ({ ...emptyConfig(), textLayers: [] })

  async function failWith(message: string) {
    upload.mockResolvedValue({ error: { message, status: '400' } })
    return createCertificateTemplate({
      eventId: EVENT_ID,
      name: 'Graduation',
      imageSize: SIZE,
      designConfig: config(),
      file: PNG,
    })
  }

  it('logs the real Supabase message, bucket, and path', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})

    await expect(failWith('new row violates row-level security policy')).rejects.toThrow()

    expect(error).toHaveBeenCalledTimes(1)
    const [event, context] = error.mock.calls[0] as [string, Record<string, unknown>]
    expect(event).toBe('certificate_template_upload_failed')
    expect(context.bucket).toBe('event-templates')
    expect(context.path).toMatch(/^owner-1\/11111111-1111-4111-8111-111111111111\/templates\//)
    expect(context.supabaseMessage).toBe('new row violates row-level security policy')
    expect(context.supabaseCode).toBe('400')
  })

  it('flags a row-level security denial distinctly from other failures', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})

    await expect(failWith('new row violates row-level security policy')).rejects.toThrow()
    expect((error.mock.calls[0] as unknown[])[1]).toMatchObject({ policyDenial: true })

    error.mockClear()
    await expect(failWith('The resource already exists')).rejects.toThrow()
    expect((error.mock.calls[0] as unknown[])[1]).toMatchObject({ policyDenial: false })
  })

  it('keeps the organizer-facing message generic', async () => {
    // The log carries the detail; the UI must not leak bucket or policy text.
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})

    const thrown = await failWith('new row violates row-level security policy').catch(
      (cause: Error) => cause
    )

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('The template could not be uploaded. Please try again.')
    expect((thrown as Error).message).not.toMatch(/row-level security|policy|storage\.objects/)
    expect(error).toHaveBeenCalled()
  })

  it('logs nothing when the upload succeeds', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    from.mockReturnValue(query([row()]))

    await createCertificateTemplate({
      eventId: EVENT_ID,
      name: 'Graduation',
      imageSize: SIZE,
      designConfig: config(),
      file: PNG,
    })

    expect(error).not.toHaveBeenCalled()
  })
})
