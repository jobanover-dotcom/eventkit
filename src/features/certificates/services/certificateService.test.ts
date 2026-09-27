import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Certificate issuance, asserted against a mocked Supabase client.
 *
 * These tests are the application half of the attendance rule. The database
 * refuses to store a certificate for somebody with no attendance row, and this
 * layer refuses before it gets there — turning a policy violation into a message
 * an organizer can act on, and keeping a crafted payload from issuing anything.
 */

const from = vi.fn()
const rpc = vi.fn()
const getOwnedEvent = vi.fn()
const upload = vi.fn()
const remove = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from, rpc }) }))
vi.mock('@/features/events/services/eventService', () => ({
  getOwnedEvent: (...args: unknown[]) => getOwnedEvent(...args),
}))
vi.mock('@/features/attendance/services/attendanceService', () => ({
  getEventRoster: vi.fn(),
}))

import type { Roster } from '@/features/attendance/services/attendanceService'

const { getEventRoster: getEventRosterImpl } = await import(
  '@/features/attendance/services/attendanceService'
)
// The module is mocked above, so the real signature is a plain function here.
const getEventRoster = vi.mocked(getEventRosterImpl)
const { issueCertificates } = await import('./certificateService')

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const EVENT = { id: EVENT_ID, organizer_id: 'organizer-1' }

/**
 * Only `rows` matters to the service; the other roster fields are the page's
 * concern and are left as inert placeholders.
 */
function roster(rows: { id: string; role: string; status: string }[]) {
  return {
    rows: rows as unknown as Roster['rows'],
    filtered: [],
    roles: [],
    hasSpeakers: false,
    summary: { total: rows.length, checkedIn: 0, notCheckedIn: 0, rate: 0 },
  } satisfies Roster
}

/**
 * A chainable query stub. Records the payload passed to `insert` and `update` so
 * a test can assert what was *not* written, which is how the token-preservation
 * rule is proved.
 */
type QueryStub = Record<string, unknown> & {
  insertPayload: () => unknown
  updatePayload: () => unknown
}

function queryReturning(rows: unknown[]): QueryStub {
  const chain: Record<string, unknown> = {}
  let inserted: unknown
  let updated: unknown
  // How the terminal method should shape the result. `.single()` and
  // `.maybeSingle()` both resolve to one row; everything else resolves to a list.
  let shape: 'many' | 'single' | 'maybeSingle' = 'many'

  for (const method of ['select', 'eq', 'order']) {
    chain[method] = vi.fn(() => chain)
  }

  const terminal = (next: typeof shape) =>
    vi.fn(() => {
      shape = next
      return chain
    })

  chain.single = terminal('single')
  chain.maybeSingle = terminal('maybeSingle')
  chain.insert = vi.fn((payload: unknown) => {
    inserted = payload
    return chain
  })
  chain.update = vi.fn((payload: unknown) => {
    updated = payload
    return chain
  })

  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({
      data: shape === 'many' ? rows : (rows[0] ?? null),
      error: null,
    })

  chain.insertPayload = () => inserted
  chain.updatePayload = () => updated
  return chain as QueryStub
}

function certificateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cert-1',
    event_id: EVENT_ID,
    participant_id: 'p1',
    certificate_type: 'Participation',
    award: '',
    signatory: '',
    verification_token: 'v'.repeat(64),
    issued_at: '2026-09-27T10:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  getOwnedEvent.mockReset()
  getEventRoster.mockReset()
  getOwnedEvent.mockResolvedValue(EVENT)
})

afterEach(() => vi.restoreAllMocks())

const VALUES = {
  eventId: EVENT_ID,
  type: 'PARTICIPANT' as const,
  certificateType: 'Participation' as const,
  participantIds: ['p1'],
  award: '',
  signatory: '',
}

describe('issueCertificates', () => {
  it('creates a record and returns its verification token', async () => {
    getEventRoster.mockResolvedValue(roster([{ id: 'p1', role: 'Student', status: 'checked_in' }]))

    from.mockReturnValueOnce(queryReturning([])) // no existing record
    from.mockReturnValueOnce(queryReturning([certificateRow()])) // insert

    const outcome = await issueCertificates(VALUES)

    expect(outcome.issued).toHaveLength(1)
    expect(outcome.issued[0].verificationToken).toBe('v'.repeat(64))
    expect(outcome.issued[0].regenerated).toBe(false)
  })

  it('proves event ownership before writing anything', async () => {
    getOwnedEvent.mockRejectedValue(new Error('NOT_FOUND'))
    await expect(issueCertificates(VALUES)).rejects.toThrow()
    expect(from).not.toHaveBeenCalled()
  })

  it('refuses a recipient who did not check in', async () => {
    getEventRoster.mockResolvedValue(
      roster([{ id: 'p1', role: 'Student', status: 'not_checked_in' }])
    )

    await expect(issueCertificates(VALUES)).rejects.toThrow(/None of the selected/)
    expect(from).not.toHaveBeenCalled()
  })

  it('refuses a speaker when the request is for participants', async () => {
    getEventRoster.mockResolvedValue(roster([{ id: 's1', role: 'Speaker', status: 'checked_in' }]))

    await expect(issueCertificates({ ...VALUES, participantIds: ['s1'] })).rejects.toThrow(
      /None of the selected/
    )
  })

  it('issues to a speaker when the request is for speakers', async () => {
    getEventRoster.mockResolvedValue(roster([{ id: 's1', role: 'Speaker', status: 'checked_in' }]))
    from.mockReturnValueOnce(queryReturning([]))
    from.mockReturnValueOnce(queryReturning([certificateRow({ participant_id: 's1' })]))

    const outcome = await issueCertificates({ ...VALUES, type: 'SPEAKER', participantIds: ['s1'] })
    expect(outcome.issued).toHaveLength(1)
  })

  it('refuses a participant id that is not on the roster', async () => {
    getEventRoster.mockResolvedValue(roster([{ id: 'p1', role: 'Student', status: 'checked_in' }]))

    await expect(
      issueCertificates({ ...VALUES, participantIds: ['not-on-roster'] })
    ).rejects.toThrow()
  })

  it('reports which ids were skipped rather than dropping them silently', async () => {
    getEventRoster.mockResolvedValue(roster([{ id: 'p1', role: 'Student', status: 'checked_in' }]))
    from.mockReturnValueOnce(queryReturning([]))
    from.mockReturnValueOnce(queryReturning([certificateRow()]))

    const outcome = await issueCertificates({ ...VALUES, participantIds: ['p1', 'stranger'] })

    expect(outcome.issued).toHaveLength(1)
    expect(outcome.skipped.unknown).toEqual(['stranger'])
  })

  it('reports a checked-in person from the wrong group separately', async () => {
    // s1 is on the roster and has checked in, but a participants run must not
    // issue to it: it is reported as wrong-group, not as unknown.
    getEventRoster.mockResolvedValue(
      roster([
        { id: 'p1', role: 'Student', status: 'checked_in' },
        { id: 's1', role: 'Speaker', status: 'checked_in' },
      ])
    )
    from.mockReturnValueOnce(queryReturning([]))
    from.mockReturnValueOnce(queryReturning([certificateRow()]))

    const outcome = await issueCertificates({ ...VALUES, participantIds: ['p1', 's1'] })

    expect(outcome.issued.map((entry) => entry.participantId)).toEqual(['p1'])
    expect(outcome.skipped.notInGroup).toEqual(['s1'])
    expect(outcome.skipped.unknown).toEqual([])
  })

  it('regenerates in place and keeps the existing token', async () => {
    getEventRoster.mockResolvedValue(roster([{ id: 'p1', role: 'Student', status: 'checked_in' }]))

    from.mockReturnValueOnce(queryReturning([certificateRow({ id: 'cert-existing' })])) // existing
    from.mockReturnValueOnce(queryReturning([certificateRow({ id: 'cert-existing' })])) // update

    const outcome = await issueCertificates(VALUES)

    expect(outcome.issued[0].regenerated).toBe(true)
    // A QR somebody already printed must keep working.
    expect(outcome.issued[0].verificationToken).toBe('v'.repeat(64))
    expect(outcome.regeneratedCount).toBe(1)
  })

  it('never writes a verification token when regenerating', async () => {
    getEventRoster.mockResolvedValue(roster([{ id: 'p1', role: 'Student', status: 'checked_in' }]))
    from.mockReturnValueOnce(queryReturning([certificateRow()]))
    const updateChain = queryReturning([certificateRow()])
    from.mockReturnValueOnce(updateChain)

    await issueCertificates({ ...VALUES, certificateType: 'Appreciation' })

    const payload = updateChain.updatePayload() as Record<string, unknown>
    expect(payload).toBeDefined()
    // Rotating this would silently invalidate every printed copy.
    expect('verification_token' in payload).toBe(false)
    expect(payload.certificate_type).toBe('Appreciation')
  })

  it('issues several recipients in one call', async () => {
    getEventRoster.mockResolvedValue(
      roster([
        { id: 'p1', role: 'Student', status: 'checked_in' },
        { id: 'p2', role: 'Student', status: 'checked_in' },
        { id: 'p3', role: 'Student', status: 'checked_in' },
      ])
    )

    from.mockReturnValue(queryReturning([certificateRow()]))
    const outcome = await issueCertificates({
      ...VALUES,
      participantIds: ['p1', 'p2', 'p3'],
    })

    expect(outcome.issued).toHaveLength(3)
  })

  it('deduplicates a repeated id', async () => {
    getEventRoster.mockResolvedValue(roster([{ id: 'p1', role: 'Student', status: 'checked_in' }]))
    from.mockReturnValueOnce(queryReturning([]))
    from.mockReturnValueOnce(queryReturning([certificateRow()]))

    const outcome = await issueCertificates({ ...VALUES, participantIds: ['p1', 'p1'] })
    expect(outcome.issued).toHaveLength(1)
  })
})

describe('upload helpers are unused here', () => {
  it('keeps the storage mocks honest', () => {
    expect(typeof upload).toBe('function')
    expect(typeof remove).toBe('function')
  })
})
