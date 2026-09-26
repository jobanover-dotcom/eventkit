'use client'

import { useEffect, useRef, useState } from 'react'

/** Illustrative token. Not a real participant token — the QR is never a credential here. */
const PREVIEW_TOKEN = 'eventkit-preview-pass-not-a-credential'

export function EventPassPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    // Imported lazily so the generator never lands in the shared bundle.
    void import('qrcode')
      .then(({ toCanvas }) => {
        if (cancelled) return
        return toCanvas(canvas, PREVIEW_TOKEN, {
          width: 132,
          margin: 0,
          errorCorrectionLevel: 'M',
          color: { dark: '#1c1a2e', light: '#ffffff' },
        })
      })
      .then(() => {
        if (!cancelled) setHasDrawn(true)
      })
      .catch(() => {
        // The pass chrome stays useful without the code; nothing to recover here.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div
        aria-hidden="true"
        className="from-primary/20 via-chart-2/20 to-chart-3/20 absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br blur-2xl"
      />

      <div className="bg-card overflow-hidden rounded-3xl border shadow-xl">
        <div className="from-primary to-chart-2 relative bg-gradient-to-br px-6 py-5 text-primary-foreground">
          <p className="text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-90">
            Event pass
          </p>
          <p className="font-heading mt-1 text-2xl leading-tight font-extrabold">IT FEST 2026</p>
          <p className="mt-1 text-sm opacity-90">November 5, 2026 · Assumption College</p>
        </div>

        <div className="flex items-end justify-between gap-4 px-6 py-6">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Participant
            </p>
            <p className="font-heading mt-1 truncate text-xl font-bold">Jam Añover</p>
            <p className="text-muted-foreground mt-0.5 text-sm">BSIT · 3A</p>
            <span className="bg-primary/10 text-primary mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold">
              Student
            </span>
          </div>

          <div className="shrink-0">
            <canvas
              ref={canvasRef}
              width={132}
              height={132}
              role="img"
              aria-label="Illustration of a QR code on a sample event pass"
              className="size-[7.5rem] rounded-xl bg-white p-1.5"
            />
            {!hasDrawn && <span className="sr-only">QR code preview loading</span>}
          </div>
        </div>

        <p className="text-muted-foreground border-t px-6 py-3 text-center text-xs">
          Presented by BSIT Department
        </p>
      </div>
    </div>
  )
}
