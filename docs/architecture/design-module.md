# Design Module

> How a template becomes a downloadable PNG or PDF.

The Design module turns an event's existing data into printable material: badges,
certificates, posters, and photo frames. It is **template-based on purpose** —
there is no editor, no drag and drop, and no template admin. An organizer picks a
design, picks a template, and downloads a file.

## The pipeline

```text
Template (static TS)  +  Data  →  draw(ctx, data, images)  →  HTMLCanvasElement
                                                                    ↓
                                              PNG via toBlob   |   PDF via jsPDF
```

Every design kind uses this one path. Nothing about badges is special-cased for
certificates, and adding a third template is one more entry in an array.

| Piece                    | Where                                | Notes                                                                          |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------ |
| Domain types and presets | `src/features/design/types.ts`       | `EventBrand`, `ParticipantInfo`, per-kind data, certificate and poster wording |
| Template catalogue       | `src/features/design/lib/templates/` | 8 templates, 2 per kind                                                        |
| Canvas primitives        | `src/features/design/lib/canvas/`    | text fitting, colour derivation, shapes, image placement, QR plate             |
| Browser adapter          | `src/features/design/lib/render.ts`  | font loading, image decoding, QR encoding — all the async work                 |
| Export                   | `src/features/design/lib/export.ts`  | PNG and PDF download, filename sanitisation                                    |
| Generators (UI)          | `src/features/design/components/`    | `DesignStudio` is the shared shell the four generators plug into               |

## Templates are static TypeScript

The `public.templates` table seeded by the migration is **not used** by this
module. It holds 15 rows of loosely-typed `template_config` JSON and would need
interpreting; the module instead ships 8 typed definitions. `CONTEXT.md` records
this decision. Nothing writes to that table, and no admin UI exists for it.

To add a template, add an object to the relevant array in
`src/features/design/lib/templates/`. The hub's "N templates" count is derived
from the same array, so it cannot drift.

## Draw functions are pure and synchronous

A template's `draw` receives a `DrawContext` — a narrow, explicitly declared
slice of `CanvasRenderingContext2D` — plus the data and any pre-decoded images.
It never touches `document`, a clock, or randomness, so the same input always
produces the same pixels.

That is what makes the visual layer testable under vitest in jsdom, where no
canvas implementation exists. `canvas/fakeContext.ts` is a recording stand-in, and
the suite asserts three things for all 8 templates:

1. **Nothing leaves the page.** A string drawn outside the canvas bounds.
2. **Nothing prints on top of anything else.** Text-vs-text and text-vs-image
   collisions, using alignment-aware bounding boxes. Being inside the page is not
   the same as being legible.
3. **Rendering is deterministic.** Two runs produce identical draw calls.

Those checks caught real defects during the build: a poster whose fixed body
offset ran the message through a three-line title, a certificate that pushed its
event name into the signature row, and a badge whose QR plate landed on the course
line. All three passed a naive "did it throw and stay in bounds" test.

**Any new template must satisfy the collision check.** Fixed vertical offsets are
the usual cause of failure; flow from a measured cursor and bound each block with
`maxHeight` instead.

## Text never overflows

`layoutText` is the single path for every string. It searches font sizes from
`maxSize` down to `minSize` for the largest that fits `maxWidth` within
`maxLines` and, optionally, `maxHeight`; if nothing fits it truncates with an
ellipsis. Participant names come from a public registration form, so this is the
load-bearing guarantee: a 120-character name is shrunk and trimmed, never drawn
off the edge.

The name is rendered with the project's own fonts via `ctx.font`, composed from
the family names in `src/config/fonts.ts`. `renderDesign` awaits
`document.fonts.ready` first, otherwise text metrics would be measured against a
fallback face and the fit would be wrong.

## Data comes from the event, not from the organizer

The generators do not ask for anything the database already knows. Name, course,
year section, participant code, event name, date, time, venue, organiser, theme
colour, and logo all come from the `events` and `participants` rows. The organizer
chooses a participant, a template, and — for certificates — a certificate type.

`toBadgeRole` maps the stored role onto the badge vocabulary: `Student`, `Guest`,
and `Judge` all read as `Participant`, because a badge has no separate word for
them. The organiser can override the badge role per badge.

## Security

- **Authorization.** Every design page calls `getDesignContext`, which requires a
  session and matches the event by `organizer_id`. An event owned by somebody else
  raises `NOT_FOUND`, not `FORBIDDEN`, so the pages cannot be used to confirm that
  an event exists. RLS is the backstop, not the only guard.
- **QR payload.** A badge QR encodes the participant's 256-bit `qr_token` and
  nothing else — no name, no email, no student id, no event id. This matches the
  check-in contract; the event is resolved server-side from the token.
- **Uploads.** The photo frame validates type (`png`/`jpeg`/`webp`), size (5 MB,
  matching the storage buckets), and pixel dimensions, then decodes the file to
  confirm it really is an image. The photo is held in the browser as an object URL
  and **never uploaded** — there is no storage path to authorize and nothing to
  clean up. Object URLs are revoked when the photo changes or the page unmounts.
- **Generation writes nothing.** Generating a badge, certificate, poster, or photo
  frame is entirely client-side: no Server Action, no table, no service-role
  access. Uploading _custom_ artwork is the one thing here that does write, and it
  goes through the owned-event check like every other write in the app. See
  "Custom photo frames" below.

### The certificate attendance rule

`CONTEXT.md` requires attendance before a certificate is issued. That rule is
enforced by an RLS `WITH CHECK` on the `certificates` table, which a browser-side
PDF render never touches. The certificate generator therefore defaults its
recipient list to checked-in participants and offers an explicit "Show all
participants" control, so the rule is the default rather than an accident of
rendering. Nothing is written to `certificates`; that table remains unused.

## Custom photo frames

A custom frame is the organizer's own PNG, stored byte for byte and used exactly
as uploaded. One area of it is filled `#22ff00`, and that area is where the
attendee's photo appears.

**The shape is whatever pixels match.** `canvas/colorKey.ts` flags every pixel
within a tolerance of the key and reports their union box. It never inspects
connectivity, so a rectangle, a circle, a star, a hand-drawn outline, and several
separated cut-outs all work through the one rule. The mask is then dilated by 1px,
which covers the anti-aliased ring at the edge of the shape as a geometric
operation — a wider tolerance would risk swallowing a real brand green
(Tailwind's `green-500` is 110 away from the key, against a tolerance of 32).

**Nothing about the shape is stored.** The saved `design_config` holds only the
key colour, which is fixed by the product contract rather than chosen per
template. No "has a photo area" flag, no pixel count, no bounds. This is
deliberate, because the mask is re-derived from the stored PNG every time the
frame is loaded to render — so a client cannot assert a photo area into
existence by writing a boolean. Artwork containing no key colour renders as a
frame with no photo area, which the organizer sees in their own preview.

That leaves the upload-time check, which asks "does this PNG contain a key
colour?", answering in the browser. It is a convenience, not a security
boundary: the server has no image decoder, and adding one purely to police a
boolean would be the wrong trade. The action therefore validates ownership, the
name, the PNG signature, and the dimensions, and stores nothing about the answer.

**Compositing** happens in `lib/templates/customPhotoFrame.ts`. The frame is drawn
untouched, the photo is cover-cropped into the mask's box onto a scratch layer,
and `destination-in` with the mask keeps only the pixels the artwork allows. The
composite is applied to the scratch layer rather than the frame, because
`destination-in` acts on everything already drawn — run against the frame it
would erase the frame outside the mask too.

This is the one template that widens `DrawContext`, adding
`globalCompositeOperation`. The mask is derived at render time from the artwork
as loaded, including the downscale `loadImage` applies to anything over 2400px;
detecting against the file's own pixel grid would leave the mask misaligned with
the artwork being drawn.

Storage is `event_design_templates` with `kind = 'photo_frame'`, in the same
private bucket as custom certificates and through the same helpers
(`services/designTemplateStore.ts`). That table's `design_config` CHECK is
unconditional across kinds and still requires `recipientName` and
`certificateType` to be present as objects; both are written as empty objects
and read by nothing, which keeps the live constraint satisfied without a
migration.

### The public photo frame

A photo frame is also an anonymous public utility. `/events/[eventId]/photo-frame`
sits in the `(marketing)` group beside `register`, `schedule`, and `map`, and needs
no account: the visitor picks a frame, uploads a photo, and downloads the result.

It is the same renderer, not a second one. `PublicPhotoFrameGenerator` wraps
`DesignStudio` and calls the same `loadPhotoFrameTemplates` →
`buildCustomPhotoFrameTemplate` → `drawMaskedPhoto` path the organizer uses, and
the photo validation lives in one place (`usePhotoPicker`) so both answer the same
question the same way. The visitor's photo stays a browser object URL and is never
uploaded. The one thing the public version does _not_ offer is the organizer's
caption field.

**How a visitor reads an organizer's custom frames** is the interesting part, and
it is a security-definer function rather than a wider grant. `anon` has no grant
and no policy on `event_design_templates`, and the `event-templates` bucket is
private with an organizer-only select policy — so granting `anon` a read would
have published every template in the project. Migration 00006 instead adds:

- `get_public_photo_frame_templates(event)`, returning the frame metadata for an
  event the caller can already see, and
- `is_public_photo_frame_artwork(path)`, which a new `anon` select policy on the
  bucket calls so the artwork bytes are reachable for exactly those frames.

The storage policy is scoped **by kind**, not merely by event visibility: the
bucket holds certificate artwork alongside frame artwork under identical path
segments, so asking only "is this event visible?" would publish every custom
certificate background. This follows the pattern `get_certificate_verification`
and `get_participant_pass` already set for public reads.

One disclosure is accepted and documented in the migration: the artwork path is
`{organizer_id}/{event_id}/templates/{uuid}.png`, so returning it tells a caller
the owning organizer's user id — but only for a published event that actually has
a custom frame, and only an identifier, never a credential. Every policy in the
schema keys off `auth.uid()` from the verified session, so knowing somebody
else's uuid grants nothing. The path cannot be avoided, because Supabase mints
signed URLs through the Storage API and not from SQL.

`listPublicPhotoFrameTemplates` returns an empty list on any failure, including
the function not existing yet. A visitor can always make a photo with the built-in
frames, so a page offering fewer frames beats a page that 500s; the organizer's
own view still surfaces the failure, so it is not hidden.

### The event logo

`events.logo_url` and the public `event-assets` bucket both already existed, and
`resolveDesignImages` has always loaded the logo from that column into
`images.logo`. What was missing was the write: nothing ever set it, so
`drawLogoOrMonogram` fell through to its monogram fallback on every badge.

`design/services/eventLogoService.ts` is that write, modelled on `uploadEventMap`,
which does the same job for the venue map on the same bucket. The parts kept
identical are the byte sniffing (a declared `File.type` is browser-supplied, so a
script renamed `.png` arrives claiming to be an image), the server-generated object
path (never a client-supplied name, so there is no traversal to defend), the
orphaned-object cleanup when the row cannot be written, and the organizer-prefix
check before deleting anything superseded.

**The logo is one per event, not per design.** Uploading it from the badge page
writes `events.logo_url`, which every template resolves, so the certificate,
poster, and photo-frame previews change too. That is the non-duplicating outcome:
a second badge-only logo column would be a second thing for an organizer to keep
in sync, and would need a migration.

### Bulk badges

`design/lib/bulkBadges.ts` is a run, not a second renderer. Per participant it
calls the same `resolveDesignImages` the single-badge preview uses and the same
`renderDesign`, then exports through the existing `canvasToPdfBlob` or
`canvasToBlob`. A badge downloaded one at a time and a badge from a run of two
hundred are the same pixels.

**The QR is not new.** `resolveDesignImages` reads `participant.qrToken` — the
identity the person registered with and the one the check-in scanner already reads
— and that is what gets printed. No token is created, rotated, or regenerated, and
none reaches a filename, a progress label, a failure message, or a log. This is
also what makes a bulk run simpler than the certificate one: certificates must
issue a token through a Server Action before rendering, because each certificate
needs its own; a badge needs nothing issued first, so the whole run is client-side.

The loop is serial and yields between badges for the same reason certificates do
— each render allocates a full canvas — and releases each canvas as it is
collected. Failures are collected with the participant's name rather than thrown,
so one unrenderable badge costs that badge and not the rest of the room, and
`downloadBadgeArchive` refuses to hand over an empty archive.

## Export

PNG is `canvas.toBlob`. PDF is jsPDF with the rendered canvas added as an image,
fitted to the declared page: A4 landscape for certificates (which fill the page
exactly), A4 portrait for badges and posters. jsPDF is imported dynamically so the
heaviest dependency in the project stays out of the shared bundle, matching the
existing `qrcode` pattern.

A consequence worth knowing: certificate text is rasterised inside the PDF, so it
is not selectable or searchable. Fine for print, not ideal for records.

Download filenames are built from participant names, which are untrusted public
input, so `sanitizeFilename` strips control characters, replaces path separators
and reserved characters, collapses dot runs, and caps the length.

## Known limitations

- One participant or one poster per download. There is no bulk or ZIP export.
- Templates are not editable by organizers, and a new one means editing TypeScript.
- The photo frame does not persist the chosen photo between visits.
- Certificates are not recorded, so there is no history of what was issued.
- Thumbnails and previews rasterise on the client; a device without canvas support
  shows the template name and blurb instead.
- A custom photo frame's shape is defined by its own pixels, so it cannot be
  nudged or corrected from the app. A misplaced key area means re-exporting the
  artwork.
- The 1px dilation softens a custom frame's photo edge slightly in picker
  thumbnails, which render at ~260px wide. Full-resolution output derives the mask
  at the artwork's own dimensions and is unaffected.
