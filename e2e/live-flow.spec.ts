import { expect, test } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loadLocalEnv } from '../scripts/lib/env'

/**
 * End-to-end proof against the hosted Supabase project: sign up, log in,
 * create an event, see live attendance numbers, and confirm another organizer
 * cannot reach it.
 *
 * Skipped unless E2E_LIVE=1, because it writes to the real project. The
 * accounts it creates are deleted in afterAll.
 */
const LIVE = process.env.E2E_LIVE === '1'

const OWNER = {
  email: `e2e-owner-${Date.now()}@eventkit.test`,
  password: 'eventkit-e2e-password',
}
const STRANGER = {
  email: `e2e-stranger-${Date.now()}@eventkit.test`,
  password: 'eventkit-e2e-password',
}

function adminClient() {
  loadLocalEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars are not set')
  return createSupabaseClient(url, serviceKey, { auth: { persistSession: false } })
}

async function createConfirmedUser(email: string, password: string): Promise<string> {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create ${email}: ${error?.message}`)
  return data.user.id
}

async function deleteUser(id: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(id)
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
}

test.describe('live event creation', () => {
  test.skip(!LIVE, 'set E2E_LIVE=1 to run against the hosted project')

  let ownerId = ''
  let strangerId = ''
  let eventPath = ''

  test.beforeAll(async () => {
    ownerId = await createConfirmedUser(OWNER.email, OWNER.password)
    strangerId = await createConfirmedUser(STRANGER.email, STRANGER.password)
  })

  test.afterAll(async () => {
    if (ownerId) await deleteUser(ownerId)
    if (strangerId) await deleteUser(strangerId)
  })

  test('an organizer can register, log in, and create an event', async ({ page }) => {
    await signIn(page, OWNER.email, OWNER.password)
    await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()

    await page.getByRole('link', { name: 'Create event' }).first().click()
    await expect(page).toHaveURL(/\/events\/new/)

    await page.getByRole('textbox', { name: 'Event name' }).fill('E2E Smoke Event')
    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Created by the end-to-end suite.')
    await page.getByLabel('Date').fill('2026-11-05')
    await page.getByLabel('Start').fill('08:00')
    await page.getByLabel('End').fill('17:00')
    await page.getByRole('textbox', { name: 'Venue' }).fill('Assumption College')
    await page.getByRole('textbox', { name: 'Organizer' }).fill('BSIT Department')
    await page.getByRole('button', { name: 'Create event' }).click()

    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\/dashboard/, { timeout: 20_000 })
    eventPath = new URL(page.url()).pathname

    await expect(page.getByRole('heading', { name: 'E2E Smoke Event' })).toBeVisible()
    await expect(page.getByText('November 5, 2026')).toBeVisible()
    await expect(page.getByText('Registration open')).toBeVisible()

    // §7 headline numbers, all zero for a brand new event.
    for (const label of ['Participants', 'Checked in', 'Not checked in']) {
      const tile = page.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('..')
      await expect(tile.locator('dd')).toHaveText('0')
    }
  })

  test('the event is refused when the times are inverted', async ({ page }) => {
    await signIn(page, OWNER.email, OWNER.password)
    await page.goto('/events/new')

    await page.getByRole('textbox', { name: 'Event name' }).fill('Backwards Event')
    await page.getByLabel('Date').fill('2026-11-06')
    await page.getByLabel('Start').fill('17:00')
    await page.getByLabel('End').fill('08:00')
    await page.getByRole('textbox', { name: 'Venue' }).fill('Somewhere')
    await page.getByRole('textbox', { name: 'Organizer' }).fill('Dept')
    await page.getByRole('button', { name: 'Create event' }).click()

    await expect(page.getByText('The end time must be after the start time')).toBeVisible()
    await expect(page).toHaveURL(/\/events\/new/)
  })

  test('another organizer cannot open the event', async ({ page }) => {
    test.skip(!eventPath, 'requires the creation test to have run')

    await signIn(page, STRANGER.email, STRANGER.password)
    const response = await page.goto(eventPath)

    // Reported as not found rather than forbidden, so the page does not confirm
    // that somebody else's event exists.
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: /couldn't find that page/i })).toBeVisible()
  })

  test('the stranger event list is empty', async ({ page }) => {
    await signIn(page, STRANGER.email, STRANGER.password)
    await expect(page.getByRole('heading', { name: 'No events yet' })).toBeVisible()
  })
})
