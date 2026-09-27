-- EventKit custom certificate templates: reshape for the certificate editor.
--
-- The generic multi-kind shape from 20260926000002 becomes a structured,
-- certificate-only configuration. That scope decision is the whole point of this
-- file: the custom-template editor exists for certificates only, so the schema
-- stops carrying a `kind` vocabulary and a field-agnostic placeholder array that
-- only certificates ever used.
--
-- Additive and non-destructive:
--   * No row is deleted. The table was empty when this was written, but the
--     rename is written so it is still correct if one was added in the meantime.
--   * `certificates` is untouched, and holds no reference to a template. Deleting
--     a template therefore cannot invalidate an already-issued certificate: no
--     artefact bytes are stored anywhere, and `get_certificate_verification`
--     returns no template column.
--   * The bucket, its policies, and their paths are unchanged, so no object in
--     Storage is orphaned by this migration.
--
-- `kind` is intentionally kept rather than dropped. Badge, poster, and photo
-- frame editors are future work, and keeping the column means that work needs no
-- migration of its own.

-- ---------------------------------------------------------------------------
-- event_design_templates: structured certificate configuration
-- ---------------------------------------------------------------------------

alter table public.event_design_templates
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.event_design_templates
  add column if not exists updated_at timestamptz not null default now();

-- The generic `{x, y, width, height, field}[]` array becomes one object with a
-- fixed key per dynamic layer. A certificate has exactly two: the recipient's
-- name and the certificate type. A fixed shape means the renderer never has to
-- ask which field a slot is for, and a typo in a key is a constraint failure
-- rather than a blank space on a printed certificate.
alter table public.event_design_templates
  rename column placeholders to design_config;

comment on column public.event_design_templates.design_config is
  'The two dynamic text layers: {recipientName: {...}, certificateType: {...}}. Deep shape is validated by the application; this constraint only guarantees both keys are present.';
comment on column public.event_design_templates.created_by is
  'The organizer who uploaded the template. Null if that account was later deleted.';
comment on column public.event_design_templates.kind is
  'Design kind. Only ''certificate'' is reachable from the UI in this phase; the others are reserved for future editors.';

alter table public.event_design_templates
  drop constraint if exists event_design_templates_design_config_layers;

alter table public.event_design_templates
  add constraint event_design_templates_design_config_layers
  check (
    jsonb_typeof(design_config) = 'object'
    and design_config ? 'recipientName'
    and design_config ? 'certificateType'
    and jsonb_typeof(design_config -> 'recipientName') = 'object'
    and jsonb_typeof(design_config -> 'certificateType') = 'object'
  );

-- Keep `updated_at` honest. Reusing the shared trigger function is what every
-- other table in this schema does.
drop trigger if exists set_event_design_templates_updated_at on public.event_design_templates;

create trigger set_event_design_templates_updated_at
  before update on public.event_design_templates
  for each row
  execute function public.set_updated_at();

-- The insert policy now records who created the row. A template an organizer did
-- not create is still readable by them, because ownership is by event, but the
-- audit trail is not forgeable.
drop policy if exists event_design_templates_insert_organizer on public.event_design_templates;

create policy event_design_templates_insert_organizer
  on public.event_design_templates for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_design_templates.event_id
        and e.organizer_id = (select auth.uid())
    )
    and created_by is not distinct from (select auth.uid())
  );
