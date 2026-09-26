-- EventKit core schema.
--
-- Trust model:
--   * anon may read published event content, register for an event, and read a
--     single pass by presenting its unguessable token. Nothing else.
--   * authenticated organizers may read and write their own events and
--     everything hanging off them.
--   * no role can update or delete attendance, so a check-in is append-only.
--
-- Every function below pins `search_path = ''` and fully qualifies its objects.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '',
  date date not null,
  start_time time not null,
  end_time time not null,
  venue text not null check (char_length(btrim(venue)) between 1 and 160),
  organizer_name text not null check (char_length(btrim(organizer_name)) between 1 and 120),
  logo_url text,
  cover_image_url text,
  map_url text,
  theme text not null default '#6d28d9' check (theme ~ '^#[0-9a-fA-F]{6}$'),
  registration_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (end_time > start_time)
);

alter table public.events enable row level security;
create index events_organizer_id_idx on public.events (organizer_id);
-- Serves the public page and the "am I the owner?" check inside every policy.
create index events_registration_open_idx on public.events (registration_open)
  where registration_open;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

revoke all on table public.events from anon, authenticated;
grant select on table public.events to anon, authenticated;
grant insert, update, delete on table public.events to authenticated;

-- A closed event is private to its organizer. Public pages get no rows for it,
-- which surfaces as NOT_FOUND rather than a forbidden response.
create policy events_select_visible
  on public.events for select to anon, authenticated
  using (registration_open or organizer_id = (select auth.uid()));

create policy events_insert_own
  on public.events for insert to authenticated
  with check (organizer_id = (select auth.uid()));

create policy events_update_own
  on public.events for update to authenticated
  using (organizer_id = (select auth.uid()))
  with check (organizer_id = (select auth.uid()));

create policy events_delete_own
  on public.events for delete to authenticated
  using (organizer_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- participants
-- ---------------------------------------------------------------------------

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  student_id text check (student_id is null or char_length(btrim(student_id)) between 1 and 40),
  email text check (
    email is null
    or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
  ),
  course text check (course is null or char_length(btrim(course)) between 1 and 80),
  year_section text check (
    year_section is null or char_length(btrim(year_section)) between 1 and 40
  ),
  role text not null default 'Student'
    check (role in ('Student', 'Speaker', 'Organizer', 'Staff', 'Guest', 'Judge')),
  -- 256 bits of entropy from two built-in UUIDs. Database-generated so an
  -- anonymous registrant can never choose their own token.
  qr_token text not null unique default (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  ),
  created_at timestamptz not null default now(),
  constraint participants_qr_token_length check (char_length(qr_token) >= 32),
  -- Lets attendance and certificates prove the participant belongs to the event.
  constraint participants_event_id_id_key unique (event_id, id)
);

alter table public.participants enable row level security;
create index participants_event_id_idx on public.participants (event_id);

-- A student cannot register twice for the same event with the same ID.
create unique index participants_event_student_id_key
  on public.participants (event_id, lower(btrim(student_id)))
  where student_id is not null;

revoke all on table public.participants from anon, authenticated;
grant select, insert, update, delete on table public.participants to authenticated;

-- Anonymous clients never read this table directly. The public pass page goes
-- through get_participant_pass(), which requires the token to be presented.
create policy participants_select_organizer
  on public.participants for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = participants.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy participants_insert_organizer
  on public.participants for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = participants.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy participants_update_organizer
  on public.participants for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = participants.event_id
        and e.organizer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = participants.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy participants_delete_organizer
  on public.participants for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = participants.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- attendance (append-only)
-- ---------------------------------------------------------------------------

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  participant_id uuid not null,
  checked_in_at timestamptz not null default now(),
  -- One row per participant per event. This is what makes check-in idempotent.
  constraint attendance_event_participant_key unique (event_id, participant_id),
  -- An attendance row can only ever point at a participant of the same event.
  constraint attendance_participant_event_fkey
    foreign key (event_id, participant_id)
    references public.participants (event_id, id)
    on delete cascade
);

alter table public.attendance enable row level security;
create index attendance_event_id_idx on public.attendance (event_id);

revoke all on table public.attendance from anon, authenticated;
grant select, insert on table public.attendance to authenticated;

create policy attendance_select_organizer
  on public.attendance for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- Insert only. A duplicate scan is absorbed by ON CONFLICT DO NOTHING and
-- resolved by reading the existing row, so no second record can be written.
create policy attendance_insert_organizer
  on public.attendance for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- Deliberately no update or delete policy: a check-in record is immutable.

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '',
  start_time time not null,
  end_time time not null,
  location text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint schedules_time_order check (end_time > start_time)
);

alter table public.schedules enable row level security;
create index schedules_event_sort_idx on public.schedules (event_id, sort_order);

revoke all on table public.schedules from anon, authenticated;
grant select on table public.schedules to anon, authenticated;
grant insert, update, delete on table public.schedules to authenticated;

create policy schedules_select_visible
  on public.schedules for select to anon, authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = schedules.event_id
        and (e.registration_open or e.organizer_id = (select auth.uid()))
    )
  );

create policy schedules_insert_organizer
  on public.schedules for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = schedules.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy schedules_update_organizer
  on public.schedules for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = schedules.event_id
        and e.organizer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = schedules.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy schedules_delete_organizer
  on public.schedules for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = schedules.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- rules
-- ---------------------------------------------------------------------------

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.rules enable row level security;
create index rules_event_sort_idx on public.rules (event_id, sort_order);

revoke all on table public.rules from anon, authenticated;
grant select on table public.rules to anon, authenticated;
grant insert, update, delete on table public.rules to authenticated;

create policy rules_select_visible
  on public.rules for select to anon, authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = rules.event_id
        and (e.registration_open or e.organizer_id = (select auth.uid()))
    )
  );

create policy rules_insert_organizer
  on public.rules for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = rules.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy rules_update_organizer
  on public.rules for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = rules.event_id
        and e.organizer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = rules.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy rules_delete_organizer
  on public.rules for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = rules.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- templates (global, read-only, seeded by this migration)
-- ---------------------------------------------------------------------------

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('badge', 'certificate', 'poster', 'photo_frame')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  preview_url text,
  template_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint templates_type_name_key unique (type, name)
);

alter table public.templates enable row level security;
create index templates_type_idx on public.templates (type);

revoke all on table public.templates from anon, authenticated;
grant select on table public.templates to anon, authenticated;

create policy templates_select_all
  on public.templates for select to anon, authenticated
  using (true);

insert into public.templates (type, name, template_config)
values
  ('badge', 'Modern', '{"orientation":"portrait","cornerRadius":24,"showQr":true,"showRole":true,"accent":"gradient"}'),
  ('badge', 'Minimal', '{"orientation":"portrait","cornerRadius":8,"showQr":true,"showRole":false,"accent":"solid"}'),
  ('badge', 'Tech', '{"orientation":"portrait","cornerRadius":16,"showQr":true,"showRole":true,"accent":"gradient","monospace":true}'),
  ('badge', 'School', '{"orientation":"portrait","cornerRadius":12,"showQr":true,"showRole":true,"accent":"solid","showYearSection":true}'),
  ('certificate', 'Classic', '{"pageSize":"A4","orientation":"landscape","border":"double","serif":true}'),
  ('certificate', 'Modern', '{"pageSize":"A4","orientation":"landscape","border":"accent","serif":false}'),
  ('certificate', 'Formal', '{"pageSize":"A4","orientation":"landscape","border":"minimal","serif":true,"showSignatory":true}'),
  ('photo_frame', 'Modern', '{"ratio":"4:5","style":"rounded","showEventName":true,"showDate":true,"showOrganizer":false}'),
  ('photo_frame', 'Retro', '{"ratio":"4:5","style":"bordered","showEventName":true,"showDate":true,"showOrganizer":true}'),
  ('photo_frame', 'Tech', '{"ratio":"4:5","style":"cutout","showEventName":true,"showDate":true,"showOrganizer":true}'),
  ('poster', 'Event Announcement', '{"ratio":"4:5","showQr":true,"headline":"You are invited"}'),
  ('poster', 'Event Reminder', '{"ratio":"4:5","showQr":true,"headline":"See you soon"}'),
  ('poster', 'Schedule', '{"ratio":"4:5","showQr":false,"headline":"Programme"}'),
  ('poster', 'Congratulations', '{"ratio":"4:5","showQr":false,"headline":"Congratulations"}'),
  ('poster', 'Thank You', '{"ratio":"4:5","showQr":false,"headline":"Thank you for coming"}');

-- ---------------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------------

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  participant_id uuid not null,
  template_id uuid references public.templates (id) on delete set null,
  certificate_type text not null default 'Participation'
    check (
      certificate_type in (
        'Participation', 'Completion', 'Recognition', 'Appreciation', 'Winner'
      )
    ),
  award text not null default '',
  signatory text not null default '',
  issued_at timestamptz not null default now(),
  -- One certificate per participant per event, so attendance certificates
  -- cannot be issued twice or to somebody who never attended.
  constraint certificates_event_participant_key unique (event_id, participant_id),
  constraint certificates_participant_event_fkey
    foreign key (event_id, participant_id)
    references public.participants (event_id, id)
    on delete cascade
);

alter table public.certificates enable row level security;
create index certificates_event_id_idx on public.certificates (event_id);

revoke all on table public.certificates from anon, authenticated;
grant select on table public.certificates to anon, authenticated;
grant insert, update, delete on table public.certificates to authenticated;

create policy certificates_select_organizer
  on public.certificates for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = certificates.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

create policy certificates_insert_organizer
  on public.certificates for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = certificates.event_id
        and e.organizer_id = (select auth.uid())
    )
    -- Attendance guard. Enforced in the data policy, not only in the UI, so no
    -- unregistered or non-attending participant can be issued a certificate
    -- even by a direct API call.
    and exists (
      select 1 from public.attendance a
      where a.event_id = certificates.event_id
        and a.participant_id = certificates.participant_id
    )
  );

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
  );

create policy certificates_delete_organizer
  on public.certificates for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = certificates.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Public entry points (security definer: they carry their own authorization)
-- ---------------------------------------------------------------------------

-- Anonymous registration. Validation is duplicated in the table constraints on
-- purpose: this function is the trust boundary for untrusted input.
create or replace function public.register_participant(
  p_event_id uuid,
  p_name text,
  p_student_id text default null,
  p_course text default null,
  p_year_section text default null,
  p_email text default null
)
returns table (id uuid, qr_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_token text;
begin
  if not exists (
    select 1 from public.events e
    where e.id = p_event_id and e.registration_open
  ) then
    raise exception 'REGISTRATION_CLOSED' using errcode = 'no_data_found';
  end if;

  insert into public.participants (event_id, name, student_id, course, year_section, email)
  values (
    p_event_id,
    btrim(p_name),
    nullif(btrim(p_student_id), ''),
    nullif(btrim(p_course), ''),
    nullif(btrim(p_year_section), ''),
    nullif(btrim(p_email), '')
  )
  returning participants.id, participants.qr_token into v_id, v_token;

  return query select v_id, v_token;
end;
$$;

-- Reads exactly one participant, and only when the caller presents that
-- participant's unguessable token for the same event. Email is never returned.
create or replace function public.get_participant_pass(p_event_id uuid, p_token text)
returns table (
  id uuid,
  event_id uuid,
  name text,
  student_id text,
  course text,
  year_section text,
  role text,
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

revoke all on function public.register_participant(uuid, text, text, text, text, text) from public;
grant execute on function public.register_participant(uuid, text, text, text, text, text)
  to anon, authenticated;

revoke all on function public.get_participant_pass(uuid, text) from public;
grant execute on function public.get_participant_pass(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'event-assets',
    'event-assets',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  ),
  (
    'participant-photos',
    'participant-photos',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do nothing;

-- Objects live at {organizer_id}/{event_id}/{random}.{ext}, so the first path
-- segment is the owner. Names are generated server-side and never reused.
create policy event_assets_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy event_assets_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'event-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'event-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy event_assets_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy participant_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'participant-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy participant_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'participant-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'participant-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy participant_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'participant-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
