/**
 * Image size limits, and the transport that decides them.
 *
 * There are two different ceilings in play, and conflating them is what produced
 * an upload that validated at 5 MB and then failed at 1 MB.
 *
 * 1. **Server Action transport.** An image posted to a Server Action travels as
 *    the raw HTTP request body, and there are two limits on it. Next.js applies
 *    `experimental.serverActions.bodySizeLimit` (see `next.config.ts`), and Vercel
 *    independently caps a function's request body at 4.5 MB on the Node runtime.
 *    The platform rejects an oversized body before the framework's own limit is
 *    consulted, so **Vercel's 4.5 MB is the real ceiling** and no configuration
 *    can raise it. That is what `MAX_UPLOAD_BYTES` is derived from.
 *
 * 2. **Browser-only images.** A photo the visitor picks never leaves their device
 *    — it is held as an object URL and drawn onto a canvas — so no request body
 *    is ever built and neither limit applies. It is bounded only by what a browser
 *    will usefully decode.
 *
 * Both sit inside the 5 MB Storage bucket policy, so neither needs a migration.
 *
 * A test asserts the upload limit stays below the configured transport limit, so
 * the two numbers cannot drift apart again.
 */

/**
 * Largest image that may be posted to a Server Action.
 *
 * 4 MB, not 5: the extra megabyte would be accepted by our own validation and
 * then rejected by Vercel with an opaque transport error after the upload had
 * already started. Promising only what the platform can deliver is the difference
 * between a clear message and a confusing one.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

/**
 * Largest browser-local image.
 *
 * Unconstrained by the transport, so this may be larger than `MAX_UPLOAD_BYTES`.
 * A modern phone photo is commonly 2–4 MB, so 5 MB is a useful ceiling for a
 * picture somebody actually took rather than an arbitrary one.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** As an organizer-facing size, for a hint or an error message. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}
