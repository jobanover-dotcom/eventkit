import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import { MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES, formatMegabytes } from './uploadLimits'

/**
 * The two image size limits, and the transport that caps them.
 *
 * The bug these guard against was a number in `next.config.ts` and a number in a
 * schema drifting apart: uploads validated at 5 MB while the framework allowed a
 * 1 MB request body, so every image over 1 MB failed with a transport error
 * instead of a message. Nothing compared the two, and nothing would have caught a
 * future bump to either.
 *
 * `next.config.ts` is imported rather than parsed, so this cannot pass while the
 * config says something else.
 */

const SERVER_ACTIONS = nextConfig.experimental?.serverActions
const BODY_SIZE_LIMIT = SERVER_ACTIONS?.bodySizeLimit

/** Parses the `bytes` format the config accepts: a number, or `'4.2mb'`. */
function toBytes(value: string | number | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return Number.NaN

  const match = /^([\d.]+)\s*(b|kb|mb|gb)?$/i.exec(value.trim())
  if (!match) return Number.NaN

  const scale = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[
    (match[2] ?? 'b').toLowerCase() as 'b' | 'kb' | 'mb' | 'gb'
  ]
  return Number(match[1]) * scale
}

/**
 * Multipart framing overhead: boundaries, part headers, and the other form fields
 * wrapped around the file. The Next.js docs put it at 10–20 KB for a typical
 * upload, so anything under that is not real headroom.
 */
const MULTIPART_OVERHEAD_BYTES = 20 * 1024

/** Vercel caps a function's request body on the Node runtime. */
const VERCEL_BODY_CAP_BYTES = 4.5 * 1024 * 1024

describe('the Server Action body size limit', () => {
  it('is configured, since the default is below every image this app accepts', () => {
    expect(BODY_SIZE_LIMIT).toBeDefined()
    expect(toBytes(BODY_SIZE_LIMIT)).toBeGreaterThan(0)
  })

  it('fits a full upload plus its multipart framing', () => {
    // The limit applies to the raw body, so it has to clear the file itself.
    expect(toBytes(BODY_SIZE_LIMIT)).toBeGreaterThan(MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES)
  })

  it('does not exceed what Vercel will deliver', () => {
    // The platform rejects an oversized body at the edge, ahead of this setting,
    // so a higher value would promise more than the deployment can deliver.
    expect(toBytes(BODY_SIZE_LIMIT)).toBeLessThanOrEqual(VERCEL_BODY_CAP_BYTES)
  })

  it('records why the limit is where it is, so it is not casually raised', () => {
    const source = readFileSync(resolve('next.config.ts'), 'utf8')
    expect(source).toMatch(/Vercel/i)
  })
})

describe('the upload limit', () => {
  it('is inside the 5 MB Storage bucket policy, so no migration was needed', () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(5 * 1024 * 1024)
  })

  it('is reported in the same units the bucket and the copy use', () => {
    expect(formatMegabytes(MAX_UPLOAD_BYTES)).toBe('4 MB')
  })

  it('is not above the browser-only limit, which needs no headroom', () => {
    // The two ceilings are different constraints. A browser photo is bounded only
    // by what a browser will decode, so it may legitimately be larger — but if a
    // Server Action upload ever exceeded it, the hint copy would be a lie.
    expect(MAX_UPLOAD_BYTES).toBeLessThan(MAX_IMAGE_BYTES)
  })
})

describe('the browser-only image limit', () => {
  it('is larger than the upload limit, because no request is ever built for it', () => {
    expect(MAX_IMAGE_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES)
  })
})
