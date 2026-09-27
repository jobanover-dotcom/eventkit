import { describe, expect, it } from 'vitest'
import { readBootstrappedTheme, themeBootstrapScript } from './ThemeScript'
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from '@/lib/theme'

/**
 * The no-flash script.
 *
 * Two things are being protected here. First, the script has to *run*: it is
 * executed by the browser as plain text, so a mistake is invisible to the
 * TypeScript compiler and shows up only as a flash of the wrong theme. Second,
 * it has to stay in step with the provider, which is why its constants are
 * interpolated rather than written by hand.
 *
 * The regression this file exists for: an earlier version was rendered from a
 * Client Component, which React 19 refuses to execute and reports as an error.
 */

describe('themeBootstrapScript', () => {
  const source = themeBootstrapScript()

  it('is a self-invoking expression', () => {
    expect(source.trimEnd().endsWith(');')).toBe(true)
    expect(source).toMatch(/^\(function/)
  })

  it('receives the shared storage key and theme list', () => {
    // Interpolated from lib/theme, so a renamed key cannot leave the script
    // reading a different key from the provider.
    expect(source).toContain(JSON.stringify(THEME_STORAGE_KEY))
    expect(source).toContain(JSON.stringify(THEMES))
    expect(source).toContain(JSON.stringify(DEFAULT_THEME))
  })

  it('reads the persisted preference', () => {
    expect(source).toContain('localStorage.getItem')
  })

  it('reads the OS preference rather than hardcoding a theme', () => {
    expect(source).toContain('prefers-color-scheme: dark')
  })

  it('applies a class to the document element', () => {
    expect(source).toContain('classList.add')
    expect(source).toContain('classList.remove')
  })

  it('sets color-scheme so native widgets match', () => {
    expect(source).toContain('colorScheme')
  })

  it('tolerates localStorage throwing', () => {
    // A thrown getItem would abort the whole script and leave no class at all,
    // which is worse than falling back to the OS preference.
    expect(source).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/)
  })

  it('publishes its decision for the provider to adopt', () => {
    expect(source).toContain('__theme')
  })

  it('is valid JavaScript', () => {
    // Parsed rather than pattern-matched, so a syntax error cannot ship.
    expect(() => new Function(`return ${source.replace(/;$/, '')}`)).not.toThrow()
  })
})

describe('readBootstrappedTheme', () => {
  it('returns null when the script has not run', () => {
    delete (window as unknown as Record<string, unknown>).__theme
    expect(readBootstrappedTheme()).toBeNull()
  })

  it('returns null for a malformed value', () => {
    const win = window as unknown as Record<string, unknown>
    win.__theme = 'not an object'
    expect(readBootstrappedTheme()).toBeNull()

    win.__theme = { preference: 1 }
    expect(readBootstrappedTheme()).toBeNull()

    win.__theme = {}
    expect(readBootstrappedTheme()).toBeNull()

    delete win.__theme
  })

  it('returns the decision the script made', () => {
    const win = window as unknown as Record<string, unknown>
    win.__theme = { preference: 'system', resolved: 'dark' }

    expect(readBootstrappedTheme()).toEqual({ preference: 'system', resolved: 'dark' })

    delete win.__theme
  })
})
