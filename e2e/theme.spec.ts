import { test, expect } from '@playwright/test'

/**
 * The bug this guards: React 19 refused to execute the theme script that a
 * Client Component rendered, logging "Encountered a script tag while rendering
 * React component" on every page load.
 */
test('renders no script-tag error and applies a theme class', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/login', { waitUntil: 'networkidle' })

  // No React script-tag complaint.
  const scriptErrors = errors.filter((e) =>
    /script tag while rendering|Scripts inside React components/i.test(e)
  )
  expect(scriptErrors, `console errors: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0)

  // The theme still applies — the script ran.
  const cls = await page.evaluate(() => document.documentElement.className)
  expect(cls).toContain('dark')
  const scheme = await page.evaluate(() => document.documentElement.style.colorScheme)
  expect(scheme).toBe('dark')

  // And it survives a client-side navigation, where the old version re-rendered.
  await page.goto('/', { waitUntil: 'networkidle' })
  const after = await page.evaluate(() => document.documentElement.className)
  expect(after).toContain('dark')
})

test('follows the light preference and honours a stored override', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/login', { waitUntil: 'networkidle' })
  expect(await page.evaluate(() => document.documentElement.className)).toContain('light')

  await page.evaluate(() => window.localStorage.setItem('theme', 'dark'))
  await page.goto('/login', { waitUntil: 'networkidle' })
  // An explicit stored choice wins over the emulated light OS preference.
  expect(await page.evaluate(() => document.documentElement.className)).toContain('dark')
})
