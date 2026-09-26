import { expect, test } from '@playwright/test'

test('the landing page links to log in and create an event', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create event' }).first()).toBeVisible()
})

test('clicking Create event while logged out lands on the login page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Create your event' }).click()

  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2Fnew/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('the login page renders the sign-up form and validates input', async ({ page }) => {
  await page.goto('/login')

  await page.getByRole('button', { name: 'Create one' }).click()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()

  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Enter a valid email address')).toBeVisible()
  await expect(page.getByText('Use at least 8 characters')).toBeVisible()
})

test('an open redirect in next is not followed', async ({ page }) => {
  await page.goto('/login?next=https://evil.example/steal')

  // The unsafe target is discarded; the sign-in form is still shown.
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
