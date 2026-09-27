'use client'

import { useEffect, useRef, useState } from 'react'
import { renderQrInto } from '@/lib/qr'

/**
 * Draws a participant's QR onto a canvas this component owns.
 *
 * React keeps ownership of the element and the encoder is imported lazily, so a
 * participant's token only ever reaches the canvas it is drawn on. The `alt` text
 * says the code is a check-in pass rather than reading the token out, because
 * the token is a credential.
 */
export function ParticipantQr({
  token,
  size = 320,
  className,
}: {
  token: string
  size?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    setDrawn(false)

    void renderQrInto(canvas, token).then((ok) => {
      if (!cancelled) setDrawn(ok)
    })

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        role="img"
        aria-label="QR code that identifies this participant for check-in"
        className="rounded-xl border bg-white p-3"
        style={{ width: size, height: size }}
      />
      {!drawn && <p className="text-muted-foreground mt-2 text-center text-xs">Preparing code…</p>}
    </div>
  )
}
