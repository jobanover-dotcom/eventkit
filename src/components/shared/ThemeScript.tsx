import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from '@/lib/theme'

/**
 * The no-flash theme bootstrap, rendered by the server.
 *
 * Why this is a Server Component and not part of the client provider: React 19
 * does not execute a `<script>` element produced while rendering on the client,
 * and reports it as an error ("Scripts inside React components are never
 * executed when rendering on the client"). A theme library that emits its
 * bootstrap from a Client Component therefore both fails and logs on every page
 * load.
 *
 * Rendering it from the server means it exists exactly once, in the initial HTML,
 * and runs before the body paints. That timing is the whole point: without it,
 * anyone using a dark theme gets a white flash while React hydrates.
 *
 * The script body is a string rather than JSX so it can be asserted in a test,
 * and its constants are interpolated from `lib/theme` rather than repeated, so
 * this script and the client provider cannot drift apart.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript() }} />
}

function bootstrap(storageKey: string, themes: readonly string[], defaultTheme: string): void {
  const root = document.documentElement

  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(storageKey)
  } catch {
    // Storage can be unavailable entirely; the system preference still applies.
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

  function resolve(preference: string): string {
    if (preference === 'light' || preference === 'dark') return preference
    return prefersDark ? 'dark' : 'light'
  }

  const preference =
    stored === 'light' || stored === 'dark' || stored === 'system' ? stored : defaultTheme
  const resolved = resolve(preference)

  for (const candidate of themes) root.classList.remove(candidate)
  root.classList.add(resolved)
  root.style.colorScheme = resolved

  // Handed to the client provider so it adopts the decision this script already
  // made, rather than recomputing one and risking a mismatch on the first paint.
  ;(window as unknown as Record<string, unknown>).__theme = { preference, resolved }
}

export function themeBootstrapScript(): string {
  const args = [
    JSON.stringify(THEME_STORAGE_KEY),
    JSON.stringify(THEMES),
    JSON.stringify(DEFAULT_THEME),
  ]
  return `(${bootstrap.toString()})(${args.join(', ')});`
}

export type BootstrappedTheme = { preference: string; resolved: string }

/**
 * Reads the value the bootstrap script left on `window`.
 *
 * Null on the server, and null before the script has run. The provider treats
 * that as "not decided yet" and applies the theme itself.
 */
export function readBootstrappedTheme(): BootstrappedTheme | null {
  if (typeof window === 'undefined') return null

  const value = (window as unknown as Record<string, unknown>).__theme
  if (!value || typeof value !== 'object') return null

  const { preference, resolved } = value as { preference?: unknown; resolved?: unknown }
  if (typeof preference !== 'string' || typeof resolved !== 'string') return null
  return { preference, resolved }
}
