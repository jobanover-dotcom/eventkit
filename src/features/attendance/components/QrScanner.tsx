'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CameraOff, Loader2, QrCode, RotateCcw, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { checkInAction, type CheckInResult } from '@/features/attendance/actions/checkIn.action'
import { ScanResultCard } from '@/features/attendance/components/ScanResultCard'

/**
 * Camera check-in.
 *
 * Built for one-handed use at a busy door: the scanner fills the screen, a
 * result appears over it, and scanning continues without navigating away. The
 * organizer never leaves this page between people.
 *
 * `html5-qrcode` is imported dynamically inside the effect. It is by far the
 * heaviest dependency the project pulls in, and this keeps it out of every other
 * route's bundle.
 */

type ScannerPhase = 'idle' | 'starting' | 'scanning' | 'submitting' | 'error'

/** The slice of the scanner the page actually drives. */
type Html5QrcodeScannerHandle = {
  isScanning: boolean
  stop: () => Promise<void>
  clear: () => void
}

/** Ignore repeat decodes of the same code while a request is in flight. */
const RESCAN_COOLDOWN_MS = 2500

export function QrScanner({ eventId }: { eventId: string }) {
  const router = useRouter()
  const scannerHostId = 'eventkit-check-in-scanner'

  const [phase, setPhase] = useState<ScannerPhase>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [manualToken, setManualToken] = useState('')

  const scannerRef = useRef<Html5QrcodeScannerHandle | null>(null)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void scannerRef.current?.stop().catch(() => undefined)
      scannerRef.current = null
    }
  }, [])

  const submit = useCallback(
    async (rawToken: string) => {
      if (busyRef.current) return
      busyRef.current = true
      setPhase('submitting')

      try {
        const response = await checkInAction({ eventId, token: rawToken })
        if (!mountedRef.current) return
        setResult(response)
      } catch {
        if (!mountedRef.current) return
        setResult({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Check-in failed. Please try again.' },
        })
      } finally {
        if (mountedRef.current) {
          busyRef.current = false
          setPhase('scanning')
        }
      }
    },
    [eventId]
  )

  const startScanner = useCallback(async () => {
    setCameraError(null)
    setResult(null)
    setPhase('starting')

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')

      if (!mountedRef.current) return

      const scanner = new Html5Qrcode(scannerHostId, {
        verbose: false,
        // Decoding only QR keeps the per-frame work down on a phone.
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      })

      scannerRef.current = scanner

      await scanner.start(
        // Prefer the rear camera on a phone, which is what a door scanner needs.
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decoded) => {
          void submit(decoded)
        },
        () => {
          // Fired for every frame that is not a code. Not an error.
        }
      )

      if (mountedRef.current) setPhase('scanning')
    } catch (cause) {
      if (!mountedRef.current) return
      setPhase('error')
      setCameraError(describeCameraError(cause))
    }
  }, [submit])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (!scanner) return

    try {
      if (scanner.isScanning) await scanner.stop()
    } catch {
      // Stopping an already-stopped camera is not worth surfacing.
    }
    scanner.clear()
  }, [])

  // Cooldown so one held-up code cannot fire a burst of requests, and so the
  // organizer can look at the result before the next person steps up.
  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), RESCAN_COOLDOWN_MS)
    return () => clearTimeout(timer)
  }, [result])

  // Keep the organizer lists fresh when they navigate back from here.
  useEffect(() => {
    if (result?.ok) {
      router.refresh()
    }
  }, [result, router])

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div
            id={scannerHostId}
            className="bg-muted/40 min-h-72 w-full overflow-hidden rounded-xl border"
          />

          {phase === 'starting' && (
            <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Starting the camera…
            </p>
          )}

          {cameraError && (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 flex flex-col gap-2 rounded-lg border px-3 py-3 text-sm"
            >
              <p className="text-destructive flex items-center gap-2 font-medium">
                <CameraOff className="size-4" aria-hidden="true" />
                Camera unavailable
              </p>
              <p className="text-muted-foreground">{cameraError}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => void startScanner()}>
                  <RotateCcw aria-hidden="true" />
                  Try again
                </Button>
              </div>
            </div>
          )}

          {!cameraError && phase === 'scanning' && !result && (
            <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-sm">
              <ScanLine className="size-4" aria-hidden="true" />
              Point the camera at a participant&rsquo;s QR code.
            </p>
          )}

          {result && <ScanResultCard result={result} />}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <QrCode className="text-muted-foreground size-4" aria-hidden="true" />
            <Label htmlFor="manual-token">Enter a code by hand</Label>
            <Badge variant="outline">Fallback</Badge>
          </div>

          <p className="text-muted-foreground text-sm">
            For a laptop with no working camera. Open a participant&rsquo;s pass and copy the
            check-in code shown beneath the QR.
          </p>

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              const token = manualToken.trim()
              if (!token) return
              void submit(token)
            }}
          >
            <Input
              id="manual-token"
              value={manualToken}
              onChange={(event) => setManualToken(event.target.value)}
              placeholder="Paste the check-in code"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <Button type="submit" disabled={manualToken.trim() === '' || phase === 'submitting'}>
              {phase === 'submitting' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              Check in
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void startScanner()}>
          <RotateCcw aria-hidden="true" />
          Restart camera
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await stopScanner()
            setPhase('idle')
            setCameraError(null)
            setResult(null)
          }}
        >
          Stop camera
        </Button>
      </div>
    </div>
  )
}

/** Turns a camera failure into something an organizer can act on. */
function describeCameraError(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : ''
  const message = cause instanceof Error ? cause.message : String(cause ?? '')

  if (name === 'NotAllowedError' || /permission/i.test(message)) {
    return 'Camera access was blocked. Allow the camera for this site in your browser settings, then choose “Try again”.'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || /not found/i.test(message)) {
    return 'No camera was found on this device. Use the code entry below instead.'
  }

  if (name === 'NotReadableError' || /in use|already/i.test(message)) {
    return 'Another app is using the camera. Close it and choose “Try again”.'
  }

  if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
    return 'This browser cannot open a camera. Use the code entry below instead.'
  }

  return 'The camera could not be started. Use the code entry below instead.'
}
