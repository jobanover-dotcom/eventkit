import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The organizer check-in page scans QR codes with the device camera, so the
  // check-in route needs camera access. `self` keeps it off embedded origins.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      /**
       * Next.js defaults a Server Action request body to 1 MB, which is below
       * every image size this app accepts, so a map or a custom template over
       * 1 MB failed before reaching any of our validation.
       *
       * 4.2 MB, deliberately, and not the 5 MB our own limit once claimed:
       *
       *   - The limit applies to the raw body, so it must clear the advertised
       *     `MAX_UPLOAD_BYTES` (4 MB) by the ~10–20 KB of multipart boundaries,
       *     part headers, and form fields that wrap the file.
       *   - Vercel caps a function's request body at 4.5 MB on the Node runtime
       *     and rejects an oversized one at the platform edge, ahead of this
       *     setting. Raising it past that would promise more than the
       *     deployment can deliver, and the failure would be opaque.
       *
       * `src/lib/uploadLimits.ts` documents the same reasoning, and a test
       * asserts the two numbers stay in step. Raising the advertised limit means
       * raising this one too, and neither goes above ~4 MB.
       */
      bodySizeLimit: '4.2mb',
    },
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
