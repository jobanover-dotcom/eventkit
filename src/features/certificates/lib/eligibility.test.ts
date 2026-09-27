import { describe, expect, it } from 'vitest'
import {
  isAlreadyIssued,
  reconcileSelection,
  selectCertificateCandidates,
  type CertificateCandidate,
} from './eligibility'

function person(
  id: string,
  role: string,
  checkedIn: boolean,
  extra: Partial<CertificateCandidate> = {}
): CertificateCandidate {
  return {
    id,
    name: `Person ${id}`,
    role,
    type: role === 'Speaker' ? 'SPEAKER' : 'PARTICIPANT',
    title: null,
    organization: null,
    checkedIn,
    ...extra,
  }
}

const ROSTER: CertificateCandidate[] = [
  person('p1', 'Student', true),
  person('p2', 'Student', false),
  person('p3', 'Guest', true),
  person('s1', 'Speaker', true, { title: 'Keynote Speaker', organization: 'ACD' }),
  person('s2', 'Speaker', false),
]

describe('selectCertificateCandidates', () => {
  it('defaults to checked-in people only', () => {
    const result = selectCertificateCandidates(ROSTER, { type: 'PARTICIPANT' })
    expect(result.eligible.map((c) => c.id)).toEqual(['p1', 'p3'])
  })

  it('excludes a participant who did not attend', () => {
    const result = selectCertificateCandidates(ROSTER, { type: 'PARTICIPANT' })
    expect(result.eligible.some((c) => c.id === 'p2')).toBe(false)
    expect(result.excludedNotCheckedIn.map((c) => c.id)).toEqual(['p2'])
  })

  it('excludes an unchecked speaker by default', () => {
    const result = selectCertificateCandidates(ROSTER, { type: 'SPEAKER' })
    expect(result.eligible.map((c) => c.id)).toEqual(['s1'])
    expect(result.excludedNotCheckedIn.map((c) => c.id)).toEqual(['s2'])
  })

  it('never mixes participants and speakers', () => {
    const participants = selectCertificateCandidates(ROSTER, { type: 'PARTICIPANT' })
    const speakers = selectCertificateCandidates(ROSTER, { type: 'SPEAKER' })

    const participantIds = participants.eligible.map((c) => c.id)
    const speakerIds = speakers.eligible.map((c) => c.id)

    expect(participantIds.some((id) => speakerIds.includes(id))).toBe(false)
    expect(participants.eligible.every((c) => c.type === 'PARTICIPANT')).toBe(true)
    expect(speakers.eligible.every((c) => c.type === 'SPEAKER')).toBe(true)
  })

  it('treats every non-Speaker role as a participant', () => {
    // Guest and Judge are not speakers, whatever else they are.
    const result = selectCertificateCandidates(ROSTER, { type: 'PARTICIPANT' })
    expect(result.eligible.map((c) => c.role)).toContain('Guest')
  })

  it('reports the eligible count for the population, not the whole roster', () => {
    const speakers = selectCertificateCandidates(ROSTER, { type: 'SPEAKER' })
    expect(speakers.eligibleCount).toBe(1)
    expect(speakers.all).toHaveLength(2)
  })

  describe('explicit override', () => {
    it('lists everybody in the population when widened', () => {
      const result = selectCertificateCandidates(ROSTER, {
        type: 'PARTICIPANT',
        includeNotCheckedIn: true,
      })
      expect(result.eligible.map((c) => c.id)).toEqual(['p1', 'p2', 'p3'])
    })

    it('warns that an unchecked person is in the selection', () => {
      const result = selectCertificateCandidates(ROSTER, {
        type: 'PARTICIPANT',
        includeNotCheckedIn: true,
      })
      expect(result.includesUnchecked).toBe(true)
    })

    it('does not warn when nobody unchecked is included', () => {
      const checkedInOnly: CertificateCandidate[] = ROSTER.filter((c) => c.checkedIn)
      const result = selectCertificateCandidates(checkedInOnly, {
        type: 'PARTICIPANT',
        includeNotCheckedIn: true,
      })
      expect(result.includesUnchecked).toBe(false)
    })

    it('still reports the checked-in count when widened', () => {
      const result = selectCertificateCandidates(ROSTER, {
        type: 'SPEAKER',
        includeNotCheckedIn: true,
      })
      // 2 speakers exist, only 1 attended. The override must not inflate this.
      expect(result.eligibleCount).toBe(1)
    })
  })

  it('returns nothing for an empty roster', () => {
    const result = selectCertificateCandidates([], { type: 'PARTICIPANT' })
    expect(result.eligible).toEqual([])
    expect(result.eligibleCount).toBe(0)
    expect(result.includesUnchecked).toBe(false)
  })
})

describe('reconcileSelection', () => {
  const eligible = [person('p1', 'Student', true), person('p3', 'Student', true)]

  it('keeps ids that are eligible', () => {
    expect(reconcileSelection(['p1', 'p3'], eligible)).toEqual({ ids: ['p1', 'p3'], dropped: [] })
  })

  it('drops an id that is not eligible', () => {
    const result = reconcileSelection(['p1', 'p2'], eligible)
    expect(result.ids).toEqual(['p1'])
    expect(result.dropped).toEqual(['p2'])
  })

  it('drops an unchecked person even if the id is submitted directly', () => {
    // The UI cannot produce this, but a crafted request can.
    const result = reconcileSelection(['s1'], eligible)
    expect(result.ids).toEqual([])
    expect(result.dropped).toEqual(['s1'])
  })

  it('removes duplicate ids', () => {
    expect(reconcileSelection(['p1', 'p1', 'p3'], eligible).ids).toEqual(['p1', 'p3'])
  })

  it('preserves the caller order', () => {
    expect(reconcileSelection(['p3', 'p1'], eligible).ids).toEqual(['p3', 'p1'])
  })

  it('handles an empty selection', () => {
    expect(reconcileSelection([], eligible)).toEqual({ ids: [], dropped: [] })
  })
})

describe('isAlreadyIssued', () => {
  const issued = [
    {
      participantId: 'p1',
      certificateType: 'Participation',
      issuedAt: 'x',
      verificationToken: 't',
    },
  ]

  it('is true for the same person and type', () => {
    expect(isAlreadyIssued(issued, person('p1', 'Student', true), 'Participation')).toBe(true)
  })

  it('is false for a different type', () => {
    expect(isAlreadyIssued(issued, person('p1', 'Student', true), 'Appreciation')).toBe(false)
  })

  it('is false for a different person', () => {
    expect(isAlreadyIssued(issued, person('p9', 'Student', true), 'Participation')).toBe(false)
  })
})
