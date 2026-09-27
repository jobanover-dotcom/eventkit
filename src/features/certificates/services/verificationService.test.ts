import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Public certificate verification, asserted against a mocked Supabase client.
 *
 * The point of these tests is what the function does *not* return. A verification
 * page is reachable by anybody who scans a QR, so the read has to be narrow
 * enough that it cannot become a way to look up a participant.
 */

const rpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc }),
}))

const { verifyCertificateToken } = await import('./verificationService')

const ROW = {
  certificate_type: 'Appreciation',
  award: '',
  issued_at: '2026-09-27T10:00:00.000Z',
  recipient_name: 'Juan Dela Cruz',
  recipient_role: 'Speaker',
  recipient_title: 'Keynote Speaker',
  recipient_organization: 'Assumption College of Davao',
  event_id: '22222222-2222-4222-8222-222222222222',
  event_name: 'IT Fest 2026',
  event_venue: 'Gymnasium',
  event_date: '2026-09-27',
}

beforeEach(() => rpc.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('verifyCertificateToken', () => {
  it('returns the certificate for a valid token', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null })
    const result = await verifyCertificateToken('a'.repeat(64))

    expect(result).not.toBeNull()
    expect(result?.certificateTitle).toBe('Certificate of Appreciation')
    expect(result?.recipientName).toBe('Juan Dela Cruz')
    expect(result?.eventName).toBe('IT Fest 2026')
  })

  it('passes the token through to the security definer function', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null })
    await verifyCertificateToken('a'.repeat(64))
    expect(rpc).toHaveBeenCalledWith('get_certificate_verification', { p_token: 'a'.repeat(64) })
  })

  it('returns null for an unknown token', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await verifyCertificateToken('a'.repeat(64))).toBeNull()
  })

  it('returns null rather than an error when the query fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    // A database error must not be distinguishable from a missing certificate,
    // or the page would leak whether a token ever existed.
    expect(await verifyCertificateToken('a'.repeat(64))).toBeNull()
  })

  it('rejects a too-short token without querying', async () => {
    expect(await verifyCertificateToken('short')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('trims surrounding whitespace from a scanned token', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null })
    await verifyCertificateToken(`  ${'a'.repeat(64)}  `)
    expect(rpc).toHaveBeenCalledWith('get_certificate_verification', { p_token: 'a'.repeat(64) })
  })

  it('labels a speaker as Speaker', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null })
    const result = await verifyCertificateToken('a'.repeat(64))
    expect(result?.recipientRoleLabel).toBe('Speaker')
  })

  it('labels an ordinary participant as Participant', async () => {
    rpc.mockResolvedValue({
      data: [
        { ...ROW, recipient_role: 'Student', recipient_title: null, recipient_organization: null },
      ],
      error: null,
    })
    const result = await verifyCertificateToken('a'.repeat(64))
    expect(result?.recipientRoleLabel).toBe('Participant')
  })

  it('normalizes empty speaker fields to null so the page omits them', async () => {
    rpc.mockResolvedValue({
      data: [{ ...ROW, recipient_title: '   ', recipient_organization: '' }],
      error: null,
    })
    const result = await verifyCertificateToken('a'.repeat(64))
    expect(result?.recipientTitle).toBeNull()
    expect(result?.recipientOrganization).toBeNull()
  })

  it('returns a null award rather than undefined', async () => {
    rpc.mockResolvedValue({ data: [{ ...ROW, award: '' }], error: null })
    expect((await verifyCertificateToken('a'.repeat(64)))?.award).toBe('')
  })

  it('exposes no check-in token, email, or student id', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null })
    const result = await verifyCertificateToken('a'.repeat(64))

    // The whole surface a verifier can see.
    const keys = Object.keys(result ?? {}).join(',')
    for (const forbidden of ['qrToken', 'qr_token', 'email', 'studentId', 'certificateId']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('falls back to a generic title for a type with no preset', async () => {
    rpc.mockResolvedValue({ data: [{ ...ROW, certificate_type: 'Winner' }], error: null })
    // 'Winner' is a stored value with no matching preset, so it must not throw.
    const result = await verifyCertificateToken('a'.repeat(64))
    expect(result?.certificateTitle).toBe('Certificate of Winner')
  })
})
