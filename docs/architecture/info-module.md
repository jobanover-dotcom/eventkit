# Info Module

> Schedule, map & venue, and rules — the pages a participant actually reads.

Three public pages, no login, reachable from the public event page. They exist
because a participant standing at the venue with their phone needs three
answers: what is on, where do I go, and what are the rules.

| Route                        | Reads                                            | Owner-only control        |
| ---------------------------- | ------------------------------------------------ | ------------------------- |
| `/events/[eventId]/schedule` | `schedules`                                      | Add a programme item      |
| `/events/[eventId]/map`      | `events.venue`, `events.map_url`, `event-assets` | Upload or replace the map |
| `/events/[eventId]/rules`    | `rules`                                          | Add a rule                |

**No migration and no new table.** `schedules`, `rules`, `events.map_url`, and
the `event-assets` bucket all shipped in the initial migration.

## The route-pattern trap

`/schedule` and `/rules` were originally listed in `ORGANIZER_SECTION_PATTERN`
in `src/lib/auth/routes.ts`, because they were assumed to be organizer pages.
That pattern is what the proxy uses to decide whether to bounce a visitor to
`/login`. Left as it was, **every participant would have been redirected before
the page rendered** — the module would have looked fine and been completely
unusable for its only audience.

Both sections are now absent from the pattern, and `map` was never added.
`routes.test.ts` pins this: the three Info paths are asserted to be _public_, so
a future change cannot quietly re-guard them.

`/map` needs no entry anywhere, because "not guarded" is the correct state for
all three.

## What the schema actually supports

Worth knowing before extending these pages, because the columns are narrower
than the UI implies:

- **`schedules` has no date column.** Only `start_time` and `end_time`, so an
  event is a single day and there is nothing to group by date. Items are
  therefore ordered `start_time, sort_order, created_at`: chronological, which
  is what a participant needs, with `sort_order` breaking ties between items
  starting together.
- **`schedules` has a per-item `location`**, separate from the event's venue, so
  "Opening ceremony" can say Main hall while the event says Gymnasium.
- **`rules.content` is plain text**, capped at 4000 characters, rendered with
  `whitespace-pre-wrap`. No markdown and no HTML — the column is text, and
  pretending otherwise would mean sanitizing input just to render it.
- **`events` already has `map_url`**, unused until now.

Both tables grant `select` to `anon` under a `*_select_visible` policy keyed on
`registration_open OR owner`, so a closed event returns nothing and the page
404s. That is deliberate: a participant on a stale link must not be told "no
schedule has been published yet", which reads as a fact about the event rather
than a link that no longer works. `getPublicSchedule` and friends load the event
through `getPublicEvent` first, so an unknown event raises `NOT_FOUND` instead of
rendering an empty list.

## Authoring is add-only, and authorized server-side

Each Info page renders its form only when `getPublicEvent` reports
`isOrganizer`. **That is a courtesy, not the control.** The Server Action
independently runs `requireOrganizer()` → `selectOwnedEvent(eventId, organizerId)`
before it writes, so changing the URL or forging a payload accomplishes nothing.
The e2e suite proves this by asserting the forms are absent for a stranger and
that another organizer's event still shows only its own items.

There is no edit, no delete, and no reordering, and no `/manage` route. The
scope is "an organizer can fill this in five minutes before an event", not a
content management system.

## The venue map

No tiles, no geolocation, no directions API, no map provider. A photograph or
floor plan is what a school event actually has, and it works with no network, no
API key, and no third party.

The upload reuses the `event-assets` bucket, which is already `public: true` —
so participants can fetch the object with no session and **no SELECT policy is
needed**. Its write policies already require the first path segment to be the
caller's uid, which is why the object is written as
`{organizer_id}/{event_id}/{uuid}.{ext}`: the storage policy then acts as a real
second check instead of a bypassed one.

The upload goes through the organizer's own session, never a service-role key.
Both the 5 MB limit and the four accepted types mirror the bucket, are checked
in the browser for a fast message, and are **checked again on the server**, where
`createImageBitmap` confirms the bytes really are an image before they reach
storage. A renamed script cannot be published under an image URL.

The public URL is written to `events.map_url`. Replacing a map deletes the
previous object, best effort, and the path is re-derived from the stored URL and
checked against the organizer's own prefix first — so a hand-edited `map_url`
pointing at somebody else's object can never turn a replace into a delete of
another organizer's file.

## Tests

Split the way the repository already splits responsibility:

- **Vitest** — the comparators, slot grouping, and both zod schemas. The schemas
  mirror the table CHECK constraints, so this is where "invalid data is
  rejected" is actually proven; the table itself is not reachable from a unit
  test.
- **pgTAP** — already proves the RLS layer for both tables: owner can insert,
  `anon` can read, `anon` cannot insert. Not duplicated.
- **Playwright (live)** — the real authorization proof: the owner fills the
  pages, an anonymous context reads all three, a stranger sees no controls, and a
  second event's item never appears on the first.

## Known limitations

- **Add-only.** An organizer cannot correct a typo in a schedule item or a rule;
  they add a corrected one. A real fix means an edit control per row.
- **No ordering control in the UI.** `sort_order` is assigned automatically as
  "highest + 1", so the author cannot place an item out of chronological order.
- **No rich text in rules.** A list reads as a wall of prose.
- **Deleting an event does not delete its map.** The storage object is orphaned;
  only a _replaced_ map is cleaned up.
- **`schedules` cannot span multiple days**, so a two-day event would need two
  events or a schema change.
- The map is served at its original size. Supabase's image transformation is
  available but plan-dependent, so relying on it would be fragile.
