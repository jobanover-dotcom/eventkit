/**
 * Theme logic, kept pure and isomorphic.
 *
 * The client provider and the no-flash script both need the same rules: what the
 * preferred theme resolves to, and how to apply it. They are written once here so
 * the two cannot disagree, which is the bug that makes a page flash the wrong
 * colours on load.
 *
 * `THEME_STORAGE_KEY` is deliberately `theme`. It matches what the previous
 * `next-themes` dependency wrote, so anyone who already chose a theme keeps it
 * across this change.
 */

export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

/** `system` is a preference, not a resolved value. */
export type ThemePreference = Theme | 'system'

export const THEME_STORAGE_KEY = 'theme'

export const DEFAULT_THEME: ThemePreference = 'system'

/** Guard against a hand-edited or stale value in `localStorage`. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function systemTheme(media?: { matches: boolean }): Theme {
  return media?.matches ? 'dark' : 'light'
}

/**
 * Collapses a preference to a concrete theme.
 *
 * Anything unrecognised falls back to the system preference, so a corrupted
 * value can never leave the page with neither a light nor a dark class.
 */
export function resolveTheme(preference: unknown, prefersDark: boolean): Theme {
  if (preference === 'light' || preference === 'dark') return preference
  return prefersDark ? 'dark' : 'light'
}

/**
 * Applies a theme to the document element.
 *
 * Both the class and `color-scheme` are set. The class is what the stylesheet
 * keys off; `color-scheme` is what tells the browser to render native widgets
 * and form controls — scrollbars, date pickers — in the matching palette.
 */
export function applyTheme(doc: Document, theme: Theme): void {
  const root = doc.documentElement

  // Remove the whole set rather than the other one, so a theme list change does
  // not leave a stale class behind.
  for (const candidate of THEMES) root.classList.remove(candidate)
  root.classList.add(theme)

  root.style.colorScheme = theme
}

/**
 * Reads the stored preference, treating any failure as "no preference".
 *
 * `localStorage` throws outright in some privacy modes, and a theme is never
 * worth breaking a page over.
 */
export function readStoredPreference(storage: Pick<Storage, 'getItem'> | null): string | null {
  if (!storage) return null
  try {
    return storage.getItem(THEME_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeStoredPreference(
  storage: Pick<Storage, 'setItem'> | null,
  preference: ThemePreference
): void {
  if (!storage) return
  try {
    storage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // A theme that cannot be remembered is still applied for this page.
  }
}
