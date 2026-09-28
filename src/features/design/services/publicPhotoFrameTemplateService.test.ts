import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The public read of custom photo frames.
 *
 * The properties worth pinning: it goes through the security-definer function
 * rather than the organizer-only service, it never throws (a page offering fewer
 * frames beats a page that 500s), and it hands the browser loader the same record
 * shape the organizer path does, so a custom frame is composited by identical
 * code either way.
 */

const rpc = vi.fn()
const createSignedUrl = vi.fn()
const warn = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc, storage: { from: () => ({ createSignedUrl }) } }),
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: (...a: unknown[]) => warn(...a) } }))

const { listPublicPhotoFrameTemplates } = await import('./publicPhotoFrameTemplateService')

const EVENT_ID = '11111111-1111-4111-8111-111111111111'

function row(overrides: Record<string, unknown> = {}) {
  return {
    template_id: 'frame-1',
    template_name: 'Graduation arch',
    image_width: '1080',
    image_height: '1350',
    artwork_path: 'owner-1/e/templates/a.png',
    updated_at: '2026-09-27T10:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: [row()], error: null })
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/a.png' },
    error: null,
  })
})

describe('listPublicPhotoFrameTemplates', () => {
  it('reads through the public function, scoped to the event', async () => {
    await listPublicPhotoFrameTemplates(EVENT_ID)

    expect(rpc).toHaveBeenCalledWith('get_public_photo_frame_templates', { p_event_id: EVENT_ID })
  })

  it('returns records shaped like the organizer path, so the loader is shared', async () => {
    const [template] = await listPublicPhotoFrameTemplates(EVENT_ID)

    expect(template).toMatchObject({
      id: 'frame-1',
      name: 'Graduation arch',
      imageWidth: 1080,
      imageHeight: 1350,
      signedUrl: 'https://signed.example/a.png',
      updatedAt: '2026-09-27T10:00:00.000Z',
    })
    // The renderer needs a config, and a frame's photo area is derived from the
    // artwork, so this is the contract key colour and carries no claim.
    expect(template?.designConfig.photoFrame.keyColor).toBe('#22ff00')
  })

  it('yields a string timestamp, whichever driver supplied it', async () => {
    // A Postgres driver returns `timestamptz` as a Date; supabase-js returns a
    // JSON string. The reload key is built by interpolation, so the shape is
    // asserted rather than assumed.
    rpc.mockResolvedValue({ data: [row({ updated_at: new Date(0) })], error: null })

    const [template] = await listPublicPhotoFrameTemplates(EVENT_ID)

    expect(typeof template?.updatedAt).toBe('string')
  })

  it('parses the dimensions the database reports as strings', async () => {
    rpc.mockResolvedValue({
      data: [row({ image_width: '1920', image_height: '1080' })],
      error: null,
    })

    const [template] = await listPublicPhotoFrameTemplates(EVENT_ID)

    expect(template?.imageWidth).toBe(1920)
    expect(template?.imageHeight).toBe(1080)
  })

  it('signs each artwork from the shared private bucket', async () => {
    await listPublicPhotoFrameTemplates(EVENT_ID)

    expect(createSignedUrl).toHaveBeenCalledWith('owner-1/e/templates/a.png', 1800)
  })

  it('degrades to no custom frames when the function is not there yet', async () => {
    // The deployment case: migration 00006 not applied. The visitor still gets the
    // built-in frames, and the public page must not fail.
    rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'no such function' } })

    await expect(listPublicPhotoFrameTemplates(EVENT_ID)).resolves.toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('skips one unreadable artwork without losing the others', async () => {
    rpc.mockResolvedValue({
      data: [row({ template_id: 'bad', artwork_path: 'gone.png' }), row({ template_id: 'good' })],
      error: null,
    })
    createSignedUrl
      .mockResolvedValueOnce({ data: null, error: { message: 'no such object' } })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://signed.example/b.png' }, error: null })

    const templates = await listPublicPhotoFrameTemplates(EVENT_ID)

    expect(templates.map((t) => t.id)).toEqual(['good'])
  })

  it('returns an empty list, not a throw, when the read fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })

    await expect(listPublicPhotoFrameTemplates(EVENT_ID)).resolves.toEqual([])
  })
})
