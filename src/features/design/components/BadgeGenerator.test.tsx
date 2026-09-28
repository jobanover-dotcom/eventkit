import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_EVENT } from '@/features/design/lib/sampleData'
import { BADGE_TEMPLATES } from '@/features/design/lib/templates'
import type { ParticipantInfo } from '@/features/design/types'

/**
 * The badge generator with its new logo control and bulk run.
 *
 * The renderer itself is covered by `bulkBadges.test.ts` and the template suite;
 * what is specific here is the wiring: the logo control reaches the badge, the
 * single badge still works exactly as before, and the bulk run is driven from
 * deliberate choices rather than by accident.
 *
 * `DesignStudio` cannot rasterise in jsdom, so the preview degrades to the
 * template name — which is the behaviour under test anyway.
 */

const generateBadgesInBulk = vi.fn()
const downloadBadgeArchive = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/features/design/actions/eventLogo.action', () => ({
  setEventLogoAction: vi.fn(),
  clearEventLogoAction: vi.fn(),
}))
vi.mock('@/features/design/lib/bulkBadges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/design/lib/bulkBadges')>()
  return { ...actual, generateBadgesInBulk, downloadBadgeArchive }
})

const { BadgeGenerator } = await import('./BadgeGenerator')

afterEach(cleanup)

const EVENT_ID = '11111111-1111-4111-8111-111111111111'

function person(index: number, overrides: Partial<ParticipantInfo> = {}): ParticipantInfo {
  return {
    id: `p-${index}`,
    name: `Person ${index}`,
    code: `STU-${index}`,
    course: 'BSCS',
    yearSection: '3A',
    sourceRole: index === 1 ? 'Speaker' : 'Student',
    title: null,
    organization: null,
    qrToken: `qr-token-${index}`,
    checkedIn: index % 2 === 1,
    ...overrides,
  }
}

const PARTICIPANTS = [person(1), person(2), person(3)]

function renderBadgeGenerator(participants: readonly ParticipantInfo[] = PARTICIPANTS) {
  return render(
    <BadgeGenerator eventId={EVENT_ID} event={SAMPLE_EVENT} participants={participants} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  generateBadgesInBulk.mockResolvedValue({
    entries: [{ name: '001 Person 1.pdf', blob: new Blob(['a']) }],
    completed: 1,
    failed: [],
    filename: 'badges.zip',
  })
  downloadBadgeArchive.mockResolvedValue(undefined)
})

describe('BadgeGenerator logo control', () => {
  it('exposes the logo field', () => {
    renderBadgeGenerator()

    expect(screen.getByLabelText(/event logo/i)).toBeInTheDocument()
  })

  it('passes the event\u2019s existing logo to the control', () => {
    const logo = 'https://assets.example/logo.png'
    render(
      <BadgeGenerator
        eventId={EVENT_ID}
        event={{ ...SAMPLE_EVENT, logoUrl: logo }}
        participants={PARTICIPANTS}
      />
    )

    expect(screen.getByAltText(/event logo as it will appear/i)).toHaveAttribute('src', logo)
  })
})

describe('BadgeGenerator single badge', () => {
  it('keeps the single participant chooser', () => {
    renderBadgeGenerator()

    expect(screen.getByLabelText(/^participant$/i)).toBeInTheDocument()
  })

  it('keeps the badge role control', () => {
    renderBadgeGenerator()

    // The single badge's own control, distinct from the bulk run's "Role on every
    // badge" below it.
    expect(screen.getByLabelText(/^badge role$/i)).toBeInTheDocument()
  })

  it('still blocks generation until a participant is chosen', () => {
    renderBadgeGenerator()

    expect(screen.getByText(/choose a participant to generate their badge/i)).toBeInTheDocument()
  })
})

describe('BadgeGenerator bulk run', () => {
  it('offers a bulk run and every built-in template', () => {
    renderBadgeGenerator()

    expect(screen.getByText(/generate badges in bulk/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^badge template$/i)).toBeInTheDocument()
    BADGE_TEMPLATES.forEach((template) => {
      expect(screen.getAllByText(template.name).length).toBeGreaterThan(0)
    })
  })

  it('lists every participant and starts with none selected', () => {
    renderBadgeGenerator()

    PARTICIPANTS.forEach((participant) => {
      expect(screen.getByLabelText(`Select ${participant.name}`)).toBeInTheDocument()
    })
    expect(screen.getByTestId('badge-selected-count')).toHaveTextContent('0 participants selected')
  })

  it('will not generate with nobody selected', () => {
    renderBadgeGenerator()

    expect(screen.getByRole('button', { name: /^generate badges$/i })).toBeDisabled()
    expect(screen.getByText(/choose at least one participant/i)).toBeInTheDocument()
  })

  it('counts a single selection in the singular', () => {
    renderBadgeGenerator()

    fireEvent.click(screen.getByLabelText('Select Person 1'))

    expect(screen.getByTestId('badge-selected-count')).toHaveTextContent('1 participant selected')
  })

  it('selects and clears everyone through a deliberate control', () => {
    renderBadgeGenerator()

    fireEvent.click(screen.getByRole('button', { name: /select all 3/i }))
    expect(screen.getByTestId('badge-selected-count')).toHaveTextContent('3 participants selected')

    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }))
    expect(screen.getByTestId('badge-selected-count')).toHaveTextContent('0 participants selected')
  })

  it('generates one badge per selected participant, with a bulk run', async () => {
    renderBadgeGenerator()

    fireEvent.click(screen.getByLabelText('Select Person 1'))
    fireEvent.click(screen.getByLabelText('Select Person 3'))
    fireEvent.click(screen.getByRole('button', { name: /generate 2 badges/i }))

    await waitFor(() => expect(generateBadgesInBulk).toHaveBeenCalled())

    const options = generateBadgesInBulk.mock.calls[0]?.[0] as {
      targets: { participant: ParticipantInfo; role: string }[]
    }
    expect(options.targets.map((entry) => entry.participant.name)).toEqual(['Person 1', 'Person 3'])
  })

  it('gives each person their own registered role by default', async () => {
    renderBadgeGenerator()

    fireEvent.click(screen.getByRole('button', { name: /select all 3/i }))
    fireEvent.click(screen.getByRole('button', { name: /generate 3 badges/i }))

    await waitFor(() => expect(generateBadgesInBulk).toHaveBeenCalled())

    const options = generateBadgesInBulk.mock.calls[0]?.[0] as {
      targets: { participant: ParticipantInfo; role: string }[]
    }
    // Person 1 registered as a Speaker; the others read as Participant. A single
    // batch-wide role would mislabel the other two.
    expect(options.targets.find((t) => t.participant.name === 'Person 1')?.role).toBe('Speaker')
    expect(options.targets.find((t) => t.participant.name === 'Person 2')?.role).toBe('Participant')
  })

  it('downloads the archive only after a run that produced something', async () => {
    renderBadgeGenerator()

    fireEvent.click(screen.getByLabelText('Select Person 1'))
    fireEvent.click(screen.getByRole('button', { name: /generate 1 badge/i }))

    await waitFor(() => expect(downloadBadgeArchive).toHaveBeenCalledTimes(1))
  })

  it('reports a run that produced nothing, and offers no download', async () => {
    generateBadgesInBulk.mockResolvedValue({
      entries: [],
      completed: 0,
      failed: [{ name: 'Person 1', reason: 'This badge could not be rendered.' }],
      filename: 'badges.zip',
    })
    downloadBadgeArchive.mockRejectedValue(new Error('No badges could be generated.'))

    renderBadgeGenerator()
    fireEvent.click(screen.getByLabelText('Select Person 1'))
    fireEvent.click(screen.getByRole('button', { name: /generate 1 badge/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/no badges could be generated/i)
  })

  it('names the failures so an organizer knows whose badge is missing', async () => {
    generateBadgesInBulk.mockResolvedValue({
      entries: [{ name: '001 Person 1.pdf', blob: new Blob(['a']) }],
      completed: 1,
      failed: [{ name: 'Person 3', reason: 'This badge could not be rendered.' }],
      filename: 'badges.zip',
    })

    renderBadgeGenerator()
    fireEvent.click(screen.getByLabelText('Select Person 1'))
    fireEvent.click(screen.getByRole('button', { name: /generate 1 badge/i }))

    const failures = await screen.findByTestId('badge-bulk-failures')
    expect(within(failures).getByText(/Person 3/)).toBeInTheDocument()
  })

  it('shows progress while a run is under way', async () => {
    // An object holder rather than a `let`: a variable assigned inside a callback
    // narrows to `never` at the use site, which TypeScript is right to refuse.
    const run: { finish: (() => void) | null } = { finish: null }

    generateBadgesInBulk.mockImplementation(
      () =>
        new Promise((resolve) => {
          run.finish = () =>
            resolve({
              entries: [{ name: '001 Person 1.pdf', blob: new Blob(['a']) }],
              completed: 1,
              failed: [],
              filename: 'badges.zip',
            })
        })
    )

    renderBadgeGenerator()
    fireEvent.click(screen.getByLabelText('Select Person 1'))
    fireEvent.click(screen.getByRole('button', { name: /generate 1 badge/i }))

    const progress = await screen.findByTestId('badge-bulk-progress')
    expect(progress).toHaveTextContent(/0 \/ 1/)

    run.finish?.()
    await waitFor(() => expect(screen.queryByTestId('badge-bulk-progress')).not.toBeInTheDocument())
  })

  it('says so plainly when nobody has registered', () => {
    renderBadgeGenerator([])

    // Both the single chooser and the bulk list report the same fact; the bulk
    // one says there is nothing to generate.
    expect(screen.getAllByText(/nobody has registered/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/nothing to generate/i)).toBeInTheDocument()
    expect(screen.queryByTestId('badge-bulk-progress')).not.toBeInTheDocument()
  })

  it('never renders a participant\u2019s check-in token', () => {
    renderBadgeGenerator()

    const text = document.body.textContent ?? ''
    PARTICIPANTS.forEach((participant) => {
      expect(text).not.toContain(participant.qrToken)
    })
  })
})
