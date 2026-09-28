import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventLogoField } from './EventLogoField'

/**
 * The badge logo control.
 *
 * The badge artwork has always had a logo slot and always fallen through to a
 * monogram, because nothing ever supplied one. What is asserted here is the
 * control an organizer actually sees: that it states the current situation plainly
 * in participant-facing language, and that it never shows anything technical.
 */

const setEventLogoAction = vi.fn()
const clearEventLogoAction = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/features/design/actions/eventLogo.action', () => ({
  setEventLogoAction: (...args: unknown[]) => setEventLogoAction(...args),
  clearEventLogoAction: (...args: unknown[]) => clearEventLogoAction(...args),
}))

// Vitest runs without globals, so Testing Library's automatic cleanup is not
// registered and renders would otherwise accumulate.
afterEach(cleanup)

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const LOGO = 'https://assets.example/object/public/event-assets/owner-1/e/logo.png'

function pngFile(name = 'logo.png') {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
}

/** Hands a file to the input the way a file picker would. */
function chooseLogo(file: File) {
  const input = screen.getByLabelText(/event logo/i)
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setEventLogoAction.mockResolvedValue({ ok: true, data: { logoUrl: LOGO } })
  clearEventLogoAction.mockResolvedValue({ ok: true, data: { logoUrl: null } })
})

describe('EventLogoField', () => {
  it('offers a logo input', () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={null} />)

    expect(screen.getByLabelText(/event logo/i)).toBeInTheDocument()
  })

  it('says plainly that there is no logo, and what happens instead', () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={null} />)

    // The fallback described as what it looks like, not as a missing asset. Both
    // the hint and the status say so, hence the count rather than a single match.
    expect(screen.getByText(/no logo yet/i)).toBeInTheDocument()
    expect(screen.getAllByText(/monogram/i).length).toBeGreaterThan(0)
  })

  it('shows the logo in use and offers to remove it', () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={LOGO} />)

    expect(screen.getByAltText(/event logo as it will appear/i)).toHaveAttribute('src', LOGO)
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    expect(screen.queryByText(/no logo yet/i)).not.toBeInTheDocument()
  })

  it('accepts the formats the designs can use', () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={null} />)

    expect(screen.getByLabelText(/event logo/i)).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp'
    )
  })

  it('keeps implementation detail out of the interface', () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={LOGO} />)

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const jargon of ['bucket', 'storage', 'logo_url', 'cors', 'publicurl']) {
      expect(text).not.toContain(jargon)
    }
  })

  it('refreshes the page after an upload so every design sees the logo', async () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={null} />)

    chooseLogo(pngFile())

    await waitFor(() => expect(setEventLogoAction).toHaveBeenCalledTimes(1))
    // The logo arrives as a server-rendered prop, so the page has to come back.
    expect(refresh).toHaveBeenCalled()
  })

  it('sends the event id and the file, never a client-supplied path', async () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={null} />)

    chooseLogo(pngFile())

    await waitFor(() => expect(setEventLogoAction).toHaveBeenCalled())
    const formData = setEventLogoAction.mock.calls[0]?.[0] as FormData
    expect(formData.get('eventId')).toBe(EVENT_ID)
    expect(formData.get('file')).toBeInstanceOf(File)
    expect([...formData.keys()]).not.toContain('path')
  })

  it('rejects an unsupported type before it reaches the server', async () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={null} />)

    chooseLogo(new File([new Uint8Array([1])], 'logo.pdf', { type: 'application/pdf' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(setEventLogoAction).not.toHaveBeenCalled()
  })

  it('shows a server refusal without losing the control', async () => {
    setEventLogoAction.mockResolvedValue({
      ok: false,
      error: { code: 'UPLOAD_REJECTED', message: 'The logo could not be uploaded.' },
    })
    render(<EventLogoField eventId={EVENT_ID} logoUrl={null} />)

    chooseLogo(pngFile())

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be uploaded/i)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('clears the logo on request', async () => {
    render(<EventLogoField eventId={EVENT_ID} logoUrl={LOGO} />)

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(clearEventLogoAction).toHaveBeenCalledWith({ eventId: EVENT_ID }))
    expect(refresh).toHaveBeenCalled()
  })
})
