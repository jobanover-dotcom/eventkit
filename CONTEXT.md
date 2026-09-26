# CONTEXT.md

## Project

**Name:** EventKit
**Description:** a simple event organizer system for school and campus events
**Stack:** nextjs-supabase
**Styling:** TAILWIND
**Compatibility profile:** 2026.09
**Year:** 2026

## Goals

An organizer creates an event **once** and reuses its name, date, venue, and
branding everywhere: badges, certificates, posters, photo frames, and the
participant page. Participants register from a public link, receive a unique QR
code, get scanned at the door, and read the schedule, venue, and rules from their
phone.

The product is deliberately a **small set of screens that work**, not an event
management platform. It ships for a four-day development competition, so working
features, clean UI, mobile responsiveness, and a reliable demo path outrank
breadth.

### The demo path this build is optimised for

Organizer logs in → creates an event → adds schedule and rules → opens
registration → a student registers → the student receives a QR code → the
organizer scans it on a phone → attendance goes 0 → 1 → the organizer generates
a badge and a certificate → the student opens the event page and sees their pass,
schedule, map, and rules.

## Key Decisions

| Decision                               | Choice                                                                                                           | Why                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Route collision on `/events/[eventId]` | Public page at `/events/[eventId]`, organizer dashboard at `/events/[eventId]/dashboard`                         | §23 lists both; the public page must be reachable without a session                     |
| Server Action library                  | Plain `'use server'` actions plus a hand-rolled `ActionResult<T>`                                                | One fewer dependency; the error contract is ~40 lines and fully typed                   |
| Server state                           | Server Components with `searchParams`; no TanStack Query, no nuqs                                                | Attendance search and filtering are shareable URLs with no client cache needed          |
| QR payload                             | The 256-bit `qr_token` alone, no event id, no PII                                                                | Denser, more scannable code; the event is verified server-side in the same lookup       |
| `qr_token` generation                  | Column `DEFAULT` of two `gen_random_uuid()` values                                                               | The database mints it, so an anonymous registrant cannot pick a guessable token         |
| Participant privacy                    | `anon` holds **no** grant on `participants`; the pass page uses a `SECURITY DEFINER` function gated on the token | Prevents enumerating other people's names, emails, and student ids through the REST API |
| Registration                           | A `SECURITY DEFINER` function, not a client insert                                                               | Keeps `anon` write-free on the table and centralises validation                         |
| Certificate rule                       | Attendance is required, enforced by an RLS `WITH CHECK`                                                          | §15 forbids certifying non-attendees; the guard belongs in the data policy, not the UI  |
| Check-in idempotency                   | `UNIQUE (event_id, participant_id)` + `ON CONFLICT DO NOTHING`                                                   | Duplicates are impossible at the storage layer, not just in application code            |
| Templates                              | 15 rows seeded by the migration, read-only to clients                                                            | No template admin UI to build or demo                                                   |
| Generators                             | Canvas draw functions → PNG → jsPDF for PDF                                                                      | One uniform pipeline for all four material types, testable without a browser            |
| Fonts                                  | `@fontsource-variable/*` bundled through npm                                                                     | Builds never depend on fetching Google Fonts                                            |
| QR library import                      | `await import('qrcode')` inside a Client Component                                                               | Keeps the encoder out of the shared bundle                                              |

## Out of Scope

Payments, chat, complex ticketing, email marketing, AI features, advanced
analytics, role/permission systems, native mobile apps, realtime multiplayer,
drag-and-drop design editors, participant accounts, map pin editing, bulk ZIP
export, and the Event Pack download.

## Notes

- `docs/architecture/database-schema.md` is the table-by-table reference.
- `docs/architecture/auth-flow.md` covers sessions and the bearer-link caveat.
- `docs/api/errors.md` is the error code registry.
- Verification: `npm run check` (format, lint, typecheck, tests) plus
  `npm run build` and `npm run test:e2e`. Database behavior is covered by pgTAP
  in `supabase/tests/`.
- The organizer dashboard is mobile-first because check-in happens on a phone.

## Expected Concerns (advisory)

- validation
- query
- state
- env
- url-state
- safe-action
- dark-mode
