# Speakers and Certificates

Covers the speaker model, certificate records and verification, bulk generation,
and the custom template system. Extends the Design and Attendance modules rather
than replacing them: a speaker is a participant, a certificate is a Design
render, and a custom template is a `DesignTemplate` built at runtime.

## Speakers

A speaker is a `participants` row with `role = 'Speaker'`.

There is no speaker table and no `participant_type` column. The existing six-value
`role` enum already distinguishes a speaker, and `register_participant()` takes no
role argument — so an anonymous registrant writes the column default (`Student`)
no matter what the request body contains. Speaker creation is possible only
through the organizer-only action, which hardcodes the role.

`src/lib/participantType.ts` derives the two-way split:

```ts
role === 'Speaker' ? 'SPEAKER' : 'PARTICIPANT'
```

Every other role, including `Guest`, `Judge`, `Staff`, and any value outside the
enum, falls through to `PARTICIPANT`. That default is deliberate: an unrecognised
role must never inherit speaker-only privileges or speaker-only certificate
eligibility.

`organization` and `title` (added in `20260926000002`) are nullable free text.
They are the speaker's profile; `role` stays the system-level marker. A
participant leaves both null, and a template renders an empty slot rather than
the word "undefined".

### What speakers reuse

| Concern        | Reused unchanged                                                                  |
| -------------- | --------------------------------------------------------------------------------- |
| Check-in token | The database-generated `qr_token`                                                 |
| Scanner        | `checkInByToken`; no speaker-specific code path                                   |
| Duplicate scan | Absorbed by `UNIQUE (event_id, participant_id)`, reported as `already_checked_in` |
| Attendance     | The existing `attendance` row, same immutability, same export                     |
| Pass           | `ParticipantPassCard`, now showing `title` and `organization`                     |
| Badge          | `toBadgeRole`, which already mapped `Speaker` to `Speaker`                        |

The only presentation change is the label: the scan result reads "Speaker checked
in" or "Participant checked in", derived from the role.

## Certificate records

The `certificates` table already existed with an attendance guard on INSERT.
`20260926000002` adds `verification_token`, widens the type CHECK to include
`Achievement`, and extends the same attendance guard to UPDATE — previously a
certificate could be re-pointed onto a non-attendee after the fact.

### Eligibility

A certificate asserts attendance, so the default candidate list is people with an
attendance row, scoped to one group. Widening the list is explicit and produces a
warning. It cannot actually issue to somebody who did not attend: the RLS
`WITH CHECK` refuses it, and `issueCertificates` refuses it first with a message
the organizer can act on.

> **Known tension.** The brief asks for an override that can issue to unchecked
> people. The existing RLS guard makes that impossible, and weakening it was
> judged worse than the gap: the escape hatch is to check the person in, which is
> the honest action. The override still widens the _list_, so the organizer can
> see and act on the gap. Revisit only if issuing to non-attendees is a real
> requirement.

### Regeneration

`UNIQUE (event_id, participant_id)` is the versioning rule: one record per person
per event, updated in place. `verification_token` is never rotated, so a QR
somebody already printed keeps verifying after the wording changes. There is no
history and no draft state.

### Verification

`certificates` grants SELECT to `anon` but has **no `anon` policy**, so a direct
select returns nothing. `get_certificate_verification(p_token)` is the only public
read path: a `SECURITY DEFINER` function that takes an opaque 256-bit token and
returns recipient name, role, speaker profile, certificate type, award, issue
date, and the event's public details.

It returns no email, no student id, and no `qr_token`. A caller who cannot guess a
token learns nothing, so every failure — unknown token, deleted certificate,
deleted recipient — is reported as a single "not valid" outcome.

The certificate QR encodes the full verification URL, not the bare token, and is
built by overriding the render pipeline's QR payload. Badges leave that override
unset and keep encoding the check-in token: the two are separate credentials and
must never be the same secret.

## Bulk generation

Records are minted first, then rendered. The QR has to reference a token that
exists, so the order is not negotiable.

The render loop is serial and yields between recipients. A full A4 canvas is
~35 MB of backing store, so 45 concurrent renders would exhaust the tab; each
canvas is dropped to zero after its PDF is produced. PDFs stream into a ZIP via
`client-zip` (no dependencies, incremental) rather than triggering 45 downloads,
which browsers throttle or block.

Per-recipient failures are collected and reported. One unrenderable recipient
costs the organizer that certificate, not the other 44 — and the archive is never
silently short.

## Custom templates

### The reserved colour

An organizer draws a rectangle, fills it with exactly `#00B140` (RGB 0, 177, 64),
and exports a PNG. Matching is exact: a tolerance would let a colour the designer
picked to be _close to_ green be silently consumed as a placeholder.

`detectPlaceholders` does not replace matching pixels. It builds a mask, flood
fills it into connected components with an explicit stack (recursion overflows on
a full-width region), and keeps only components whose bounding box is 100 % full.
A shape that is not a solid rectangle produces a **warning**, never a guess —
silently treating an L-shape as a box would print content across the designer's
artwork. Regions below 64 px² are skipped as noise.

### Mapping

The colour says _where_, never _what_, so the organizer assigns each rectangle a
field. The per-kind catalogue in `fields.ts` supports `TEXT`, `PHOTO`, and `QR`,
and every field maps to a value that exists in the data model. Optional fields
resolve to an empty string, so a participant with no organization prints nothing.

### Rendering

`buildCustomTemplate` returns a real `DesignTemplate`, so a custom template is
appended to the same array as the built-in ones and flows through the existing
picker, preview, generate, and export code untouched. There is no second
renderer.

Every slot is filled with a background colour **before** anything is drawn into
it, so the green disappears even for an unmapped or empty placeholder. Text is
centred and shrunk by `layoutText` until it fits; photos use `drawCover`; a QR is
drawn as the largest centred square that fits, with the white quiet zone
`drawQr` always provides.

### Storage

Artwork lives in a **private** `event-templates` bucket at
`{organizer_id}/{event_id}/templates/{uuid}.png`, read through short-lived signed
URLs. Unlike `event-assets`, no public URL for a template ever exists. Insert
policies check that the first path segment is the caller _and_ that the second is
an event they own, so a valid first segment alone cannot write into somebody
else's folder.

The bytes are sniffed, not trusted: `File.type` is browser-supplied, so the PNG
signature is the real check. PSD and PDF are rejected with a message pointing at
"export as PNG" rather than being parsed.

## Security summary

| Operation                   | Control                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| Add a speaker               | Owner check in the service; role is not a client field                  |
| Generate certificates       | Owner check; eligibility re-derived from the roster, not the payload    |
| Upload/configure a template | Owner check; byte sniffing; dimension bounds; private bucket            |
| Verify a certificate        | Public, but only via the `SECURITY DEFINER` function, and only by token |
| Register publicly           | `register_participant()`; no role argument, so never a speaker          |

## Known limitations

- No certificate history or draft state; regeneration overwrites the wording.
- The attendance guard blocks issuing to an unchecked person even via the
  override (see above).
- Bulk generation is browser-side, so a very large event is slow and the tab
  must stay open.
- Custom templates are PNG only. A placeholder rectangle must be filled exactly;
  an outlined or transparent one is skipped with a warning.
- Speaker title and organization are not shown on the public event page.
- The verification page shows the recipient's name, which is a deliberate
  disclosure: the certificate is a public claim about that person.
