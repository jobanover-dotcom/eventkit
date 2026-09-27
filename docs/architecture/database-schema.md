# Database Schema

> Tables, columns, relationships, and access rules.
> Source of truth: `supabase/migrations/20260926000001_create_eventkit.sql`.
> Tests: `supabase/tests/eventkit_rls.test.sql` (pgTAP).

## Entity relationships

```text
auth.users ──1:1──> profiles
    │
    └──1:N──> events ──1:N──> participants ──1:0..1──> attendance
                   │    │                          │
                   │    ├──1:N──> schedules        └──1:0..1──> certificates ──> templates
                   │    ├──1:N──> rules
                   │    └──> certificates ──> event_design_templates
                   ├──> storage.objects (logo, cover, map) at {organizer_id}/{event_id}/{random}.{ext}
                   └──> storage.objects (custom templates, private) at {organizer_id}/{event_id}/templates/{uuid}.png
```

`attendance` and `certificates` reference `participants (event_id, id)` through a
composite foreign key, so neither table can ever hold a row that points at a
participant belonging to a different event. That invariant is enforced by the
database, not by application code.

## Tables

| Table                    | Purpose                                                                  | Key columns                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`               | One row per authenticated organizer, created by an `auth.users` trigger. | `id` (PK, FK → `auth.users`), `email`, `full_name`                                                                                                                         |
| `events`                 | The single source of truth for an event.                                 | `organizer_id`, `name`, `description`, `date`, `start_time`, `end_time`, `venue`, `organizer_name`, `logo_url`, `cover_image_url`, `map_url`, `theme`, `registration_open` |
| `participants`           | One row per registration. No participant account.                        | `event_id`, `name`, `student_id`, `email`, `course`, `year_section`, `role`, `qr_token`                                                                                    |
| `attendance`             | One row per participant per event. Append-only.                          | `event_id`, `participant_id`, `checked_in_at`                                                                                                                              |
| `schedules`              | Programme items, displayed in `sort_order`.                              | `title`, `description`, `start_time`, `end_time`, `location`, `sort_order`                                                                                                 |
| `rules`                  | Guideline sections.                                                      | `title`, `content`, `sort_order`                                                                                                                                           |
| `templates`              | Global, read-only design catalogue seeded by the migration.              | `type`, `name`, `template_config` (jsonb)                                                                                                                                  |
| `certificates`           | One issued certificate per participant per event.                        | `certificate_type`, `award`, `signatory`, `verification_token`, `issued_at`                                                                                                |
| `event_design_templates` | Organizer-uploaded custom templates. Artwork is in Storage, not here.    | `event_id`, `name`, `kind`, `storage_path`, `image_width`, `image_height`, `placeholders` (jsonb)                                                                          |

## Columns beyond the brief

| Column                            | Why it exists                                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events.organizer_name`           | §8 requires an organizer/department name on the event form; it is printed on certificates and posters.                                                                     |
| `events.map_url`                  | §20 venue map image.                                                                                                                                                       |
| `events.registration_open`        | §27 "opens registration". A closed event also becomes private: RLS hides it from everyone but its owner.                                                                   |
| `participants.role`               | §14 badge roles (Student, Speaker, Organizer, Staff, Guest, Judge). Constrained by a CHECK.                                                                                |
| `certificates` table              | §5 "access their certificate if generated" and §15. Also the enforcement point for the attendance rule below.                                                              |
| `participants.organization`       | A speaker's affiliation, e.g. "Assumption College of Davao". Nullable, so ordinary participants are unaffected.                                                            |
| `participants.title`              | A speaker's own title, e.g. "Keynote Speaker". A six-value `role` enum cannot hold this. Nullable.                                                                         |
| `certificates.verification_token` | The opaque 256-bit credential a certificate's QR encodes. Separate from `participants.qr_token` by design: one proves presence, the other proves a certificate was issued. |
| `event_design_templates`          | A custom template has to persist so the placeholder mapping is done once. Artwork stays in Storage.                                                                        |

## Integrity rules

| Rule                                                  | Mechanism                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `end_time > start_time` on events and schedules       | CHECK constraint                                                                                                                                                                                                                                                                                                                 |
| `theme` is a hex colour                               | CHECK `^#[0-9a-fA-F]{6}$`                                                                                                                                                                                                                                                                                                        |
| `role` and `certificate_type` come from fixed lists   | CHECK constraint against a literal list                                                                                                                                                                                                                                                                                          |
| `qr_token` is unguessable and database-generated      | Column `DEFAULT` of two `gen_random_uuid()` values, 64 hex chars = 256 bits, plus `UNIQUE`. A client cannot choose its own token.                                                                                                                                                                                                |
| One registration per student per event                | Partial `UNIQUE (event_id, lower(student_id)) WHERE student_id IS NOT NULL`                                                                                                                                                                                                                                                      |
| One check-in per participant per event                | `UNIQUE (event_id, participant_id)`, resolved with `ON CONFLICT DO NOTHING`                                                                                                                                                                                                                                                      |
| One certificate per participant per event             | `UNIQUE (event_id, participant_id)`                                                                                                                                                                                                                                                                                              |
| Attendance and certificates reference the right event | Composite FK → `participants (event_id, id)`                                                                                                                                                                                                                                                                                     |
| A certificate requires attendance                     | RLS `WITH CHECK` on `certificates_insert_organizer` **and** `certificates_update_organizer` requires a matching `attendance` row. Enforced for every client, including direct REST calls. The update policy was originally insert-only, which let a certificate be re-pointed onto a non-attendee; `20260926000002` closes that. |
| Attendance cannot be edited or deleted                | No `UPDATE` or `DELETE` policy exists, so those statements are refused with `42501`.                                                                                                                                                                                                                                             |
| `updated_at` maintenance                              | `BEFORE UPDATE` trigger                                                                                                                                                                                                                                                                                                          |

## Access model

Row Level Security is enabled on all eight tables, with separate policies per
command and both `using` and `with check` on every write.

| Principal             | Events            | Participants | Attendance | Schedules / Rules | Certificates   | Templates | Profiles |
| --------------------- | ----------------- | ------------ | ---------- | ----------------- | -------------- | --------- | -------- |
| `anon`                | published only    | none         | none       | published only    | published only | read      | none     |
| organizer (owner)     | own, incl. closed | own events   | own events | own events        | own events     | read      | own row  |
| organizer (non-owner) | published only    | none         | none       | published only    | published only | read      | own row  |

Two deliberate consequences:

- **`anon` has no grant at all on `participants` or `attendance`.** Participant
  data is never exposed to a browser client directly. The public pass page reads
  through `get_participant_pass(event_id, token)`, a `SECURITY DEFINER` function
  that returns one row and only when the caller presents that participant's token
  for that event. It has no `email` output column.
- **Anonymous registration goes through `register_participant(...)`**, also
  `SECURITY DEFINER`, which checks that the event is open, trims input, and lets
  the table constraints reject anything malformed. This avoids granting `anon`
  any `INSERT` on `participants` and keeps `qr_token` server-generated.

`EXECUTE` on both functions is revoked from `PUBLIC` and granted only to `anon`
and `authenticated`. Every function pins `search_path = ''` and fully qualifies
its objects.

## Storage

| Bucket               | Contents                              | Rules                                                                                    |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `event-assets`       | Logos, cover images, venue maps       | Public read, 5 MB cap, `image/png`, `image/jpeg`, `image/webp`, `image/gif`              |
| `participant-photos` | Photos uploaded for badges and frames | Public read, 5 MB cap, PNG/JPEG/WebP                                                     |
| `event-templates`    | Organizer custom design templates     | **Private.** No public URL. 5 MB cap, `image/png` only. Read via short-lived signed URLs |

SVG is deliberately excluded: a public bucket serving user-supplied SVG is a
stored-XSS vector.

Objects are written to `{organizer_id}/{event_id}/{random}.{ext}`. The
`event-assets` and `participant-photos` policies key on
`(storage.foldername(name))[1] = auth.uid()::text`, so an organizer can only
write inside their own prefix. Object names are generated server-side from 128
bits of randomness and never reused.

`event-templates` objects live one level deeper, at
`{organizer_id}/{event_id}/templates/{uuid}.png`. Its insert and update policies
check **both** segments: the first must be the caller and the second must be an
event that caller owns. Checking only the first would let a valid owner prefix be
used to write into a different organizer's event folder. The bucket is private,
so the only read path is a server-issued signed URL.

## Seeded templates

`badge` × 4 (Modern, Minimal, Tech, School), `certificate` × 3 (Classic, Modern,
Formal), `photo_frame` × 3 (Modern, Retro, Tech), `poster` × 5 (Event
Announcement, Event Reminder, Schedule, Congratulations, Thank You). The table is
read-only to clients; there is no template admin UI.
