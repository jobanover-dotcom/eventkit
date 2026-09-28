import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TextLayerBox } from './CertificateTemplateEditor'
import { RESIZE_HANDLES, newTextLayer } from '@/features/certificates/templates/geometry'
import { SAMPLE_RECIPIENT_NAME } from '@/features/certificates/templates/types'

/**
 * The editor's text-box DOM.
 *
 * Two bugs in a row lived here, and neither was reachable from a unit test of the
 * geometry helpers, because both were about which element a style landed on:
 *
 *  1. The name was positioned with a `paddingTop` percentage. A percentage
 *     padding resolves against the box's *width*, so on a wide, shallow box the
 *     padding exceeded the box and pushed the name out the bottom.
 *  2. The fix put `overflow-hidden` on the box, which erased all eight resize
 *     handles — they are children sitting at negative offsets. And it spread
 *     `justify-content`/`align-items` onto the name, which is a flex *item*, so
 *     both alignment controls computed a style the browser discarded and appeared
 *     to do nothing.
 *
 * These assert the structure that makes those impossible: exactly one clipping
 * element, exactly box-sized, with the handles outside it, and alignment applied
 * to the element that can honour it.
 */

// Vitest runs without globals, so Testing Library's automatic cleanup is not
// registered and renders would otherwise accumulate across these cases.
afterEach(cleanup)

const BOUNDS = { width: 1920, height: 1080 }

function layerBox(overrides = {}) {
  return newTextLayer(BOUNDS, overrides)
}

function renderBox(props: { selected?: boolean; layer?: ReturnType<typeof layerBox> } = {}) {
  const { selected = true, layer = layerBox() } = props
  return render(
    <TextLayerBox
      index={0}
      label="Recipient name"
      layer={layer}
      selected={selected}
      overflowing={false}
      onPointerDown={() => {}}
      onHandlePointerDown={() => () => {}}
      onKeyDown={() => {}}
    />
  )
}

describe('the editor text box', () => {
  it('shows the sample recipient name', () => {
    renderBox()
    expect(screen.getByText(SAMPLE_RECIPIENT_NAME)).toBeInTheDocument()
  })

  it('renders all eight resize handles when selected', () => {
    const { container } = renderBox({ selected: true })
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(RESIZE_HANDLES.length)
    expect(RESIZE_HANDLES).toHaveLength(8)
  })

  it('renders no handles when not selected, so the canvas stays clean', () => {
    const { container } = renderBox({ selected: false })
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(0)
  })

  it('does not clip the box itself, or the handles disappear with it', () => {
    // The regression: `overflow-hidden` on the box clipped every handle, because
    // they are children sitting outside the edges.
    const { container } = renderBox()
    const box = container.firstElementChild as HTMLElement
    expect(box.className).not.toContain('overflow-hidden')
  })

  it('clips the name in an element that is exactly the size of the box', () => {
    const { container } = renderBox()
    const box = container.firstElementChild as HTMLElement
    const clipper = box.querySelector('.overflow-hidden') as HTMLElement

    expect(clipper).not.toBeNull()
    // Full width and height, so the clip is the box and nothing else.
    expect(clipper.className).toContain('h-full')
    expect(clipper.className).toContain('w-full')
  })

  it('keeps every handle outside the clipping element', () => {
    const { container } = renderBox()
    const clipper = container.querySelector('.overflow-hidden') as HTMLElement
    for (const handle of container.querySelectorAll('[data-resize-handle]')) {
      expect(clipper.contains(handle)).toBe(false)
    }
  })

  it('applies vertical alignment to the flex container, not to the name', () => {
    // `align-items` does nothing on a flex item. It belongs on the container.
    const { container } = renderBox({ layer: layerBox({ verticalAlign: 'bottom' }) })
    const box = container.firstElementChild as HTMLElement
    const clipper = box.querySelector('.overflow-hidden') as HTMLElement
    const name = screen.getByText(SAMPLE_RECIPIENT_NAME)

    expect(clipper.className).toContain('flex')
    expect(clipper.style.alignItems).toBe('flex-end')
    expect(name.style.alignItems).toBe('')
  })

  it('applies horizontal alignment as text-align on the name', () => {
    // `justify-content` would be inert here: the name is a full-width item.
    const { container } = renderBox({ layer: layerBox({ horizontalAlign: 'right' }) })
    const name = screen.getByText(SAMPLE_RECIPIENT_NAME)

    expect(name.style.textAlign).toBe('right')
    expect(name.style.justifyContent).toBe('')
  })

  it.each([
    ['top', 'flex-start'],
    ['middle', 'center'],
    ['bottom', 'flex-end'],
  ] as const)('reflects vertical alignment %s as %s', (verticalAlign, expected) => {
    const { container } = renderBox({ layer: layerBox({ verticalAlign }) })
    const clipper = (container.firstElementChild as HTMLElement).querySelector(
      '.overflow-hidden'
    ) as HTMLElement
    expect(clipper.style.alignItems).toBe(expected)
  })

  it.each([
    ['left', 'left'],
    ['center', 'center'],
    ['right', 'right'],
  ] as const)('reflects horizontal alignment %s as text-align %s', (horizontalAlign, expected) => {
    renderBox({ layer: layerBox({ horizontalAlign }) })
    expect(screen.getByText(SAMPLE_RECIPIENT_NAME).style.textAlign).toBe(expected)
  })

  it('shows the configured font size, never a fitted one', () => {
    // The PDF auto-fits, but the editor must not render a different size from the
    // one in the font-size field, or that number stops meaning anything.
    const { container } = renderBox({ layer: layerBox({ fontSize: 77 }) })
    const name = screen.getByText(SAMPLE_RECIPIENT_NAME)
    expect(name.style.fontSize).toBe('77px')
  })

  it('applies the other typography settings to the name', () => {
    const layer = layerBox({
      fontFamily: 'lora',
      fontWeight: 400,
      italic: true,
      color: '#ff0000',
      letterSpacing: 3,
    })
    renderBox({ layer })
    const name = screen.getByText(SAMPLE_RECIPIENT_NAME)

    expect(name.style.fontStyle).toBe('italic')
    expect(name.style.color).toBe('rgb(255, 0, 0)')
    expect(name.style.letterSpacing).toBe('3px')
  })

  it('is labelled for assistive technology with its position', () => {
    renderBox()
    expect(screen.getByRole('button', { name: /recipient name text box 1/i })).toBeInTheDocument()
  })
})
