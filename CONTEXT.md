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
participant page. Participants register from a public link and **see their own QR
code on their phone straight away**, hold it up at the door, and read the
schedule, venue, and rules from the same device.

The product is deliberately a **small set of screens that work**, not an event
management platform. It ships for a four-day development competition, so working
features, clean UI, mobile responsiveness, and a reliable demo path outrank
breadth.

### The demo path this build is optimised for

Organizer logs in → creates an event → adds schedule items, rules, and a venue
map → opens registration → a student registers on the public page and their QR
code appears on their phone → the organizer adds a speaker, who gets the same
kind of pass → the organizer scans both codes on a phone, and the result says
which kind of person checked in → attendance goes 0 → 1 → the organizer
generates a badge, and certificates in bulk for the checked-in participants or
the checked-in speakers → each certificate carries a verification QR → the
student opens the event page and reads the schedule, the map, and the rules, and
anyone can scan a certificate to confirm it is real.

## Key Decisions

| Decision                                | Choice                                                                                                           | Why                                                                                                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route collision on `/events/[eventId]`  | Public page at `/events/[eventId]`, organizer dashboard at `/events/[eventId]/dashboard`                         | §23 lists both; the public page must be reachable without a session                                                                                                                                    |
| Server Action library                   | Plain `'use server'` actions plus a hand-rolled `ActionResult<T>`                                                | One fewer dependency; the error contract is ~40 lines and fully typed                                                                                                                                  |
| Server state                            | Server Components with `searchParams`; no TanStack Query, no nuqs                                                | Attendance search and filtering are shareable URLs with no client cache needed                                                                                                                         |
| QR payload                              | The 256-bit `qr_token` alone, no event id, no PII                                                                | Denser, more scannable code; the event is verified server-side in the same lookup                                                                                                                      |
| `qr_token` generation                   | Column `DEFAULT` of two `gen_random_uuid()` values                                                               | The database mints it, so an anonymous registrant cannot pick a guessable token                                                                                                                        |
| Participant privacy                     | `anon` holds **no** grant on `participants`; the pass page uses a `SECURITY DEFINER` function gated on the token | Prevents enumerating other people's names, emails, and student ids through the REST API                                                                                                                |
| Registration                            | A `SECURITY DEFINER` function, not a client insert                                                               | Keeps `anon` write-free on the table and centralises validation                                                                                                                                        |
| QR delivery                             | Shown on screen at registration; nothing is emailed                                                              | The token is a credential, so it never travels in a link or an inbox                                                                                                                                   |
| Check-in write                          | `upsert` with `ignoreDuplicates`, then read back the stored row                                                  | The unique index decides the outcome, so two phones scanning at once cannot double-write                                                                                                               |
| Roster filtering                        | Server-side over `searchParams`, one authorized read                                                             | The browser never holds rows it may not see, and a filtered view is shareable                                                                                                                          |
| Info pages (`schedule`, `map`, `rules`) | Public Server Components; `/schedule` and `/rules` are absent from the organizer route pattern                   | They are read by participants from a shared link, so the proxy must not intercept them                                                                                                                 |
| Info authoring                          | Owner-only add forms on those same public pages                                                                  | Enough to fill an event in before it happens, with no CMS and no `/manage` routes                                                                                                                      |
| Venue map storage                       | Existing `event-assets` bucket, path `{organizer_id}/{event_id}/{uuid}.{ext}`, URL saved in `events.map_url`     | The bucket is already public, so no new bucket and no migration                                                                                                                                        |
| Certificate rule                        | Attendance is required, enforced by an RLS `WITH CHECK`                                                          | §15 forbids certifying non-attendees; the guard belongs in the data policy, not the UI                                                                                                                 |
| Check-in idempotency                    | `UNIQUE (event_id, participant_id)` + `ON CONFLICT DO NOTHING`                                                   | Duplicates are impossible at the storage layer, not just in application code                                                                                                                           |
| Templates                               | 8 static TypeScript definitions in `src/features/design/lib/templates`                                           | No template table, seed, or admin UI; a new template is one more entry in an array                                                                                                                     |
| Generators                              | Canvas draw functions → PNG → jsPDF for PDF                                                                      | One uniform pipeline for all four material types, testable without a browser                                                                                                                           |
| Fonts                                   | `@fontsource-variable/*` bundled through npm                                                                     | Builds never depend on fetching Google Fonts                                                                                                                                                           |
| QR library import                       | `await import('qrcode')` inside a Client Component                                                               | Keeps the encoder out of the shared bundle                                                                                                                                                             |
| Speaker identity                        | `participants.role = 'Speaker'`; no `participant_type` column                                                    | The enum already carries `Speaker`, and `register_participant()` takes no role argument, so a public registrant cannot become one. `src/lib/participantType.ts` derives the two-way split in one place |
| Speaker creation                        | Organizer-only Server Action that hardcodes the role                                                             | The payload has no role field, so no request — and no visible control — can create one                                                                                                                 |
| Speaker profile                         | Nullable `organization` and `title` columns                                                                      | A six-value enum cannot hold "Keynote Speaker"; both are null for ordinary participants                                                                                                                |
| Speaker check-in                        | The existing scanner, attendance row, and pass, unchanged                                                        | A duplicate speaker scan behaves exactly like a participant's, and the result names the group                                                                                                          |
| Certificate eligibility                 | Checked-in people by default, per group, in the UI; enforced again by the `certificates` RLS                     | A certificate asserts attendance, so the data policy is the control and the list is a convenience                                                                                                      |
| Certificate records                     | The existing `certificates` table plus a unique `verification_token`                                             | A QR has to identify one certificate, and a persistent record is what makes it verifiable                                                                                                              |
| Certificate regeneration                | Upsert on `unique (event_id, participant_id)`, token preserved                                                   | A printed QR keeps working after the wording changes; one record per person per event                                                                                                                  |
| Certificate verification                | `SECURITY DEFINER` `get_certificate_verification(token)`, readable by `anon`                                     | `anon` has no SELECT policy on `certificates`, so a function is the only public read that does not expose every certificate                                                                            |
| Bulk certificates                       | One PDF per recipient, streamed into a ZIP with `client-zip`                                                     | Browsers throttle or block 45 separate downloads; the archive is generated client-side, one canvas at a time                                                                                           |
| Custom templates                        | PNG only, uploaded to a private `event-templates` bucket, read through short-lived signed URLs                   | An organizer's working artwork is their asset, not public event content, and it is never served from a public bucket                                                                                   |
| Placeholder system                      | Exact `#00B140` rectangles, detected as contiguous regions and mapped to a field                                 | The colour says where, never what, so the organizer assigns TEXT, PHOTO, or QR per rectangle                                                                                                           |
| Custom templates in the pipeline        | A runtime `DesignTemplate` appended to the built-in catalogue                                                    | Preview, export, and bulk generation are the same code path; no parallel renderer                                                                                                                      |

## Out of Scope

Payments, chat, complex ticketing, email marketing, AI features, advanced
analytics, role/permission systems, native mobile apps, realtime multiplayer,
drag-and-drop design editors, participant accounts, map pin editing, PSD or PDF
template parsing, and the Event Pack download.

## Notes

- `docs/architecture/database-schema.md` is the table-by-table reference.
- `docs/architecture/auth-flow.md` covers sessions and the bearer-link caveat.
- `docs/architecture/design-module.md` covers the canvas template pipeline.
- `docs/architecture/attendance-module.md` covers registration, check-in, and export.
- `docs/architecture/info-module.md` covers the public schedule, map, and rules pages.
- `docs/architecture/speakers-and-certificates.md` covers the speaker model, certificate records, bulk generation, and the custom template system.
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
