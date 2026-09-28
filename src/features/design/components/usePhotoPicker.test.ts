import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCEPTED_PHOTO_TYPES, usePhotoPicker } from './usePhotoPicker'
import { MAX_IMAGE_BYTES } from '@/features/design/schemas/design.schema'

/**
 * The photo upload shared by the organizer studio and the public page.
 *
 * It is shared so both answer the same question the same way. The rules under test
 * are the ones a participant actually trips over: a HEIC off a phone, a file over
 * the size cap, and an image too small to frame. Each of those must be refused
 * with the existing wording rather than reaching a canvas and failing there.
 *
 * `Image.decode` is stubbed because jsdom has no image decoder, and the hook
 * treats a decode failure as "not an image" — which is a real branch worth
 * pinning rather than a limitation of the environment.
 */

const revokeObjectURL = vi.fn()
const createObjectURL = vi.fn(() => 'blob:frame-photo')

function stubDecode(impl: () => Promise<void> = () => Promise.resolve()) {
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 1600
      naturalHeight = 1200
      decode = impl
      set src(_value: string) {}
    }
  )
}

function file(overrides: Partial<File> = {}): File {
  return {
    type: 'image/jpeg',
    size: 1024,
    name: 'graduation.jpg',
    ...overrides,
  } as File
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('usePhotoPicker', () => {
  it('accepts the formats the accept attribute advertises', async () => {
    expect(ACCEPTED_PHOTO_TYPES).toBe('image/png,image/jpeg,image/webp')
  })

  it('adopts a decodable image as an object URL', async () => {
    stubDecode()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const { result } = renderHook(() => usePhotoPicker())
    await act(async () => {
      await result.current.choose(file())
    })

    expect(result.current.photo?.url).toBe('blob:frame-photo')
    expect(result.current.photo?.name).toBe('graduation.jpg')
    expect(result.current.photoError).toBeNull()
  })

  it('refuses a format the renderer does not accept', async () => {
    stubDecode()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const { result } = renderHook(() => usePhotoPicker())
    await act(async () => {
      await result.current.choose(file({ type: 'image/heic' }))
    })

    expect(result.current.photo).toBeNull()
    expect(result.current.photoError).toMatch(/PNG, JPEG, or WebP/i)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('refuses a file over the size cap, before decoding it', async () => {
    const decode = vi.fn(() => Promise.resolve())
    stubDecode(decode)
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const { result } = renderHook(() => usePhotoPicker())
    await act(async () => {
      await result.current.choose(file({ size: MAX_IMAGE_BYTES + 1 }))
    })

    expect(result.current.photo).toBeNull()
    expect(result.current.photoError).toMatch(/5 MB or smaller/i)
    expect(decode).not.toHaveBeenCalled()
  })

  it('refuses an image too small to frame', async () => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 32
        naturalHeight = 32
        decode = () => Promise.resolve()
        set src(_value: string) {}
      }
    )
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const { result } = renderHook(() => usePhotoPicker())
    await act(async () => {
      await result.current.choose(file())
    })

    expect(result.current.photo).toBeNull()
    expect(result.current.photoError).toBeTruthy()
  })

  it('treats a decode failure as "not an image" and releases the URL', async () => {
    stubDecode(() => Promise.reject(new Error('unsupported')))
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const { result } = renderHook(() => usePhotoPicker())
    await act(async () => {
      await result.current.choose(file())
    })

    expect(result.current.photo).toBeNull()
    expect(result.current.photoError).toMatch(/could not be read as an image/i)
    // Nothing is left holding the blob it just made.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:frame-photo')
  })

  it('releases the previous photo when a new one is chosen', async () => {
    stubDecode()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const { result } = renderHook(() => usePhotoPicker())
    await act(async () => {
      await result.current.choose(file())
    })
    await act(async () => {
      await result.current.choose(file({ name: 'second.jpg' }))
    })

    expect(result.current.photo?.name).toBe('second.jpg')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:frame-photo')
  })

  it('clears the photo and its error', async () => {
    stubDecode()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const { result } = renderHook(() => usePhotoPicker())
    await act(async () => {
      await result.current.choose(file({ type: 'image/heic' }))
    })
    expect(result.current.photoError).toBeTruthy()

    act(() => result.current.clear())

    await waitFor(() => {
      expect(result.current.photo).toBeNull()
      expect(result.current.photoError).toBeNull()
    })
  })

  it('releases the object URL when the component goes away', async () => {
    stubDecode()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const { result, unmount } = renderHook(() => usePhotoPicker())
    await act(async () => {
      await result.current.choose(file())
    })
    expect(createObjectURL).toHaveBeenCalled()

    revokeObjectURL.mockClear()
    unmount()

    // A leak would be invisible to the visitor but would pin a decoded frame in
    // memory for the life of the tab, so unmounting has to release the blob.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:frame-photo')
  })
})
