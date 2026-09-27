import { describe, expect, it } from 'vitest'
import { speakerSchema } from './speaker.schema'

/**
 * The speaker form is the only way to create a speaker, so its schema is a
 * security boundary as much as a validation one.
 *
 * The central property is what is *missing*: there is no `role` field, no
 * `participantType`, and no flag. A speaker is identified by the server, so no
 * payload — however crafted — can ask to be one.
 */

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

function input(overrides: Record<string, unknown> = {}) {
  return { eventId: VALID_UUID, name: 'Dr. Maria Santos', ...overrides }
}

describe('speakerSchema', () => {
  it('accepts a name with nothing else', () => {
    const parsed = speakerSchema.safeParse(input())
    expect(parsed.success).toBe(true)
  })

  it('normalizes blank optional fields to null', () => {
    const parsed = speakerSchema.parse(input({ email: '', organization: '', title: '' }))
    expect(parsed.email).toBeNull()
    expect(parsed.organization).toBeNull()
    expect(parsed.title).toBeNull()
  })

  it('trims whitespace', () => {
    const parsed = speakerSchema.parse(input({ name: '  Dr. Maria Santos  ' }))
    expect(parsed.name).toBe('Dr. Maria Santos')
  })

  it('keeps a real email, organization, and title', () => {
    const parsed = speakerSchema.parse(
      input({
        email: 'maria@example.com',
        organization: 'Assumption College of Davao',
        title: 'Keynote Speaker',
      })
    )
    expect(parsed.email).toBe('maria@example.com')
    expect(parsed.organization).toBe('Assumption College of Davao')
    expect(parsed.title).toBe('Keynote Speaker')
  })

  it('rejects a name that is only whitespace', () => {
    expect(speakerSchema.safeParse(input({ name: '   ' })).success).toBe(false)
  })

  it('rejects a name over the column limit', () => {
    expect(speakerSchema.safeParse(input({ name: 'a'.repeat(121) })).success).toBe(false)
  })

  it('rejects an organization over the column limit', () => {
    const parsed = speakerSchema.safeParse(input({ organization: 'a'.repeat(121) }))
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path[0]).toBe('organization')
  })

  it('rejects a title over the column limit', () => {
    expect(speakerSchema.safeParse(input({ title: 'a'.repeat(121) })).success).toBe(false)
  })

  it('rejects a malformed email', () => {
    for (const email of ['not-an-email', 'a@b', 'a b@example.com', '@example.com']) {
      expect(speakerSchema.safeParse(input({ email })).success).toBe(false)
    }
  })

  it('rejects a malformed event id', () => {
    expect(speakerSchema.safeParse(input({ eventId: 'nope' })).success).toBe(false)
  })

  describe('a client cannot ask to become a speaker', () => {
    it('has no role field, so role in the payload is simply ignored', () => {
      const parsed = speakerSchema.parse(input({ role: 'Speaker' }))
      // The key is not carried into the parsed output, so it cannot reach the
      // insert. The service hardcodes the role instead.
      expect('role' in parsed).toBe(false)
    })

    it('ignores participantType, isSpeaker, and qrToken', () => {
      const parsed = speakerSchema.parse(
        input({ participantType: 'SPEAKER', isSpeaker: true, qrToken: 'chosen-by-hand' })
      )
      expect('participantType' in parsed).toBe(false)
      expect('isSpeaker' in parsed).toBe(false)
      expect('qrToken' in parsed).toBe(false)
    })

    it('does not let a client choose the check-in token', () => {
      // The database mints `qr_token`, so even a stripped schema would not be
      // enough — but the schema must not tempt a caller into trying.
      const parsed = speakerSchema.parse(input({ qr_token: 'forged' }))
      expect('qr_token' in parsed).toBe(false)
    })
  })
})
