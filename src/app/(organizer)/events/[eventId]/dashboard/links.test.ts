import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every card on the event dashboard must point at a route that exists.
 *
 * This reads the page's source rather than rendering it, because the failure it
 * guards is structural: a typo in a template literal, or a section that was
 * renamed without its link, produces a card that leads nowhere and costs a
 * browser round trip to discover. A build-time check is the right weight for
 * that, and it needs no database.
 *
 * The live E2E suite separately proves each of these routes returns 200 for a
 * signed-in organizer, which is the half a static check cannot see.
 */

const PAGE = 'src/app/(organizer)/events/[eventId]/dashboard/page.tsx'
const ORGANIZER = 'src/app/(organizer)/events/[eventId]'
const MARKETING = 'src/app/(marketing)/events/[eventId]'

type Card = { label: string; href: string; ready: boolean }

function readCards(): Card[] {
  const source = readFileSync(resolve(PAGE), 'utf8')
  const cards: Card[] = []

  // Each item is a block of the form
  //   label: 'Badge',
  //   detail: '...',
  //   href: `${base}/design/badge`,
  //   icon: IdCard,
  //   ready: false,
  // with optional `//` comments between the fields.
  const block = /label:\s*'([^']+)',([\s\S]*?)ready:\s*(true|false)/g
  let match: RegExpExecArray | null
  while ((match = block.exec(source)) !== null) {
    const [, label, middle, ready] = match
    const href = /href:\s*(?:`\$\{base\}([^`]*)`|`\$\{base\}`|base)/.exec(middle as string)
    if (!href) continue
    cards.push({
      label: label as string,
      href: href[1] ? (href[1] as string) : '/',
      ready: ready === 'true',
    })
  }

  return cards
}

const cards = readCards()

describe('the event dashboard', () => {
  it('parses every card out of the page', () => {
    // Guards the parser itself: if this drops, the assertions below pass
    // vacuously, which is the exact failure mode a source-reading test has.
    expect(cards.length).toBe(12)
  })

  it('has a label and a destination for every card', () => {
    for (const card of cards) {
      expect(card.label, 'a card has no label').toBeTruthy()
      expect(card.href, `${card.label} has no href`).toBeTruthy()
      expect(card.href.startsWith('/'), `${card.label} href is not a path`).toBe(true)
    }
  })

  it('points every card at a route that exists', () => {
    const dead: string[] = []

    for (const card of cards) {
      const relative = card.href === '/' ? 'page.tsx' : `${card.href.replace(/^\//, '')}/page.tsx`
      const organizerPage = resolve(ORGANIZER, relative)
      const publicPage = resolve(MARKETING, relative)

      if (!existsSync(organizerPage) && !existsSync(publicPage)) {
        dead.push(`${card.label} -> ${card.href}`)
      }
    }

    expect(dead, `cards with no page file:\n${dead.join('\n')}`).toEqual([])
  })

  it('does not mark a card live when its route is missing', () => {
    // The two failures compound: an inert card hides a broken link instead of
    // reporting it, so this is asserted separately.
    for (const card of cards) {
      if (!card.ready) continue
      const relative = card.href === '/' ? 'page.tsx' : `${card.href.replace(/^\//, '')}/page.tsx`
      const exists =
        existsSync(resolve(ORGANIZER, relative)) || existsSync(resolve(MARKETING, relative))
      expect(exists, `${card.label} is marked live but ${card.href} has no page`).toBe(true)
    }
  })

  it('sends the venue card to the venue map, not to the rules', () => {
    // Both cards used to link to /rules, which is a wrong page rather than a
    // missing one, so no status check would ever have caught it.
    const map = cards.find((card) => card.label === 'Map & venue')
    expect(map?.href).toBe('/map')
  })

  it('links Info cards to their own pages', () => {
    const href = (label: string) => cards.find((card) => card.label === label)?.href
    expect(href('Schedule')).toBe('/schedule')
    expect(href('Map & venue')).toBe('/map')
    expect(href('Rules')).toBe('/rules')
    expect(href('Participant page')).toBe('/')
  })

  it('has every built section live', () => {
    // The dashboard previously advertised Design and Attendance as "coming next"
    // while both were fully built and reachable, which reads as lost work to
    // anyone opening the app.
    for (const label of [
      'Badge',
      'Certificate',
      'Poster',
      'Photo frame',
      'Participants',
      'Scan QR',
      'Attendance',
      'Schedule',
      'Map & venue',
      'Rules',
    ]) {
      const card = cards.find((entry) => entry.label === label)
      expect(card, `${label} is missing from the dashboard`).toBeDefined()
      expect(card?.ready, `${label} is not marked live`).toBe(true)
    }
  })
})
