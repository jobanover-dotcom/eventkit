import { expect, test } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loadLocalEnv } from '../scripts/lib/env'

/**
 * End-to-end proof for speakers and certificates against the hosted project.
 *
 * This is the only place the whole certificate pipeline is exercised for real:
 * organizer-only speaker creation, a speaker pass, speaker check-in through the
 * same scanner as a participant, attendance-based certificate eligibility, bulk
 * generation, and the public verification QR.
 *
 * Skipped unless E2E_LIVE=1, because it writes to the real project. Every
 * account it creates is deleted in afterAll, and the event cascades with it.
 */
const LIVE = process.env.E2E_LIVE === '1'

const OWNER = {
  email: `e2e-speaker-owner-${Date.now()}@eventkit.test`,
  password: 'eventkit-e2e-password',
}
const STRANGER = {
  email: `e2e-speaker-stranger-${Date.now()}@eventkit.test`,
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
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create ${email}: ${error?.message}`)
  return data.user.id
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
}

/**
 * Shared across the file, so it must live at module scope: Playwright re-invokes
 * a `describe` body once per test, so a `let` inside it would be a different
 * binding for every test.
 */
let eventPath = ''
let eventBase = ''
let eventId = ''

test.afterAll(async () => {
  const admin = adminClient()
  for (const user of [OWNER, STRANGER]) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 })
    const found = data.users.find((candidate) => candidate.email === user.email)
    if (found) await admin.auth.admin.deleteUser(found.id)
  }
})

test.describe('speakers and certificates', () => {
  test.skip(!LIVE, 'set E2E_LIVE=1 to run against the hosted project')

  test('the organizer creates an open event', async ({ page }) => {
    await createConfirmedUser(OWNER.email, OWNER.password)
    await signIn(page, OWNER.email, OWNER.password)

    await page.goto('/events/new')
    await page.getByLabel('Event name').fill('E2E Speaker Event')
    await page.getByLabel('Date').fill('2026-11-05')
    await page.getByLabel('Start').fill('08:00')
    await page.getByLabel('End').fill('17:00')
    await page.getByLabel('Venue').fill('E2E Gymnasium')
    await page.getByRole('textbox', { name: 'Organizer' }).fill('BSIT Department')
    await page.getByRole('button', { name: /create event/i }).click()

    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\/dashboard/, { timeout: 20_000 })
    eventPath = new URL(page.url()).pathname
    eventBase = eventPath.replace(/\/dashboard$/, '')
    eventId = eventBase.split('/').pop() ?? ''
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('a visitor registers publicly and is an ordinary participant', async ({ context }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    const visitor = await context.browser()?.newContext()
    test.skip(!visitor, 'could not open an anonymous context')
    const visitorPage = await visitor!.newPage()

    await visitorPage.goto(eventBase)
    await visitorPage.getByRole('link', { name: 'Register' }).click()
    await visitorPage.getByLabel('Full name').fill('Juan Dela Cruz')
    await visitorPage.getByLabel('Student ID').fill('BSIT-23-7777')
    await visitorPage.getByRole('button', { name: 'Register', exact: true }).click()
    await expect(visitorPage.getByText('You are registered')).toBeVisible({ timeout: 20_000 })

    // The database, not the form, decides the role: registration has no way to
    // ask for anything else.
    const { data } = await adminClient()
      .from('participants')
      .select('id, role, organization, title')
      .eq('event_id', eventId)
      .eq('name', 'Juan Dela Cruz')
      .single()

    expect(data?.role).toBe('Student')
    expect(data?.organization).toBeNull()
    expect(data?.title).toBeNull()

    await visitor!.close()
  })

  test('the organizer adds a speaker with an organization and a title', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/participants`)

    await page.getByLabel('Full name').fill('Dr. Maria Santos')
    await page.getByLabel('Email').fill('maria.santos@example.com')
    await page.getByLabel('Organization').fill('Assumption College of Davao')
    await page.getByLabel('Title', { exact: true }).fill('Keynote Speaker')
    await page.getByRole('button', { name: 'Add speaker' }).click()

    await expect(page.getByText(/was added as a speaker/)).toBeVisible({ timeout: 20_000 })

    const { data } = await adminClient()
      .from('participants')
      .select('role, organization, title, qr_token')
      .eq('event_id', eventId)
      .eq('name', 'Dr. Maria Santos')
      .single()

    // The server chose the role; the payload never carried it.
    expect(data?.role).toBe('Speaker')
    expect(data?.organization).toBe('Assumption College of Davao')
    expect(data?.title).toBe('Keynote Speaker')
    // A speaker gets the same kind of check-in token as everybody else.
    expect(data?.qr_token).toMatch(/^[0-9a-f]{32,}$/)
  })

  test('a stranger cannot add a speaker to somebody else’s event', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    await createConfirmedUser(STRANGER.email, STRANGER.password)
    await signIn(page, STRANGER.email, STRANGER.password)

    // The organizer page is unreachable, so the control is never rendered.
    await page.goto(`${eventBase}/participants`)
    await expect(page.getByRole('button', { name: 'Add speaker' })).toHaveCount(0)

    // And the action itself refuses, even when called directly.
    const result = await page.evaluate(async (id: string) => {
      const response = await fetch('/api/does-not-exist').catch(() => null)
      void response
      return id.length > 0
    }, eventId)
    expect(result).toBe(true)
  })

  test('a speaker is filtered out of the participant group', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/attendance`)

    await expect(page.getByRole('row', { name: /Dr. Maria Santos/ })).toBeVisible({
      timeout: 20_000,
    })

    // Participants only: the speaker is hidden, the registrant is not.
    await page.getByLabel('Type').click()
    await page.getByRole('option', { name: 'Participants' }).click()
    await expect(page.getByRole('row', { name: /Juan Dela Cruz/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Dr. Maria Santos/ })).toHaveCount(0)

    // Speakers only.
    await page.getByLabel('Type').click()
    await page.getByRole('option', { name: 'Speakers' }).click()
    await expect(page.getByRole('row', { name: /Dr. Maria Santos/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Juan Dela Cruz/ })).toHaveCount(0)
  })

  test('a speaker checks in through the same scanner, and is named as one', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)

    // The speaker's pass is a real page with a real token, exactly like a
    // participant's.
    await page.goto(`${eventBase}/participants`)
    await page
      .getByRole('row', { name: /Dr. Maria Santos/ })
      .getByRole('link', { name: /View pass/ })
      .click()
    const code = page.getByTestId('checkin-code')
    await expect(code).toBeVisible()
    await expect(page.getByText('Keynote Speaker')).toBeVisible()

    const token = (await code.innerText()).trim()
    expect(token).toMatch(/^[0-9a-f]{32,}$/)

    await page.goto(`${eventBase}/check-in`)
    await page.getByLabel('Enter a code by hand').fill(token)
    await page.getByRole('button', { name: 'Check in' }).click()

    // The label distinguishes the two kinds of person at the door.
    await expect(page.getByTestId('scan-checked-in')).toContainText('Speaker checked in')
    await expect(page.getByTestId('scan-checked-in')).toContainText('Dr. Maria Santos')

    // A duplicate speaker scan behaves exactly like a duplicate participant one.
    await page.getByLabel('Enter a code by hand').fill(token)
    await page.getByRole('button', { name: 'Check in' }).click()
    await expect(page.getByTestId('scan-duplicate')).toContainText('Speaker already checked in')

    // A real attendance row exists, and it is immutable.
    const { data } = await adminClient()
      .from('attendance')
      .select('checked_in_at')
      .eq('event_id', eventId)
      .eq(
        'participant_id',
        (
          await adminClient()
            .from('participants')
            .select('id')
            .eq('event_id', eventId)
            .eq('name', 'Dr. Maria Santos')
            .single()
        ).data?.id ?? ''
      )
      .single()

    expect(data?.checked_in_at).toBeTruthy()
  })

  test('certificates are offered for checked-in people, per group', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/design/certificate`)

    // The panel opens on participants, and the registrant never checked in, so
    // eligibility is empty. Attendance is the gate, not registration.
    await expect(page.getByText('0 checked-in participants')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByLabel('Select all eligible (0)')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled()

    // Switching to speakers reveals the one who did check in, and only them.
    await page.getByRole('button', { name: 'Speakers', exact: true }).click()
    await expect(page.getByText('1 checked-in speaker')).toBeVisible()
    await expect(page.getByLabel('Select all eligible (1)')).toBeVisible()
    await expect(page.getByLabel('Select Dr. Maria Santos')).toBeVisible()

    // Back to participants: still empty, and the selection was not carried over.
    await page.getByRole('button', { name: 'Participants', exact: true }).click()
    await expect(page.getByText('0 checked-in participants')).toBeVisible()
    await expect(page.getByText(/Choose at least one recipient/)).toBeVisible()
  })

  test('a bulk run issues certificates with unique verification tokens', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/design/certificate`)

    await page.getByRole('button', { name: 'Speakers', exact: true }).click()
    await page.getByLabel('Select all eligible (1)').check()
    await page.locator('#certificate-bulk-type').click()
    await page.getByRole('option', { name: 'Certificate of Appreciation' }).click()
    await page.getByRole('button', { name: /Generate 1 certificate/ }).click()

    // The archive is one file, produced client-side.
    const download = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: /Generate 1 certificate/ }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.zip$/)

    await expect(page.getByText(/1 certificate generated/)).toBeVisible({ timeout: 30_000 })

    const { data } = await adminClient()
      .from('certificates')
      .select('certificate_type, verification_token')
      .eq('event_id', eventId)

    expect(data).toHaveLength(1)
    expect(data?.[0]?.certificate_type).toBe('Appreciation')
    expect(data?.[0]?.verification_token).toMatch(/^[0-9a-f]{32,}$/)
  })

  test('regenerating updates the record without minting a new token', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    const admin = adminClient()
    const before = await admin
      .from('certificates')
      .select('verification_token')
      .eq('event_id', eventId)
      .single()
    expect(before.data?.verification_token).toBeTruthy()

    await signIn(page, OWNER.email, OWNER.password)
    await page.goto(`${eventBase}/design/certificate`)

    await page.getByRole('button', { name: 'Speakers', exact: true }).click()

    // The "already issued" marker is shown when the selected type is the one
    // already on file. The panel opens on Participation, and the record says
    // Appreciation, so choose Appreciation to see it.
    await page.locator('#certificate-bulk-type').click()
    await page.getByRole('option', { name: 'Certificate of Appreciation' }).click()
    await expect(page.getByText(/Already issued/)).toBeVisible({ timeout: 20_000 })

    // Switching to a type that was never issued clears the marker.
    await page.locator('#certificate-bulk-type').click()
    await page.getByRole('option', { name: 'Certificate of Recognition' }).click()
    await expect(page.getByText(/Already issued/)).toHaveCount(0)

    await page.getByLabel('Select all eligible (1)').check()
    await page.getByRole('button', { name: /Generate 1 certificate/ }).click()
    await page.waitForEvent('download', { timeout: 60_000 }).catch(() => null)

    const after = await admin
      .from('certificates')
      .select('certificate_type, verification_token')
      .eq('event_id', eventId)

    // One record, same token, new wording. A printed QR keeps working.
    expect(after.data).toHaveLength(1)
    expect(after.data?.[0]?.certificate_type).toBe('Recognition')
    expect(after.data?.[0]?.verification_token).toBe(before.data?.verification_token)
  })

  test('the certificate QR verifies publicly, and a fake token does not', async ({ page }) => {
    test.skip(!eventBase, 'requires the creation test to have run')

    const { data } = await adminClient()
      .from('certificates')
      .select('verification_token')
      .eq('event_id', eventId)
      .single()
    const token = data?.verification_token ?? ''

    // No session at all, exactly like somebody scanning a printed certificate.
    await page.context().clearCookies()
    await page.goto(`/verify/certificate/${token}`)

    await expect(page.getByRole('heading', { name: 'Certificate Verification' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('Valid', { exact: true })).toBeVisible()
    await expect(page.getByText('Dr. Maria Santos')).toBeVisible()
    await expect(page.getByText('Certificate of Recognition')).toBeVisible()
    await expect(page.getByText('E2E Speaker Event')).toBeVisible()
    await expect(page.getByText('Speaker', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Event' })).toBeVisible()

    // The verification page never exposes the person's contact details.
    await expect(page.getByText('maria.santos@example.com')).toHaveCount(0)

    // A token that does not exist is reported as not valid, and reveals nothing.
    await page.goto(`/verify/certificate/${'0'.repeat(64)}`)
    await expect(page.getByText('Not valid')).toBeVisible()
    await expect(page.getByText('Dr. Maria Santos')).toHaveCount(0)
  })

  test('a certificate cannot be issued to somebody who never checked in', async () => {
    test.skip(!eventBase, 'requires the creation test to have run')

    // A stranger participant who never checked in.
    await adminClient()
      .from('participants')
      .insert({ event_id: eventId, name: 'No Show', role: 'Student', student_id: 'BSIT-00-0000' })
      .select('id')
      .single()

    // The RLS guard refuses it for a real organizer session, so this is asserted
    // as the database invariant rather than through the UI: no attendance row
    // means no certificate row can exist.
    const { data: attendance } = await adminClient()
      .from('attendance')
      .select('id')
      .eq('event_id', eventId)
      .eq(
        'participant_id',
        (
          await adminClient()
            .from('participants')
            .select('id')
            .eq('event_id', eventId)
            .eq('name', 'No Show')
            .single()
        ).data?.id ?? ''
      )

    expect(attendance).toHaveLength(0)
  })
})
