'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { readBootstrappedTheme } from '@/components/shared/ThemeScript'
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
  type Theme,
  type ThemePreference,
} from '@/lib/theme'

/**
 * Theme state, without the script.
 *
 * The no-flash bootstrap is rendered by the server (see `ThemeScript`) because
 * React will not execute a client-rendered `<script>`. What remains here is the
 * part that genuinely needs React: the current preference, a setter, and the
 * listeners that keep the document in step with the OS and with other tabs.
 *
 * The public shape matches what the rest of the app expects from a theme hook —
 * `theme`, `resolvedTheme`, `setTheme`, `themes` — so a component reading
 * `useTheme()` needs to know nothing about how this is implemented.
 */

type ThemeContextValue = {
  /** The stored preference, which may be `system`. */
  theme: ThemePreference
  /** The concrete theme currently applied. */
  resolvedTheme: Theme
  setTheme: (preference: ThemePreference) => void
  themes: readonly Theme[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DARK_QUERY = '(prefers-color-scheme: dark)'

function readSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return systemTheme(window.matchMedia(DARK_QUERY))
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from what the bootstrap script decided when it ran, so the first
  // client render already agrees with the class it put on `<html>`. Falling back
  // to the stored preference keeps this working if the script was blocked.
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const bootstrapped = readBootstrappedTheme()
    if (bootstrapped && isThemePreference(bootstrapped.preference)) {
      return bootstrapped.preference
    }

    const stored = readStoredPreference(typeof window === 'undefined' ? null : window.localStorage)
    return isThemePreference(stored) ? stored : DEFAULT_THEME
  })

  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() => {
    const bootstrapped = readBootstrappedTheme()
    if (bootstrapped) {
      return bootstrapped.resolved === 'dark' ? 'dark' : 'light'
    }
    const stored = typeof window === 'undefined' ? null : readStoredPreference(window.localStorage)
    return resolveTheme(
      isThemePreference(stored) ? stored : DEFAULT_THEME,
      readSystemTheme() === 'dark'
    )
  })

  // Re-apply on the client. The server script has already set the class, so this
  // is a no-op in the normal case; it matters when the script could not run.
  useEffect(() => {
    applyTheme(document, resolvedTheme)
  }, [resolvedTheme])

  // Follow the OS while the preference is `system`.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => {
      setResolvedTheme((current) => {
        const next = readSystemTheme()
        // An explicit choice is not overridden by the OS.
        return theme === 'system' ? next : current
      })
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  // Keep other tabs of the same event in step.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return

      const next = isThemePreference(event.newValue) ? event.newValue : DEFAULT_THEME
      setThemeState(next)
      setResolvedTheme(resolveTheme(next, readSystemTheme() === 'dark'))
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((preference: ThemePreference) => {
    setThemeState(preference)
    const resolved = resolveTheme(preference, readSystemTheme() === 'dark')
    setResolvedTheme(resolved)
    applyTheme(document, resolved)
    writeStoredPreference(window.localStorage, preference)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, themes: THEMES }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider.')
  }
  return context
}
