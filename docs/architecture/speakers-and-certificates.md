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

An organizer can upload their own certificate artwork and place the recipient's
name on it. This is deliberately **not** a general design tool: a canvas engine,
image uploads, and arbitrary objects were all considered and rejected as
disproportionate to the one job this does. The editor places text boxes over a
finished design, and that is all it does.

The scope is certificate-only. The table keeps its `kind` column for future
editors, but the upload path, the picker, and the management UI are certificates
and nothing else.

### The artwork is used exactly as uploaded

The organizer's PNG **is** the certificate. EventKit stores the file byte for
byte and draws it once, full size, at generation time. Nothing is detected,
sampled, recoloured, cropped, or erased, and no fill is ever painted over it.

This is a deliberate reversal of an earlier design. That design asked the
organizer to mark two areas with reserved colours — `#00B140` and `#FF00FF` —
which EventKit would detect and punch to transparency before using the file as a
background. The flaw was fundamental: **removing a rectangle cannot reconstruct
what was underneath it.** On a gradient, a photograph, a texture, or anything
with fine detail, the erased area became a hole, a blend, or a visible patch. The
placeholder scheme also pushed work onto the organizer that the editor could have
done itself, since the organizer was marking a _position_ and EventKit was
already going to ask for a position.

So the artwork now carries all the static content — the certificate title, the
event name, the school, the date, the signatures, the borders — and EventKit's
only job is to write the recipient's name on top. There is no placeholder colour,
no region detection, and no image processing anywhere in the upload or render
path. `detect.ts` and `clean.ts` were removed rather than deprecated, and the
types and tests that described them went with them.

### The model

A custom template is an uploaded PNG plus a list of dynamic text layers.

```jsonc
{
  // Vestigial: see the note below. Written to satisfy a CHECK, read by nothing.
  "recipientName": {},
  "certificateType": {},
  "textLayers": [
    {
      "id": "recipient-name",
      "field": "recipientName",
      "x": 100,
      "y": 420,
      "width": 800,
      "height": 120,
      "fontFamily": "Lora",
      "fontSize": 42,
      "fontWeight": 700,
      "italic": false,
      "color": "#111111",
      "horizontalAlign": "center",
      "verticalAlign": "middle",
      "letterSpacing": 0,
      "lineHeight": 1.1,
    },
  ],
}
```

`field` is `recipientName` and nothing else. The certificate type is **not** a
dynamic field for a custom template: it is part of the designer's artwork. A
second field would be added to `TEXT_LAYER_FIELDS` deliberately, when there is a
second thing that genuinely varies per recipient.

Several text boxes are permitted and every one of them receives the same
recipient name — two name boxes on one certificate is a legitimate layout, but
they are not a way to place the certificate type. `LIMITS.maxTextLayers` bounds
the work one stored configuration can ask the renderer to do.

**The two vestigial keys.** Migration 0003 attached a `CHECK` to `design_config`
requiring `recipientName` and `certificateType` to be present as objects, written
when the editor still located two fixed placeholder rectangles. Storing the clean
`{ "textLayers": [...] }` shape would fail that constraint on every write, so the
two keys are still written as empty objects. **No application code reads them.**
They are optional on read, so a hand-edited row that drops them still loads, and
the writer always emits them so the live constraint stays satisfied without a
migration. They are an artefact of an old migration, not a feature.

### The editor

- PNG preview, unchanged by the app.
- `+ Add Text Box` creates a recipient-name box, centred, with a font size derived
  from its height. The box shows `Juan Dela Cruz` while it is being arranged; the
  real name replaces it at generation time.
- Drag inside the box to move it. A selection shows four corner and four side
  handles; dragging a corner changes both axes, a side changes only its own.
  Selection controls disappear when the box is deselected, and a box is
  deselected by clicking the artwork or pressing Escape.
- Resizing changes the box and **never** the font size. A wider box and larger
  type are separate decisions, so the two controls are separate.
- Typography: family (Inter, Plus Jakarta Sans, Lora, JetBrains Mono — bundled,
  no system fonts), size, bold, italic, colour, horizontal and vertical
  alignment, letter spacing, and line height. Long names wrap inside the box and
  then shrink, and an overflow is reported honestly rather than drawn past the
  edge.
- Keyboard equivalents exist for everything pointer-only: a selected box is
  focusable, moves with the arrow keys (Shift for a larger step), and is removed
  with Delete. Numeric width and height fields are deliberately absent — the
  handles are the interface.

### Coordinates

Every stored number is in **original PNG pixels**. The editor is a scaled view of
the artwork: the background is laid out at the browser's width, and the text-box
overlay is sized in real image pixels and then CSS-scaled by
`displayWidth / imageWidth` with `transform-origin: top left`.

That one transform is what makes the whole editor honest. Because the boxes live
inside a scaled container, a pointer delta converts to image units with a single
`value / scale`, and the values being dragged are already the values the renderer
consumes. A 1920×1080 PNG shown at 960×540 stores doubled coordinates. No
viewport width and no device pixel ratio enters the arithmetic, so a template
arranged on a laptop produces the same file on a projector.

### Rendering

`buildCertificateTemplate` returns a real `DesignTemplate`, so a custom template
is appended to the same array as the built-ins and flows through the existing
picker, preview, generate, and export code untouched. There is no second
renderer. `draw` paints the background once and then draws each configured text
layer over it with the recipient's name.

`fitLayerText` is shared with the editor's preview, so a name that wraps in the
browser wraps in the PDF.

### Certificate type on a custom template

The certificate **record** still has a `certificate_type`: the column is `NOT
NULL` and constrained, and the public verification page publishes it as the
certificate's title. The organizer therefore still chooses one, and the bulk panel
labels it _Verification title only_ with a note that it is not printed on the
artwork — the wording in the certificate is the designer's pixels. Nothing is
defaulted or fabricated on the organizer's behalf, and the custom renderer never
reads it.

### Storage

Artwork lives in a **private** `event-templates` bucket at
`{organizer_id}/{event_id}/templates/{uuid}.png`, read through 30-minute signed
URLs. Unlike `event-assets`, no public URL for a template ever exists. Insert
policies check that the first path segment is the caller _and_ that the second is
an event they own, so a valid first segment alone cannot write into somebody
else's folder. The 5 MB cap, the PNG byte sniff, the 64–8000 px dimension range,
and the orphan cleanup on a failed row write are unchanged by this design.

The bytes are sniffed, not trusted: `File.type` is browser-supplied, so the PNG
signature is the real check. PSD and PDF are rejected with a message pointing at
"export as PNG" rather than being parsed. Reported dimensions are range-checked
because that value is untrusted too — a hostile client could otherwise ask the
renderer for a canvas larger than a browser will allocate.

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
- Custom templates are PNG only.
- The editor is a text-box placer, not a design tool. Image uploads, rotation,
  shapes, and a QR the organizer places by hand are all absent, and the
  verification QR has a fixed bottom-right position because the artwork is
  arbitrary and no safe area can be found without the organizer marking one. A
  design that fills that corner will have the code drawn over it.
- A certificate record still carries a certificate type, which the verification
  page publishes. For a custom template it labels the record only; the wording on
  the certificate itself is the designer's.
- Speaker title and organization are not shown on the public event page.
- The verification page shows the recipient's name, which is a deliberate
  disclosure: the certificate is a public claim about that person.
