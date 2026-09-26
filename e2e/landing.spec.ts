import { expect, test } from '@playwright/test'

test('landing page explains the product and links to event creation', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /Create an event once/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create your event' })).toBeVisible()
})

test('landing page renders the three toolkit areas', async ({ page }) => {
  await page.goto('/')

  for (const area of ['Design', 'Attendance', 'Info']) {
    await expect(page.getByRole('heading', { name: area, exact: true })).toBeVisible()
  }
})

test('unknown routes render the not found page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: /couldn't find that page/i })).toBeVisible()
})
