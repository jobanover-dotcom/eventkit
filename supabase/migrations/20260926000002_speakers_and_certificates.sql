-- EventKit speakers, certificate records, and custom design templates.
--
-- Additive only. No table, column, row, or policy from 20260926000001 is
-- dropped, and the `participants.role` enum is left exactly as it was.
--
-- Trust model for this migration:
--   * `role = 'Speaker'` is the single speaker marker. It is already in the
--     enum, so no new participant type column is introduced. Public
--     registration cannot set it, because `register_participant()` takes no
--     role argument and always writes the column default.
--   * organizer-owned template artwork lives in a private bucket. Nothing in
--     it is readable without a server-issued signed URL.
--   * certificate verification is public but opaque: the caller presents a
--     256-bit token and receives only the fields a verifier needs.
--
-- Every function below pins `search_path = ''` and fully qualifies its objects.

-- ---------------------------------------------------------------------------
-- participants: speaker profile columns
-- ---------------------------------------------------------------------------

-- `role` says what kind of person this is. `title` and `organization` say who
-- they are, and are deliberately free text: "Keynote Speaker" and "Dean, IT
-- Department" cannot live in a six-value enum. Both are nullable, so every
-- existing participant keeps working untouched and reads as null.
alter table public.participants
  add column if not exists organization text
    check (organization is null or char_length(btrim(organization)) between 1 and 120),
  add column if not exists title text
    check (title is null or char_length(btrim(title)) between 1 and 120);

comment on column public.participants.role is
  'Speaker marks a speaker. All other values are ordinary participants. Public registration cannot set this.';
comment on column public.participants.title is
  'Free-text speaker title, e.g. "Keynote Speaker". Null for ordinary participants.';
comment on column public.participants.organization is
  'Speaker affiliation, e.g. "Assumption College of Davao". Null for ordinary participants.';

-- ---------------------------------------------------------------------------
-- certificates: verification token and type coverage
-- ---------------------------------------------------------------------------

-- The verification token is the credential a scanned certificate QR carries.
-- It is a separate 256-bit random value from `participants.qr_token` on
-- purpose: one proves a person is present, the other proves a specific
-- certificate was issued. Leaking one must never reveal the other.
--
-- `not null default` backfills every existing row, so current certificates
-- keep working and none are lost.
alter table public.certificates
  add column if not exists verification_token text not null default (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  );

-- Dropped first so this file can be re-applied. The unique constraint already
-- creates the index the verification lookup uses, so no separate index is added.
alter table public.certificates
  drop constraint if exists certificates_verification_token_key;
alter table public.certificates
  drop constraint if exists certificates_verification_token_length;

alter table public.certificates
  add constraint certificates_verification_token_key unique (verification_token),
  add constraint certificates_verification_token_length
    check (char_length(verification_token) >= 32);

comment on column public.certificates.verification_token is
  'Opaque 256-bit credential encoded in a certificate QR. Not the participant check-in token.';

-- The Design module has always offered Participation, Completion, Appreciation,
-- Recognition, and Achievement. The table constraint lagged behind and rejected
-- Achievement. Widened to cover every type the product offers, keeping Winner.
alter table public.certificates
  drop constraint if exists certificates_certificate_type_check;

alter table public.certificates
  add constraint certificates_certificate_type_check
  check (
    certificate_type in (
      'Participation', 'Completion', 'Recognition', 'Appreciation', 'Achievement', 'Winner'
    )
  );

-- The insert policy already refuses to issue a certificate to somebody who
-- never checked in. The update policy did not, so a certificate could be
-- re-pointed onto a non-attendee after the fact. Same guard, both directions.
drop policy if exists certificates_update_organizer on public.certificates;

create policy certificates_update_organizer
  on public.certificates for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = certificates.event_id
        and e.organizer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = certificates.event_id
        and e.organizer_id = (select auth.uid())
    )
    and exists (
      select 1 from public.attendance a
      where a.event_id = certificates.event_id
        and a.participant_id = certificates.participant_id
    )
  );

-- Regenerating a certificate must not invalidate a QR somebody already printed.
-- The unique (event_id, participant_id) key stays the regeneration rule: one
-- record per person per event, updated in place, verification token preserved.

-- ---------------------------------------------------------------------------
-- event_design_templates: organizer-uploaded custom templates
-- ---------------------------------------------------------------------------

-- A custom template is a PNG plus the mapping from each detected placeholder
-- rectangle to a dynamic field. The image itself lives in Storage, not here.
create table public.event_design_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Matches the Design module's kind vocabulary, so a template is only offered
  -- for the design types it was uploaded for.
  kind text not null check (kind in ('badge', 'certificate', 'poster', 'photo_frame')),
  -- Path inside the private event-templates bucket.
  storage_path text not null,
  -- Natural pixel size of the PNG. The renderer works in these units.
  image_width integer not null check (image_width between 64 and 8000),
  image_height integer not null check (image_height between 64 and 8000),
  -- Detected placeholder rectangles and their field assignments. Shape is
  -- validated by the application, not the database, because it is a document
  -- rather than a relation.
  placeholders jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.event_design_templates enable row level security;
create index event_design_templates_event_id_idx on public.event_design_templates (event_id);
create unique index event_design_templates_event_kind_name_uniq
  on public.event_design_templates (event_id, kind, name);

revoke all on table public.event_design_templates from anon, authenticated;
grant select, insert, update, delete on table public.event_design_templates to authenticated;

comment on table public.event_design_templates is
  'Organizer-uploaded custom design templates. Artwork is private in Storage; this row holds only metadata and placeholder mappings.';

create policy event_design_templates_select_organizer
  on public.event_design_templates for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_design_templates.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy event_design_templates_insert_organizer
  on public.event_design_templates for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_design_templates.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy event_design_templates_update_organizer
  on public.event_design_templates for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_design_templates.event_id
        and e.organizer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_design_templates.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy event_design_templates_delete_organizer
  on public.event_design_templates for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_design_templates.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Public certificate verification (security definer: it carries its own
-- authorization)
-- ---------------------------------------------------------------------------

-- `anon` has a SELECT grant on certificates but no anon policy, so a public
-- page cannot read the table directly without exposing every certificate in
-- the project. This function is the only public read path.
--
-- It returns what a verifier is entitled to see and nothing else: no email, no
-- student id, no check-in token, no raw participant or event ids beyond the
-- public event id needed for the event link. A caller who cannot guess a
-- 256-bit token learns nothing.
create or replace function public.get_certificate_verification(p_token text)
returns table (
  certificate_type text,
  award text,
  issued_at timestamptz,
  recipient_name text,
  recipient_role text,
  recipient_title text,
  recipient_organization text,
  event_id uuid,
  event_name text,
  event_venue text,
  event_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.certificate_type,
    c.award,
    c.issued_at,
    p.name,
    p.role,
    p.title,
    p.organization,
    e.id,
    e.name,
    e.venue,
    e.date
  from public.certificates c
  join public.participants p on p.id = c.participant_id and p.event_id = c.event_id
  join public.events e on e.id = c.event_id
  where c.verification_token = p_token
  limit 1;
$$;

revoke all on function public.get_certificate_verification(text) from public;
grant execute on function public.get_certificate_verification(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pass and scan reads gain the speaker profile fields
-- ---------------------------------------------------------------------------

-- `get_participant_pass` is the single read behind both the organizer's pass
-- view and the registrant's own confirmation screen, and behind the check-in
-- scanner's lookup. Widening it means a speaker's pass and check-in screen can
-- show "Keynote Speaker" rather than only the word "Speaker", without a second
-- query or a second identity path. The two new columns are nullable, so
-- participants who are not speakers simply return null.
--
-- Dropped and recreated rather than `create or replace`d: Postgres refuses to
-- change a function's return type in place, and widening the OUT list is
-- exactly that. The grants are re-issued below because dropping the function
-- drops them with it.
drop function if exists public.get_participant_pass(uuid, text);

create function public.get_participant_pass(p_event_id uuid, p_token text)
returns table (
  id uuid,
  event_id uuid,
  name text,
  student_id text,
  course text,
  year_section text,
  role text,
  organization text,
  title text,
  qr_token text,
  checked_in_at timestamptz,
  certificate_type text,
  certificate_award text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.event_id,
    p.name,
    p.student_id,
    p.course,
    p.year_section,
    p.role,
    p.organization,
    p.title,
    p.qr_token,
    a.checked_in_at,
    c.certificate_type,
    nullif(c.award, '')
  from public.participants p
  left join public.attendance a
    on a.event_id = p.event_id and a.participant_id = p.id
  left join public.certificates c
    on c.event_id = p.event_id and c.participant_id = p.id
  where p.event_id = p_event_id
    and p.qr_token = p_token;
$$;

-- Re-issued because the drop above removed them. `anon` needs this to read a
-- pass by token; it is the same gate as in 20260926000001.
revoke all on function public.get_participant_pass(uuid, text) from public;
grant execute on function public.get_participant_pass(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private storage for organizer template artwork
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'event-templates',
    'event-templates',
    false,
    5242880,
    array['image/png']
  )
on conflict (id) do nothing;

-- Objects live at {organizer_id}/{event_id}/templates/{uuid}.png. The first
-- segment must be the caller; the second must be an event they own. Both are
-- checked, so a valid first segment alone cannot write into somebody else's
-- event folder.
create policy event_templates_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(name))[2]
        and e.organizer_id = (select auth.uid())
    )
  );

create policy event_templates_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'event-templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'event-templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(name))[2]
        and e.organizer_id = (select auth.uid())
    )
  );

create policy event_templates_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy event_templates_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
