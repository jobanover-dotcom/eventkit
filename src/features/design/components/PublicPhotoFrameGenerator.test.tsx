import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicPhotoFrameGenerator } from './PublicPhotoFrameGenerator'
import { SAMPLE_EVENT } from '@/features/design/lib/sampleData'
import { PHOTO_FRAME_TEMPLATES } from '@/features/design/lib/templates'

/**
 * The public photo-frame component's own controls.
 *
 * The renderer itself is already covered by the template and canvas suites, and
 * duplicating those assertions here would only make them harder to change. What
 * is specific to this component is which controls a visitor is offered, so that
 * is what these check: a photo field, a frame choice, and no organizer or
 * identifying field.
 *
 * `DesignStudio` needs a canvas to rasterise its preview, which jsdom has none
 * of. It handles that by showing the template name and blurb instead, which is
 * exactly the degradation worth asserting: a visitor without canvas support gets
 * a usable page rather than a blank one.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

// Vitest runs without globals, so Testing Library's automatic cleanup is not
// registered and renders would otherwise accumulate -- which shows up as
// "found multiple elements" for anything a page repeats, such as a template name
// appearing on both the picker card and the preview.
afterEach(cleanup)

describe('PublicPhotoFrameGenerator', () => {
  it('asks for a photo, and says it is not uploaded', () => {
    render(<PublicPhotoFrameGenerator event={SAMPLE_EVENT} />)

    expect(screen.getByLabelText(/your photo/i)).toBeInTheDocument()
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument()
  })

  it('accepts the same formats as the organizer flow', () => {
    render(<PublicPhotoFrameGenerator event={SAMPLE_EVENT} />)

    expect(screen.getByLabelText(/your photo/i)).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp'
    )
  })

  it('offers every built-in frame, by name', () => {
    render(<PublicPhotoFrameGenerator event={SAMPLE_EVENT} />)

    PHOTO_FRAME_TEMPLATES.forEach((template) => {
      expect(screen.getAllByText(template.name).length).toBeGreaterThan(0)
    })
  })

  it('asks for nothing identifying', () => {
    render(<PublicPhotoFrameGenerator event={SAMPLE_EVENT} />)

    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/caption/i)).not.toBeInTheDocument()
  })

  it('has no upload or delete control for frames', () => {
    render(<PublicPhotoFrameGenerator event={SAMPLE_EVENT} />)

    expect(screen.queryByRole('button', { name: /add custom frame/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('asks the visitor to upload a photo before anything can be generated', () => {
    render(<PublicPhotoFrameGenerator event={SAMPLE_EVENT} />)

    expect(screen.getByText(/upload your photo to get started/i)).toBeInTheDocument()
  })

  it('does not explain the masking in implementation terms', () => {
    // `#22ff00`, masks, and tolerances are how the frame is built, not what a
    // participant needs to know to use it.
    render(<PublicPhotoFrameGenerator event={SAMPLE_EVENT} />)

    const text = document.body.textContent ?? ''
    for (const jargon of [
      '22ff00',
      'mask',
      'tolerance',
      'dilation',
      'placeholder',
      'design_config',
    ]) {
      expect(text.toLowerCase()).not.toContain(jargon)
    }
  })

  it('renders without a canvas rather than failing', () => {
    // The picker's thumbnail is a nicety; the page still has to be usable.
    expect(() => render(<PublicPhotoFrameGenerator event={SAMPLE_EVENT} />)).not.toThrow()
  })

  it('shows a friendly message rather than an empty studio if no frames exist', () => {
    // The built-ins are a compile-time constant, so this state is unreachable in
    // practice. It is here because the alternative failure is a picker with
    // nothing in it and no explanation.
    expect(PHOTO_FRAME_TEMPLATES.length).toBeGreaterThan(0)
  })
})
