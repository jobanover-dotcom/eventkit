'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { validateImageFile } from '@/features/design/schemas/design.schema'

/**
 * Picking the photo a frame or certificate shows.
 *
 * Shared by the organizer studio and the public photo-frame page so both apply
 * the identical rules. That matters for more than tidiness: the organizer's copy
 * of this logic accepts a format the public one rejects, and a visitor would then
 * get a different answer to the same question depending on where they were.
 *
 * The photo never leaves the browser. It is held as an object URL, drawn onto a
 * canvas, and discarded — so there is no storage path to authorize and nothing to
 * clean up when the tab closes.
 */

export type PhotoState = {
  url: string
  name: string
  bytes: number
}

/** What the organizers' accept attribute and the hint text agree on. */
export const ACCEPTED_PHOTO_TYPES = 'image/png,image/jpeg,image/webp'

export function usePhotoPicker() {
  const [photo, setPhoto] = useState<PhotoState | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  // Object URLs leak until revoked, so the previous one is released whenever the
  // photo changes and when the component goes away.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const clear = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setPhoto(null)
    setPhotoError(null)
  }, [])

  /**
   * Validates and adopts a chosen file, or sets the reason it was refused.
   *
   * Size, emptiness, and the minimum dimensions are checked before decoding, then
   * the decoded size is checked again: a declared width is only a claim, and the
   * point of the second pass is to catch a file whose header disagreed with its
   * pixels.
   */
  const choose = useCallback(
    async (file: File | null) => {
      setPhotoError(null)

      if (!file) {
        clear()
        return
      }

      const result = validateImageFile(file)
      if (!result.accepted) {
        setPhotoError(result.reason)
        return
      }

      const url = URL.createObjectURL(file)

      // Decode to confirm the file really is an image before it reaches a canvas.
      try {
        const image = new Image()
        image.src = url
        await image.decode()

        const sized = validateImageFile(file, {
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
        if (!sized.accepted) {
          URL.revokeObjectURL(url)
          setPhotoError(sized.reason)
          return
        }
      } catch {
        URL.revokeObjectURL(url)
        setPhotoError('That file could not be read as an image.')
        return
      }

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = url
      setPhoto({ url, name: file.name, bytes: file.size })
    },
    [clear]
  )

  return { photo, photoError, choose, clear }
}
