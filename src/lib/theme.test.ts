import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  applyTheme,
  isThemePreference,
  readStoredPreference,
  resolveTheme,
  systemTheme,
  writeStoredPreference,
} from './theme'

/**
 * The theme rules, asserted without a browser.
 *
 * The important one is that `system` is a *preference* and never a resolved
 * value. Every place that applies a class has to end up with `light` or `dark`,
 * because the stylesheet only has those two.
 */

describe('the storage key', () => {
  it('is unchanged from the previous library', () => {
    // Changing this would silently discard every saved preference.
    expect(THEME_STORAGE_KEY).toBe('theme')
  })
})

describe('isThemePreference', () => {
  it('accepts the two themes and system', () => {
    for (const value of ['light', 'dark', 'system']) {
      expect(isThemePreference(value)).toBe(true)
    }
  })

  it('rejects anything else, including near misses', () => {
    for (const value of ['', 'Dark', 'auto', 'LIGHT', null, undefined, 42, {}]) {
      expect(isThemePreference(value)).toBe(false)
    }
  })
})

describe('resolveTheme', () => {
  it('passes an explicit theme through unchanged', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('an explicit choice is not overridden by the OS', () => {
    // The whole point of choosing a theme: the machine's preference must not
    // win over it.
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('resolves system from the media query', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('falls back to the OS for an unrecognised value', () => {
    expect(resolveTheme('nonsense', true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
    expect(resolveTheme(undefined, true)).toBe('dark')
  })

  it('always resolves to one of the two real themes', () => {
    for (const value of ['light', 'dark', 'system', 'nonsense', null]) {
      for (const dark of [true, false]) {
        expect(THEMES).toContain(resolveTheme(value, dark))
      }
    }
  })
})

describe('systemTheme', () => {
  it('reads the media query', () => {
    expect(systemTheme({ matches: true })).toBe('dark')
    expect(systemTheme({ matches: false })).toBe('light')
  })

  it('defaults to light with no media query', () => {
    expect(systemTheme()).toBe('light')
  })
})

describe('applyTheme', () => {
  it('adds the class and sets color-scheme', () => {
    applyTheme(document, 'dark')

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('replaces the other class rather than stacking both', () => {
    applyTheme(document, 'dark')
    applyTheme(document, 'light')

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('leaves exactly one theme class applied', () => {
    for (const theme of THEMES) {
      applyTheme(document, theme)
      const applied = THEMES.filter((candidate) =>
        document.documentElement.classList.contains(candidate)
      )
      expect(applied).toEqual([theme])
    }
  })
})

describe('storage helpers', () => {
  it('reads a stored preference', () => {
    expect(readStoredPreference({ getItem: () => 'dark' })).toBe('dark')
  })

  it('treats a missing storage as no preference', () => {
    expect(readStoredPreference(null)).toBeNull()
  })

  it('survives storage throwing on read', () => {
    // Private browsing modes throw rather than return null.
    const storage = {
      getItem: () => {
        throw new Error('denied')
      },
    }
    expect(readStoredPreference(storage)).toBeNull()
  })

  it('writes a preference', () => {
    let written: string | null = null
    writeStoredPreference({ setItem: (_k, v) => (written = v) }, 'light')
    expect(written).toBe('light')
  })

  it('survives storage throwing on write', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(() => writeStoredPreference(storage, 'dark')).not.toThrow()
  })

  it('survives a null storage', () => {
    expect(() => writeStoredPreference(null, 'dark')).not.toThrow()
  })
})

describe('defaults', () => {
  it('follows the operating system by default', () => {
    expect(DEFAULT_THEME).toBe('system')
  })
})
