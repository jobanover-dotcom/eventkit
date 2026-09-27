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

/**
 * Shared across the whole file, so it must live at module scope.
 *
 * Playwright re-invokes a `describe` body once per test to collect them, so a
 * `let` declared inside it is a *different* binding for every test. The event
 * path assigned in the first test would never reach the others, and each of them
 * would skip itself as "requires the creation test to have run".
 */
let ownerId = ''
let strangerId = ''
/** The event dashboard URL, e.g. `/events/<uuid>/dashboard`. */
let eventPath = ''
/** The event root, e.g. `/events/<uuid>`. Sections hang off this, not the dashboard. */
let eventBase = ''

/** A 1x1 PNG, enough to prove the encoder and storage accept a real image. */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** Storage objects created by a test, so the bucket is left as it was found. */
const uploadedMapPaths: string[] = []

function mapObjectPaths(publicUrl: string): string[] {
  const marker = '/object/public/event-assets/'
  const index = publicUrl.indexOf(marker)
  return index === -1 ? [] : [decodeURIComponent(publicUrl.slice(index + marker.length))]
}

test.describe('live event creation', () => {
  test.skip(!LIVE, 'set E2E_LIVE=1 to run against the hosted project')

  test.beforeAll(async () => {
    ownerId = await createConfirmedUser(OWNER.email, OWNER.password)
    strangerId = await createConfirmedUser(STRANGER.email, STRANGER.password)
  })

  test.afterAll(async () => {
    // Deleting a user cascades the event row but not its storage objects, so
    // anything the tests uploaded is removed explicitly.
    if (uploadedMapPaths.length > 0) {
      await adminClient().storage.from('event-assets').remove(uploadedMapPaths)
    }
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
    eventBase = eventPath.replace(/\/dashboard\/?$/, '')

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

  test('another organizer cannot open the design hub', async ({ page }) => {
    test.skip(!eventPath, 'requires the creation test to have run')

    await signIn(page, STRANGER.email, STRANGER.password)
    const designPath = `${eventBase}/design`
    const response = await page.goto(designPath)

    // The design routes authorize server-side, so a stranger gets the same
    // not-found as the event itself rather than an empty hub.
    expect(response?.status()).toBe(404)
  })

  test('the design hub lists the four design kinds', async ({ page }) => {
    test.skip(!eventPath, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/design`)

    for (const kind of ['Badge', 'Certificate', 'Poster', 'Photo Frame']) {
      await expect(page.getByRole('heading', { name: kind, exact: true })).toBeVisible()
    }
    // Counts come from the static catalogue, so they cannot drift.
    await expect(page.getByText('2 templates').first()).toBeVisible()
  })

  /**
   * The poster flow needs no participants, so this exercises the whole pipeline
   * in a real browser: canvas render, live preview, generate, and the download
   * buttons becoming available.
   */
  test('a poster renders, previews, and generates', async ({ page }) => {
    test.skip(!eventPath, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/design/poster`)

    await expect(page.getByRole('heading', { name: 'Posters' })).toBeVisible()

    // Generation is blocked until the form is valid, and the preview renders
    // regardless so the page is never blank.
    const downloadPng = page.getByRole('button', { name: 'Download PNG' })
    await expect(downloadPng).toBeDisabled()

    const preview = page.getByRole('img', { name: /Preview of the .* design/ })
    await expect(preview).toBeVisible({ timeout: 30_000 })
    // A real raster, not a placeholder.
    expect(await preview.getAttribute('src')).toMatch(/^data:image\/png;base64,/)

    await page.getByRole('button', { name: 'Generate' }).click()

    await expect(downloadPng).toBeEnabled({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled()
  })

  test('switching template changes the rendered preview', async ({ page }) => {
    test.skip(!eventPath, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/design/poster`)

    const preview = page.getByRole('img', { name: /Preview of the .* design/ })
    await expect(preview).toBeVisible({ timeout: 30_000 })
    const before = await preview.getAttribute('src')

    // The first template starts selected, so its button reads "Selected" and the
    // only "Use template" button belongs to the second one.
    await page.getByRole('button', { name: 'Use template' }).first().click()
    await expect(page.getByRole('img', { name: /Thank You design/ })).toBeVisible({
      timeout: 30_000,
    })

    // The template identity changes immediately, but the bitmap follows behind
    // the preview debounce, so poll rather than read once.
    await expect.poll(async () => preview.getAttribute('src'), { timeout: 30_000 }).not.toBe(before)
  })

  /**
   * The attendance loop, end to end, without touching the camera.
   *
   * A student registers on the public page and gets a QR; the organizer reads
   * that participant's pass to obtain the check-in code, then checks them in
   * through the scanner's manual fallback. That is the same server action the
   * camera path calls, so this covers the write, the duplicate guard, and the
   * attendance sheet without a camera simulation.
   */
  test('a registration can be checked in exactly once', async ({ page, context }) => {
    test.skip(!eventPath, 'requires the creation test to have run')

    const eventUrl = eventBase

    // A visitor registers on a public page, with no session at all.
    const visitor = await context.browser()?.newContext()
    test.skip(!visitor, 'could not open an anonymous context')
    const visitorPage = await visitor!.newPage()

    await visitorPage.goto(eventUrl)
    await expect(
      visitorPage.getByRole('heading', { name: 'E2E Smoke Event', exact: true })
    ).toBeVisible()

    await visitorPage.getByRole('link', { name: 'Register' }).click()
    await expect(visitorPage).toHaveURL(/\/events\/[0-9a-f-]+\/register/)

    await visitorPage.getByLabel('Full name').fill('Juan Dela Cruz')
    await visitorPage.getByLabel('Student ID').fill('BSIT-23-9999')
    await visitorPage.getByLabel('Year and section').fill('4B')
    await visitorPage.getByRole('button', { name: 'Register', exact: true }).click()

    // The pass is shown on the registrant's own phone, with a real QR. It is a
    // canvas, not an <img>, so there is no src to assert on.
    await expect(visitorPage.getByText('You are registered')).toBeVisible({ timeout: 20_000 })
    const visitorQr = visitorPage.getByRole('img', { name: /check-in/i })
    await expect(visitorQr).toBeVisible()

    // Ink on the canvas proves the encoder ran rather than leaving it blank.
    const inkPixels = await visitorQr.evaluate((node) => {
      const canvas = node as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return -1
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      let dark = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! < 128) dark += 1
      }
      return dark
    })
    expect(inkPixels).toBeGreaterThan(500)

    // The organizer sees them as not checked in.
    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/participants`)

    const row = page.getByRole('row', { name: /Juan Dela Cruz/ })
    await expect(row).toBeVisible({ timeout: 20_000 })
    await expect(row.getByText('Not checked in')).toBeVisible()

    // The pass page carries the code the manual fallback needs. Scoped to the
    // pass page's own element: `EventHeader` also renders a <code> with the event
    // path, which is present on the page we are navigating away from.
    await row.getByRole('link', { name: /View pass/ }).click()
    const code = page.getByTestId('checkin-code')
    await expect(code).toBeVisible()
    await expect(page).toHaveURL(/\/participants\/[0-9a-f-]+$/)

    const token = (await code.innerText()).trim()
    expect(token).toMatch(/^[0-9a-f]{32,}$/)

    // Check in, then confirm the duplicate is reported rather than re-written.
    await page.goto(`${eventBase}/check-in`)
    await page.getByLabel('Enter a code by hand').fill(token)
    await page.getByRole('button', { name: 'Check in' }).click()

    // The heading names which kind of person checked in, so an organizer at a
    // mixed door can tell a speaker from a registrant without reading further.
    await expect(page.getByTestId('scan-checked-in')).toContainText('Participant checked in')
    await expect(page.getByTestId('scan-checked-in')).toContainText('Juan Dela Cruz')

    await page.getByLabel('Enter a code by hand').fill(token)
    await page.getByRole('button', { name: 'Check in' }).click()
    await expect(page.getByTestId('scan-duplicate')).toContainText('Participant already checked in')

    // The attendance sheet reflects it.
    await page.goto(`${eventBase}/attendance`)
    const attendanceRow = page.getByRole('row', { name: /Juan Dela Cruz/ })
    await expect(attendanceRow).toContainText('Checked in')
    await expect(attendanceRow).not.toContainText('Not checked in')

    await visitor!.close()
  })

  test('an unknown QR code is rejected without a write', async ({ page }) => {
    test.skip(!eventPath, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/check-in`)

    // A well-formed token that matches nobody.
    await page.getByLabel('Enter a code by hand').fill('f'.repeat(64))
    await page.getByRole('button', { name: 'Check in' }).click()

    await expect(page.getByTestId('scan-rejected')).toContainText('Invalid QR code')
  })

  test('another organizer cannot open the attendance pages', async ({ page }) => {
    test.skip(!eventPath, 'requires the creation test to have run')

    await signIn(page, STRANGER.email, STRANGER.password)

    for (const section of ['participants', 'attendance', 'check-in']) {
      const response = await page.goto(`${eventBase}/${section}`)
      expect(response?.status(), `${section} should be not found`).toBe(404)
    }
  })

  /**
   * The participant-facing Info pages, end to end.
   *
   * The organizer fills the pages in, then a completely separate anonymous
   * context — no cookies, no session — reads all three. That is the actual
   * audience, and it is the only proof that the proxy is not intercepting these
   * routes. The owner-only forms are asserted to be absent for a visitor and
   * present for the organizer.
   */
  test('the Info pages are public and the owner can fill them', async ({ page, context }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    // --- the owner fills the pages in -------------------------------------
    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/schedule`)

    // Empty state first, so it is proven rather than assumed.
    await expect(page.getByText('No schedule has been published yet.')).toBeVisible()

    // Submitting empty proves the validation messages reach the organizer.
    await page.getByRole('button', { name: 'Add item' }).click()
    await expect(page.getByText('Give the activity a title')).toBeVisible()

    await page.getByLabel('Activity').fill('Opening ceremony')
    await page.getByLabel('Starts').fill('09:00')
    await page.getByLabel('Ends').fill('10:00')
    await page.getByLabel('Location').fill('Main hall')
    await page.getByRole('button', { name: 'Add item' }).click()
    await expect(page.getByRole('heading', { name: 'Opening ceremony' })).toBeVisible({
      timeout: 20_000,
    })

    await page.goto(`${eventBase}/rules`)
    await expect(page.getByText('No rules have been published yet.')).toBeVisible()
    await page.getByLabel('Title').fill('Attendance')
    await page.getByLabel('Rule').fill('Be at the venue by 7:30 AM.')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await expect(page.getByText('Be at the venue by 7:30 AM.')).toBeVisible({ timeout: 20_000 })

    // --- an anonymous visitor reads all three ------------------------------
    const visitor = await context.browser()?.newContext()
    test.skip(!visitor, 'could not open an anonymous context')
    const guest = await visitor!.newPage()

    await guest.goto(eventBase)
    for (const label of ['Schedule', 'Map & Venue', 'Rules']) {
      await expect(guest.getByRole('link', { name: new RegExp(label) })).toBeVisible()
    }

    await guest.goto(`${eventBase}/schedule`)
    await expect(guest.getByRole('heading', { name: 'Opening ceremony' })).toBeVisible()
    // The owner-only control must not exist for a participant.
    await expect(guest.getByRole('button', { name: 'Add item' })).toHaveCount(0)

    await guest.goto(`${eventBase}/rules`)
    await expect(guest.getByRole('heading', { name: 'Attendance' })).toBeVisible()
    await expect(guest.getByRole('button', { name: 'Add rule' })).toHaveCount(0)

    // --- the map, with a real upload --------------------------------------
    await page.goto(`${eventBase}/map`)
    await expect(page.getByText('No venue map has been uploaded yet.')).toBeVisible()

    await page.getByLabel('Map image').setInputFiles({
      name: 'venue.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG, 'base64'),
    })
    await page.getByRole('button', { name: 'Upload map' }).click()
    await expect(page.getByText('Map uploaded')).toBeVisible({ timeout: 30_000 })

    const mapImage = page.getByRole('img', { name: /Map of/ })
    await expect(mapImage).toBeVisible()
    const mapSrc = await mapImage.getAttribute('src')
    expect(mapSrc).toMatch(/\/storage\/v1\/object\/public\/event-assets\//)

    // A participant sees the same image, from the public bucket URL.
    await guest.goto(`${eventBase}/map`)
    await expect(guest.getByRole('img', { name: /Map of/ })).toBeVisible()
    await expect(guest.getByRole('button', { name: 'Upload map' })).toHaveCount(0)

    uploadedMapPaths.push(...(await mapObjectPaths(mapSrc as string)))

    await visitor!.close()
  })

  test('a stranger sees the pages but cannot author on them', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    await signIn(page, STRANGER.email, STRANGER.password)

    // Public read still works for an authenticated stranger.
    await page.goto(`${eventBase}/schedule`)
    await expect(page.getByRole('heading', { name: 'Opening ceremony' })).toBeVisible()

    // The owner-only controls are absent, so there is nothing to submit.
    for (const [section, button] of [
      ['schedule', 'Add item'],
      ['rules', 'Add rule'],
      ['map', 'Upload map'],
    ] as const) {
      await page.goto(`${eventBase}/${section}`)
      await expect(page.getByRole('button', { name: button })).toHaveCount(0)
    }
  })

  test('an event only ever shows its own schedule and rules', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    // A second event, owned by the same organizer and given one item of its own.
    await signIn(page, OWNER.email, OWNER.password)
    await page.goto('/events/new')

    await page.getByRole('textbox', { name: 'Event name' }).fill('Second Info Event')
    await page.getByLabel('Date').fill('2026-12-01')
    await page.getByLabel('Start').fill('09:00')
    await page.getByLabel('End').fill('10:00')
    await page.getByRole('textbox', { name: 'Venue' }).fill('Somewhere else')
    await page.getByRole('textbox', { name: 'Organizer' }).fill('BSIT Department')
    await page.getByRole('button', { name: 'Create event' }).click()
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\/dashboard/, { timeout: 20_000 })

    const otherBase = new URL(page.url()).pathname.replace(/\/dashboard\/?$/, '')

    await page.goto(`${otherBase}/schedule`)
    await page.getByLabel('Activity').fill('Second event item')
    await page.getByLabel('Starts').fill('14:00')
    await page.getByLabel('Ends').fill('15:00')
    await page.getByRole('button', { name: 'Add item' }).click()
    await expect(page.getByText('Second event item')).toBeVisible({ timeout: 20_000 })

    // The first event must not show the second event's item, in either direction.
    await page.goto(`${eventBase}/schedule`)
    await expect(page.getByRole('heading', { name: 'Opening ceremony' })).toBeVisible()
    await expect(page.getByText('Second event item')).toHaveCount(0)

    await page.goto(`${otherBase}/schedule`)
    await expect(page.getByRole('heading', { name: 'Second event item' })).toBeVisible()
    await expect(page.getByText('Opening ceremony')).toHaveCount(0)

    // The second event has its own venue, so the map page must not borrow the
    // first event's map.
    await page.goto(`${otherBase}/map`)
    await expect(page.getByText('No venue map has been uploaded yet.')).toBeVisible()
    await expect(page.getByRole('img', { name: /Map of/ })).toHaveCount(0)

    // There is no organizer delete UI, so the extra event is removed with the
    // service-role client. Cascades take its schedule rows with it.
    await adminClient().from('events').delete().eq('name', 'Second Info Event')
  })
})
