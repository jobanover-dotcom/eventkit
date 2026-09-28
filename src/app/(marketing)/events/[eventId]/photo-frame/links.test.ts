import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The public photo-frame entry point, read from source rather than rendered.
 *
 * Two things are being guarded, and neither is reachable by clicking through the
 * app in a unit test:
 *
 *  1. The public event page offers Register *and* Photo Frame, and the frame
 *     button leads to a page that exists. A typo in the template literal produces
 *     a button that leads nowhere, and it costs a browser round trip to discover.
 *  2. The public photo-frame page pulls in none of the organizer's controls. That
 *     is a property of its module graph, not of its rendered output — a stray
 *     import would be invisible in a screenshot until somebody noticed an upload
 *     button on a public page.
 *
 * The database half of the flow is guarded separately: the `anon` read of
 * `event_design_templates` and of the `event-templates` bucket is closed by
 * migration 00006's two security-definer functions, verified against the live
 * database rather than here.
 */

const MARKETING_EVENT = 'src/app/(marketing)/events/[eventId]'
const EVENT_PAGE = resolve(MARKETING_EVENT, 'page.tsx')
const PHOTO_FRAME_DIR = resolve(MARKETING_EVENT, 'photo-frame')
const PHOTO_FRAME_PAGE = resolve(PHOTO_FRAME_DIR, 'page.tsx')

const eventSource = readFileSync(EVENT_PAGE, 'utf8')
const frameSource = readFileSync(PHOTO_FRAME_PAGE, 'utf8')

/** Every `/events/<id>/<rest>` path literal the page links to. */
function linkedPaths(source: string): string[] {
  const paths: string[] = []
  const pattern = /href=\{`\/events\/\$\{[^}]+\}([^`]*)`\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) paths.push(match[1] as string)
  return paths
}

const paths = linkedPaths(eventSource)

describe('the public event page', () => {
  it('parses its event links out of the page', () => {
    // Guards the parser: if this drops, every assertion below passes vacuously,
    // which is the failure mode a source-reading test has.
    expect(paths.length).toBeGreaterThanOrEqual(2)
  })

  it('offers both Register and Photo Frame', () => {
    expect(eventSource).toMatch(/href=\{`\/events\/\$\{event\.id\}\/register`\}/)
    expect(eventSource).toMatch(/href=\{`\/events\/\$\{event\.id\}\/photo-frame`\}/)
    expect(paths).toContain('/register')
    expect(paths).toContain('/photo-frame')
  })

  it('keeps Register, rather than replacing it with Photo Frame', () => {
    // The two were once the same button position; a photo frame is an addition,
    // and registration is still how a participant gets a QR.
    const register = eventSource.indexOf('href={`/events/${event.id}/register`}')
    const frame = eventSource.indexOf('href={`/events/${event.id}/photo-frame`}')
    expect(register).toBeGreaterThan(-1)
    expect(frame).toBeGreaterThan(register)
  })

  it('points Photo Frame at a page that exists', () => {
    expect(existsSync(resolve(MARKETING_EVENT, 'photo-frame', 'page.tsx'))).toBe(true)
  })

  it('points every event link at a route that exists', () => {
    // `path.resolve` treats a leading slash as absolute, so the capture has to
    // lose it before the path is joined onto the events directory.
    const dead = paths.filter(
      (rest) => !existsSync(resolve(MARKETING_EVENT, rest.replace(/^\//, ''), 'page.tsx'))
    )
    expect(dead, `links with no page file:\n${dead.join('\n')}`).toEqual([])
  })
})

describe('the public photo-frame page', () => {
  it('identifies the event through the public read, not the organizer context', () => {
    expect(frameSource).toMatch(/getPublicEvent/)
    // `getDesignContext` requires a session and would 404 every visitor.
    expect(frameSource).not.toMatch(/getDesignContext/)
    expect(frameSource).not.toMatch(/requireOrganizer/)
  })

  it('never reaches for the service-role key', () => {
    expect(frameSource).not.toMatch(/service_role|SERVICE_ROLE|getServiceRoleKey/)
  })

  it('exposes no organizer controls', () => {
    // Upload, management, and the server actions behind them are organizer-only
    // and must not be reachable from a public page, even unrendered.
    for (const forbidden of [
      'CustomFrameUpload',
      'CustomFrameManager',
      'createPhotoFrameAction',
      'renamePhotoFrameAction',
      'deletePhotoFrameAction',
      'createPhotoFrameTemplate',
      'photoFrameTemplateService',
    ]) {
      expect(frameSource, `${forbidden} is reachable from the public page`).not.toContain(forbidden)
    }
  })

  it('reads custom frames through the public service only', () => {
    expect(frameSource).toContain('listPublicPhotoFrameTemplates')
  })

  it('reuses the shared renderer rather than a second one', () => {
    expect(frameSource).toContain('PublicPhotoFrameGenerator')
    // The masking algorithm, tolerance, and dilation live in one module. A second
    // copy here would be the failure this whole feature is meant to avoid.
    const generator = readFileSync(
      resolve('src/features/design/components/PublicPhotoFrameGenerator.tsx'),
      'utf8'
    )
    expect(generator).not.toMatch(/colorKey|22ff00|tolerance|dilat/i)
  })

  it('leaves the visitor photo in the browser', () => {
    const generator = readFileSync(
      resolve('src/features/design/components/PublicPhotoFrameGenerator.tsx'),
      'utf8'
    )
    // No upload path for the photo itself, only for frames.
    expect(generator).not.toMatch(/FormData|formData/)
    expect(generator).toContain('usePhotoPicker')
  })

  it('does not ask a visitor for anything identifying', () => {
    const source = `${frameSource}\n${readFileSync(
      resolve('src/features/design/components/PublicPhotoFrameGenerator.tsx'),
      'utf8'
    )}`
    // Specific identifiers and data sources, rather than bare words: `qr` also
    // appears in `includeQr={false}` and `register` in prose about the absence of
    // registration, so a substring ban would fail on correct code.
    for (const forbidden of [
      'FormData',
      'formData',
      'email',
      'studentId',
      'student_id',
      'qrToken',
      'qr_token',
      'registerParticipant',
      'ParticipantInfo',
      'getEventRoster',
    ]) {
      expect(source, `reaches for ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('renders no QR, which would need a participant token', () => {
    const generator = readFileSync(
      resolve('src/features/design/components/PublicPhotoFrameGenerator.tsx'),
      'utf8'
    )
    expect(generator).toContain('includeQr={false}')
  })
})

describe('the photo-frame routes', () => {
  it('keeps the public route clear of the organizer one', () => {
    // Two different pages on purpose: /photo-frame is anonymous,
    // /design/photo-frame is the studio.
    expect(existsSync(PHOTO_FRAME_DIR)).toBe(true)
    expect(existsSync(resolve('src/app/(organizer)/events/[eventId]/design/photo-frame'))).toBe(
      true
    )
  })
})
