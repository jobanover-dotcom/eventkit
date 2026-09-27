# Attendance Module

> Registration → QR → scan → check-in → attendance sheet.

Four organizer screens and two public ones, built on tables the schema already
ships. **There is no migration for this module and no new table.**

## The flow

```text
Public registration page
  → register_participant()            SECURITY DEFINER, mints the qr_token
  → QR shown on the registrant's phone
Organizer check-in page
  → html5-qrcode decodes a token
  → checkInAction                      Server Action
  → ownership + token + event proved   service
  → upsert ignoreDuplicates            the unique index arbitrates
  → result, and the scanner keeps going
Organizer attendance page
  → roster + summary + CSV export
```

| Route                                            | Group     | Purpose                                                    |
| ------------------------------------------------ | --------- | ---------------------------------------------------------- |
| `/events/[eventId]`                              | marketing | Public event details and a Register button                 |
| `/events/[eventId]/register`                     | marketing | Registration form, then the pass on the same screen        |
| `/events/[eventId]/participants`                 | organizer | Roster with search, status filter, and a pass link per row |
| `/events/[eventId]/participants/[participantId]` | organizer | One pass, plus the full check-in code                      |
| `/events/[eventId]/check-in`                     | organizer | Camera scanner with a manual-entry fallback                |
| `/events/[eventId]/attendance`                   | organizer | Summary, filterable table, CSV export                      |

## Nothing here is a second token system

`participants.qr_token` is the only credential. It is a column `DEFAULT` of two
`gen_random_uuid()` values, so the database mints it: a registrant cannot choose
their own, and it is derived from no name, ID, email, or event. The QR encodes
that token **and nothing else** — no event id, no participant data.

`register_participant()` already existed as a `SECURITY DEFINER` function and
already returned `(id, qr_token)`. The registration page calls it rather than
inserting, which keeps `anon` write-free on `participants`, keeps validation next
to the table constraints, and means the token comes from the column default.

The pass is rendered on the registrant's own screen. **The token never enters a
URL**, because a pass link is a bearer secret and this module does not add a
token-shaped public surface. The only place the full code is readable is the
organizer's own pass page, which is what makes the scanner's manual entry usable
on a laptop with no working camera.

## How a scan is authorized

`checkInByToken` proves things in a fixed order, and no client-supplied value can
short-circuit it:

1. `requireOrganizer()` — a session exists.
2. `selectOwnedEvent(eventId, organizer.id)` — the caller owns the event being
   checked into. Someone else's event is `NOT_FOUND`, never `FORBIDDEN`, so the
   page cannot be used to confirm that an event exists.
3. `normalizeQrToken` — the decoded string is trimmed, lower-cased, and checked
   against the token format before a query is spent on it.
4. `selectParticipantByToken` — RLS limits the match to the caller's own
   participants.
5. `classifyTokenMatch` — the participant's `event_id` is compared to the event
   being scanned, server-side.

Step 5 is what stops a client that lies about the event id: a token from another
event resolves to `wrong_event` and nothing is written. And because RLS never
surfaces another organizer's participants, an unknown token and a stranger's
token are indistinguishable — `invalid` — so this is not an enumeration oracle.

Outcomes map onto the codes already in `docs/api/errors.md`: `INVALID_QR` for a
token that matched nothing, `WRONG_EVENT` for one from a different event. Both
are ordinary at a door, not faults, and the scanner stays usable after either.

## Why a rescan cannot double-write

`attendance` has SELECT and INSERT policies for the owning organizer and
deliberately **no UPDATE or DELETE policy** — a check-in is immutable.

The service does not read-then-write, which would race. It inserts with
`ignoreDuplicates`, and the unique index on `(event_id, participant_id)` decides:

- one row back → this request created the check-in → **Checked in**
- no rows back → a concurrent scan already won → re-read the row and report
  **Already checked in** with the _original_ timestamp

Reporting the stored time rather than the moment of the rescan is the only honest
answer, since the row cannot be rewritten.

The pgTAP suite in `supabase/tests/eventkit_rls.test.sql` already proves the
storage-layer guarantees: a rescan never creates a second row, `anon` cannot
check anybody in, there is no update or delete policy, and an attendance row
cannot point at another event's participant. The unit tests here cover what those
tests cannot — that the application _reports_ each outcome correctly.

## Roster filtering

Search, status, and role filters run on the server against a single authorized
read, driven by `searchParams`. The browser never holds rows it may not see,
there is one data path rather than two, and a filtered view is a shareable URL.
This follows the `CONTEXT.md` decision to use Server Components with
`searchParams` and no client cache.

Totals are computed over the whole roster, not the filtered slice, so the summary
cards do not shift as someone types in the search box.

A school event registers tens of people, so the roster is one query. Server-side
pagination becomes necessary well past this size.

## CSV export

`src/features/attendance/lib/csv.ts`, no library. RFC 4180 quoting, and every
field is quoted unconditionally so a value that later grows a comma cannot break
the file.

Participant names come from a public form, so cells beginning `=`, `+`, `-`, or
@` are prefixed with an apostrophe: Excel and Sheets would otherwise execute them
as formulas. The apostrophe sits inside the quoted field, so the value still reads
correctly.

The export covers the **filtered** view, because an organizer who filtered to "not
checked in" wants the outstanding list. A UTF-8 BOM is written so diacritics
survive the trip into Excel.

## After a check-in

The scanner calls `router.refresh()`, which re-runs the Server Component that
rendered it. There is no realtime subscription and no polling: with one organizer
on one phone, a revalidation is the right weight, and `CONTEXT.md` asks for
exactly that.

## Known limitations

- One participant per download. No bulk check-in list, no email, no SMS.
- The roster is unpaginated. Fine at school-event scale, not at conference scale.
- The pass is a credential shown on a screen. It is not revocable from the UI and
  there is no "reissue code" action.
- The scanner decodes whatever `html5-qrcode` supports in `QR_CODE` format only;
  a camera that cannot focus at a busy door needs the manual fallback.
- A participant's role is always `Student` from the public form, because
  `register_participant()` takes no role argument. Other roles exist in the schema
  and are set through the API.
