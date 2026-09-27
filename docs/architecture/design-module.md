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
- **No privileged writes.** Generation is entirely client-side, so the module
  introduces no Server Action, no new table, and no service-role access.

### The certificate attendance rule

`CONTEXT.md` requires attendance before a certificate is issued. That rule is
enforced by an RLS `WITH CHECK` on the `certificates` table, which a browser-side
PDF render never touches. The certificate generator therefore defaults its
recipient list to checked-in participants and offers an explicit "Show all
participants" control, so the rule is the default rather than an accident of
rendering. Nothing is written to `certificates`; that table remains unused.

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
