import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BADGE_ROLES,
  CERTIFICATE_PRESETS,
  CERTIFICATE_TYPES,
  DESIGN_KIND_META,
  POSTER_CONTENT_TYPES,
  POSTER_PRESETS,
  toBadgeRole,
} from '@/features/design/types'
import { templateCountFor } from '@/features/design/lib/templates'
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from '@/features/design/schemas/design.schema'

describe('toBadgeRole', () => {
  it.each([
    ['Speaker', 'Speaker'],
    ['Organizer', 'Organizer'],
    ['Staff', 'Staff'],
  ])('keeps %s as-is', (source, expected) => {
    expect(toBadgeRole(source)).toBe(expected)
  })

  it.each(['Student', 'Guest', 'Judge', 'student', '', 'Unknown'])(
    'reads %s as Participant, because a badge has no separate vocabulary for it',
    (source) => {
      expect(toBadgeRole(source)).toBe('Participant')
    }
  )
})

describe('certificate presets', () => {
  it('covers every supported certificate type', () => {
    for (const type of CERTIFICATE_TYPES) {
      expect(CERTIFICATE_PRESETS[type]).toBeDefined()
      expect(CERTIFICATE_PRESETS[type].title).toContain(type)
      expect(CERTIFICATE_PRESETS[type].recognition.length).toBeGreaterThan(0)
    }
  })

  it('offers exactly the certificate types the database accepts', () => {
    // The `certificates_certificate_type_check` constraint in
    // 20260926000002_speakers_and_certificates.sql is the authority. The UI list
    // drifted from it once already: Winner was in the constraint and in no
    // dropdown, so it was unreachable from the product.
    expect([...CERTIFICATE_TYPES].sort()).toEqual(
      ['Participation', 'Completion', 'Recognition', 'Appreciation', 'Achievement', 'Winner'].sort()
    )
  })

  it('reads its type list from the migration, so the two cannot drift again', () => {
    const migration = readFileSync(
      resolve('supabase/migrations/20260926000002_speakers_and_certificates.sql'),
      'utf8'
    )
    const check = migration.match(/check \(\s*certificate_type in \(([\s\S]*?)\)\s*\)/)?.[1]

    expect(check, 'the CHECK constraint was not found in the migration').toBeDefined()

    const sqlTypes = [...(check as string).matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect(sqlTypes.sort()).toEqual([...CERTIFICATE_TYPES].sort())
  })

  it('gives each type a distinct title', () => {
    const titles = CERTIFICATE_TYPES.map((type) => CERTIFICATE_PRESETS[type].title)
    expect(new Set(titles).size).toBe(titles.length)
  })
})

describe('poster presets', () => {
  it('covers every supported content type', () => {
    for (const type of POSTER_CONTENT_TYPES) {
      expect(POSTER_PRESETS[type].eyebrow.length).toBeGreaterThan(0)
      expect(POSTER_PRESETS[type].defaultMessage.length).toBeGreaterThan(0)
    }
  })

  it('has exactly announcement, reminder, and thank you', () => {
    expect([...POSTER_CONTENT_TYPES]).toEqual(['Announcement', 'Reminder', 'Thank You'])
  })
})

describe('badge roles', () => {
  it('has the four roles the scope asks for', () => {
    expect([...BADGE_ROLES]).toEqual(['Participant', 'Speaker', 'Organizer', 'Staff'])
  })
})

describe('design kind metadata', () => {
  it('has four kinds, each with a unique route slug', () => {
    expect(DESIGN_KIND_META).toHaveLength(4)
    const slugs = DESIGN_KIND_META.map((meta) => meta.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('maps every kind to a kind that actually has two templates', () => {
    for (const meta of DESIGN_KIND_META) {
      expect(templateCountFor(meta.kind)).toBe(2)
    }
  })
})

describe('validateImageFile', () => {
  const valid = { type: 'image/png', size: 1024, name: 'photo.png' }

  it('accepts an ordinary image', () => {
    expect(validateImageFile(valid)).toEqual({ accepted: true })
  })

  it.each(ACCEPTED_IMAGE_TYPES)('accepts %s', (type) => {
    expect(validateImageFile({ ...valid, type })).toEqual({ accepted: true })
  })

  it.each(['image/svg+xml', 'image/gif', 'application/pdf', 'text/html', ''])(
    'rejects %s',
    (type) => {
      const result = validateImageFile({ ...valid, type })
      expect(result.accepted).toBe(false)
      expect(result.accepted === false && result.reason).toMatch(/PNG, JPEG, or WebP/)
    }
  )

  it('rejects a file over the 5 MB bucket limit', () => {
    const result = validateImageFile({ ...valid, size: MAX_IMAGE_BYTES + 1 })
    expect(result.accepted).toBe(false)
    expect(result.accepted === false && result.reason).toMatch(/5 MB/)
  })

  it('accepts a file exactly at the limit', () => {
    expect(validateImageFile({ ...valid, size: MAX_IMAGE_BYTES })).toEqual({ accepted: true })
  })

  it('rejects an empty file', () => {
    const result = validateImageFile({ ...valid, size: 0 })
    expect(result.accepted).toBe(false)
  })

  it('rejects an image too small to frame', () => {
    const result = validateImageFile(valid, { width: 32, height: 32 })
    expect(result.accepted).toBe(false)
    expect(result.accepted === false && result.reason).toMatch(/too small/)
  })

  it('accepts a normally sized image when dimensions are known', () => {
    expect(validateImageFile(valid, { width: 1200, height: 1600 })).toEqual({ accepted: true })
  })
})
