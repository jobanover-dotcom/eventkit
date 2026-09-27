'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnyDesignData, DesignOutput } from '@/features/design/types'
import type { DesignImages, DesignTemplate } from '@/features/design/lib/types'
import { canvasToPngDataUrl, renderDesign, resolveDesignImages } from '@/features/design/lib/render'
import { downloadPdf, downloadPng } from '@/features/design/lib/export'

/**
 * Preview and export state for one generator.
 *
 * The preview is a live, debounced, downscaled render. "Generate" produces a
 * full-resolution canvas which is then held until the inputs change again, so a
 * download is exactly the image that was previewed rather than a fresh render
 * that might differ.
 *
 * Nothing here mirrors an input into state inside an effect. "Is generated" and
 * "is there a preview" are *derived* from a key describing the current inputs,
 * so changing a form field cannot leave a stale download button enabled.
 */

const PREVIEW_MAX_WIDTH = 600
const PREVIEW_MAX_HEIGHT = 720
const PREVIEW_DEBOUNCE_MS = 220

export type DesignStatus = 'idle' | 'preparing' | 'previewing' | 'ready' | 'error'

export type UseDesignExportOptions<TData extends AnyDesignData> = {
  template: DesignTemplate<TData> | null
  data: TData
  includeQr: boolean
  photoUrl?: string | null
  /**
   * Overrides what the QR encodes. Certificates pass the certificate's
   * verification URL; badges leave it unset and get the check-in token.
   */
  qrPayload?: string | null
  /** Base download name, without extension. */
  filenameBase: string
}

export type UseDesignExportResult = {
  status: DesignStatus
  error: string | null
  previewUrl: string | null
  /** True once a full-resolution render exists for the current inputs. */
  isGenerated: boolean
  generate: () => Promise<void>
  download: (output: DesignOutput) => Promise<void>
}

function imagesCacheKey(
  data: AnyDesignData,
  includeQr: boolean,
  photoUrl: string | null | undefined,
  qrPayload: string | null | undefined
): string {
  const token =
    'participant' in data
      ? data.participant.qrToken
      : 'recipient' in data
        ? data.recipient.qrToken
        : ''
  // The payload is part of the key: swapping a recipient's certificate token
  // must invalidate the cached images, or a download would print a stale QR.
  const qrText = qrPayload?.trim() ? qrPayload.trim() : token
  return (
    [data.event.logoUrl ?? '', data.event.coverImageUrl ?? '', photoUrl ?? ''].join('|') +
    (includeQr ? `|${qrText}` : '')
  )
}

export function useDesignExport<TData extends AnyDesignData>(
  options: UseDesignExportOptions<TData>
): UseDesignExportResult {
  const { template, data, includeQr, photoUrl, qrPayload, filenameBase } = options

  const [renderState, setRenderState] = useState<{
    key: string
    status: DesignStatus
    previewUrl: string | null
    error: string | null
  }>({ key: '', status: 'idle', previewUrl: null, error: null })

  /** Key of the inputs the last generated canvas belongs to. */
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  // Mutable DOM handles live in refs: a canvas is not state, and putting one in
  // state would re-render on every frame of a render.
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const imagesRef = useRef<{ key: string; images: DesignImages } | null>(null)

  const currentKey = useMemo(
    () =>
      `${template?.id ?? ''}::${imagesCacheKey(data, includeQr, photoUrl, qrPayload)}::${JSON.stringify(data)}`,
    [template?.id, data, includeQr, photoUrl, qrPayload]
  )

  const resolveImages = useCallback(async (): Promise<DesignImages> => {
    if (!template) return {}

    const key = imagesCacheKey(data, includeQr, photoUrl, qrPayload)
    if (imagesRef.current?.key === key) return imagesRef.current.images

    const images = await resolveDesignImages<TData>({ data, includeQr, photoUrl, qrPayload })
    imagesRef.current = { key, images }
    return images
  }, [template, data, includeQr, photoUrl, qrPayload])

  useEffect(() => {
    if (!template) return

    let cancelled = false
    const key = currentKey
    setRenderState((previous) => ({ ...previous, key, status: 'preparing', error: null }))

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const images = await resolveImages()
          if (cancelled) return

          setRenderState((previous) =>
            previous.key === key ? { ...previous, status: 'previewing' } : previous
          )

          const scale = Math.min(
            1,
            PREVIEW_MAX_WIDTH / template.width,
            PREVIEW_MAX_HEIGHT / template.height
          )
          const canvas = await renderDesign(template, data, images, { scale })
          if (cancelled) return

          setRenderState({
            key,
            status: 'ready',
            previewUrl: canvasToPngDataUrl(canvas),
            error: null,
          })
        } catch (cause) {
          if (cancelled) return
          setRenderState({
            key,
            status: 'error',
            previewUrl: null,
            error: cause instanceof Error ? cause.message : 'The preview could not be rendered.',
          })
        }
      })()
    }, PREVIEW_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [template, data, resolveImages, currentKey])

  const generate = useCallback(async () => {
    if (!template) return

    setRenderState((previous) => ({ ...previous, status: 'preparing', error: null }))

    try {
      const images = await resolveImages()
      const canvas = await renderDesign(template, data, images, { scale: 1 })
      exportCanvasRef.current = canvas
      setGeneratedKey(currentKey)
      setRenderState((previous) => ({ ...previous, status: 'ready' }))
    } catch (cause) {
      setRenderState((previous) => ({
        ...previous,
        status: 'error',
        error: cause instanceof Error ? cause.message : 'The design could not be generated.',
      }))
    }
  }, [template, data, resolveImages, currentKey])

  const download = useCallback(
    async (output: DesignOutput) => {
      const canvas = exportCanvasRef.current
      if (!canvas || !template) {
        setRenderState((previous) => ({
          ...previous,
          error: 'Generate the design first, then download it.',
        }))
        return
      }

      if (!template.outputs.includes(output)) {
        setRenderState((previous) => ({
          ...previous,
          error: `This template cannot be exported as ${output.toUpperCase()}.`,
        }))
        return
      }

      setRenderState((previous) => ({ ...previous, error: null }))

      try {
        if (output === 'png') {
          await downloadPng(canvas, filenameBase)
        } else {
          await downloadPdf(canvas, filenameBase, template.page)
        }
      } catch (cause) {
        setRenderState((previous) => ({
          ...previous,
          error: cause instanceof Error ? cause.message : 'The download could not be prepared.',
        }))
      }
    },
    [filenameBase, template]
  )

  // Derived, so a form change can never leave a stale preview or an enabled
  // download pointing at an old render.
  const isCurrent = renderState.key === currentKey

  return {
    status: template ? (isCurrent ? renderState.status : 'preparing') : 'idle',
    error: isCurrent ? renderState.error : null,
    previewUrl: template && isCurrent ? renderState.previewUrl : null,
    isGenerated: generatedKey === currentKey && exportCanvasRef.current !== null,
    generate,
    download,
  }
}
