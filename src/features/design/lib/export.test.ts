import { describe, expect, it } from 'vitest'
import { sanitizeFilename } from '@/features/design/lib/export'

/**
 * Download names are built from participant names, which arrive from a public
 * registration form. This is the boundary that keeps a crafted name from
 * turning into a path or a shell surprise.
 */
describe('sanitizeFilename', () => {
  it('keeps an ordinary name intact', () => {
    expect(sanitizeFilename('Maria Dela Cruz', 'png')).toBe('Maria Dela Cruz.png')
  })

  it('replaces path separators and reserved characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j', 'png')).toBe('a-b-c-d-e-f-g-h-i-j.png')
  })

  it('does not let a name escape into a directory', () => {
    const result = sanitizeFilename('../../etc/passwd', 'png')
    expect(result).not.toContain('/')
    expect(result).not.toContain('..')
  })

  it('strips control characters', () => {
    const result = sanitizeFilename(
      `bad${String.fromCharCode(0)}name${String.fromCharCode(7)}`,
      'png'
    )
    expect(result).toBe('badname.png')
  })

  it('collapses whitespace and trims the edges', () => {
    expect(sanitizeFilename('  spaced    out  ', 'png')).toBe('spaced out.png')
  })

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFilename('   ', 'png')).toBe('design.png')
    expect(sanitizeFilename('...', 'png')).toBe('design.png')
  })

  it('caps the length', () => {
    const result = sanitizeFilename('x'.repeat(500), 'png')
    expect(result.length).toBeLessThanOrEqual(84)
  })

  it('normalises the extension', () => {
    expect(sanitizeFilename('name', 'PNG')).toBe('name.png')
    expect(sanitizeFilename('name', '../exe')).toBe('name.exe')
  })

  it('never returns an empty extension', () => {
    expect(sanitizeFilename('name', '...')).toBe('name.png')
  })
})
