import { describe, expect, it } from 'vitest'
import {
  MAX_TEMPLATE_BYTES,
  PLACEHOLDER_INSTRUCTIONS,
  saveTemplateConfigSchema,
  uploadTemplateSchema,
} from './customTemplate.schema'
import { PLACEHOLDER_HEX } from '@/features/design/lib/customTemplate/placeholder'

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222'

const RECT = { x: 100, y: 200, width: 600, height: 80 }

describe('uploadTemplateSchema', () => {
  it('accepts a template with a mapped placeholder', () => {
    const parsed = uploadTemplateSchema.safeParse({
      eventId: EVENT_ID,
      kind: 'certificate',
      name: 'Conference blue',
      placeholders: [{ ...RECT, field: 'recipient_name' }],
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts an unmapped placeholder, because a template can be saved before it is finished', () => {
    const parsed = uploadTemplateSchema.safeParse({
      eventId: EVENT_ID,
      kind: 'certificate',
      name: 'Work in progress',
      placeholders: [{ ...RECT, field: null }],
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a template with no placeholders at all', () => {
    const parsed = uploadTemplateSchema.safeParse({
      eventId: EVENT_ID,
      kind: 'poster',
      name: 'Plain poster',
      placeholders: [],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown field', () => {
    const parsed = uploadTemplateSchema.safeParse({
      eventId: EVENT_ID,
      kind: 'certificate',
      name: 'Bad',
      placeholders: [{ ...RECT, field: 'something_else' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an unknown design kind', () => {
    const parsed = uploadTemplateSchema.safeParse({
      eventId: EVENT_ID,
      kind: 'invitation',
      name: 'Bad',
      placeholders: [],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a blank name', () => {
    expect(
      uploadTemplateSchema.safeParse({
        eventId: EVENT_ID,
        kind: 'badge',
        name: '  ',
        placeholders: [],
      }).success
    ).toBe(false)
  })

  it('rejects a name over the column limit', () => {
    expect(
      uploadTemplateSchema.safeParse({
        eventId: EVENT_ID,
        kind: 'badge',
        name: 'a'.repeat(81),
        placeholders: [],
      }).success
    ).toBe(false)
  })

  it('rejects negative coordinates', () => {
    const parsed = uploadTemplateSchema.safeParse({
      eventId: EVENT_ID,
      kind: 'certificate',
      name: 'Bad',
      placeholders: [{ ...RECT, x: -1, field: null }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a zero-width placeholder', () => {
    const parsed = uploadTemplateSchema.safeParse({
      eventId: EVENT_ID,
      kind: 'certificate',
      name: 'Bad',
      placeholders: [{ ...RECT, width: 0, field: null }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects more placeholders than a template can reasonably hold', () => {
    const placeholders = Array.from({ length: 65 }, () => ({ ...RECT, field: null }))
    const parsed = uploadTemplateSchema.safeParse({
      eventId: EVENT_ID,
      kind: 'certificate',
      name: 'Too many',
      placeholders,
    })
    expect(parsed.success).toBe(false)
  })

  it('mirrors the private bucket size limit', () => {
    expect(MAX_TEMPLATE_BYTES).toBe(5 * 1024 * 1024)
  })
})

describe('saveTemplateConfigSchema', () => {
  it('accepts a saved mapping', () => {
    const parsed = saveTemplateConfigSchema.safeParse({
      eventId: EVENT_ID,
      templateId: TEMPLATE_ID,
      placeholders: [
        { ...RECT, field: 'recipient_name' },
        { x: 100, y: 400, width: 200, height: 200, field: 'recipient_photo' },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a malformed template id', () => {
    const parsed = saveTemplateConfigSchema.safeParse({
      eventId: EVENT_ID,
      templateId: 'nope',
      placeholders: [],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('PLACEHOLDER_INSTRUCTIONS', () => {
  it('tells the organizer the exact colour to use', () => {
    expect(PLACEHOLDER_INSTRUCTIONS.join(' ')).toContain(PLACEHOLDER_HEX)
  })

  it('warns against using the colour as artwork', () => {
    expect(PLACEHOLDER_INSTRUCTIONS.join(' ')).toMatch(/only/i)
  })
})
