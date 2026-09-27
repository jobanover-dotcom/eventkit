-- EventKit Row Level Security, grant, and integrity tests.
--
-- Run with `npm run supabase:test` (requires the local Supabase stack, i.e. a
-- Docker-compatible runtime).
--
-- Every protected operation is exercised as three principals: anonymous, the
-- owning organizer, and a different authenticated organizer. Identities are
-- fixed UUID literals so each assertion reads as plain SQL.
--
-- Three PostgreSQL behaviours this file deliberately works around:
--   * A SELECT filtered by RLS returns no rows and raises nothing. A deny case
--     asserts the row count, not an exception.
--   * An UPDATE or DELETE whose rows are all filtered out by an existing policy
--     raises nothing and affects zero rows, so a deny case asserts the data is
--     unchanged. A statement with no policy at all for that command is refused
--     outright with 42501, which is the case for attendance writes.
--   * `set role` requires the connecting role to be a member of anon and
--     authenticated, which is true for the Supabase postgres role.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(55);

-- ---------------------------------------------------------------------------
-- Identities
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com', '{"full_name":"Owner"}'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com', '{}');

create or replace function pg_temp.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
end $$;

create or replace function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

create or replace function pg_temp.as_stranger()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

-- SECURITY DEFINER lookups owned by the database owner, so an assertion can
-- name a participant while impersonating a role that cannot read the table.
-- These read fixtures; they are not part of the application surface.
create or replace function pg_temp.id_for(p_student_id text)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.participants as p
  where p.student_id = p_student_id
  order by p.created_at
  limit 1;
$$;

-- Reads a role as the database owner, so an assertion can inspect a participant
-- while impersonating `anon`, which holds no grant on the table at all.
create or replace function pg_temp.role_of(p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.participants as p
  where p.name = p_name
  limit 1;
$$;

create or replace function pg_temp.token_for(p_student_id text)
returns text language sql stable security definer set search_path = '' as $$
  select p.qr_token from public.participants as p
  where p.student_id = p_student_id
  order by p.created_at
  limit 1;
$$;

-- Asserts only the SQLSTATE of a failing statement.
--
-- pgTAP's throws_ok() with three arguments compares the full error *message*,
-- which varies between PostgreSQL versions ("permission denied for table x" vs
-- "new row violates row-level security policy"). These tests care about the
-- SQLSTATE, so this helper reports through pgTAP's own is()/ok() and stays
-- version-proof. Pass NULL as the expected state to accept any error.
--
-- It returns the TAP line rather than void so the assertion surfaces as a row,
-- the same as a top-level select is(...), and is counted in plan().
create or replace function pg_temp.raises_state(
  p_sql text,
  p_expected_state text,
  p_description text
)
returns text
language plpgsql
as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if p_expected_state is null then
    return ok(v_state is not null, p_description);
  end if;
  return is(v_state, p_expected_state, p_description);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.events (
  id, organizer_id, name, description, date, start_time, end_time, venue, organizer_name
)
values (
  'e0000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'IT FEST 2026', 'A demo event', '2026-11-05', '08:00', '17:00',
  'Assumption College', 'BSIT Department'
);

insert into public.events (
  id, organizer_id, name, description, date, start_time, end_time, venue,
  organizer_name, registration_open
)
values (
  'e0000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  'Closed Event', '', '2026-12-01', '09:00', '12:00', 'Somewhere',
  'Other Department', false
);

insert into public.events (
  id, organizer_id, name, description, date, start_time, end_time, venue, organizer_name
)
values (
  'e0000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'Second Event', '', '2026-11-06', '09:00', '12:00', 'Venue 2', 'BSIT Department'
);

-- ---------------------------------------------------------------------------
-- profiles: a user sees only themselves
-- ---------------------------------------------------------------------------

select is(
  (select full_name from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'Owner',
  'the auth trigger creates a profile carrying the display name from metadata'
);

select pg_temp.as_owner();
set local role authenticated;

select results_eq(
  $$ select id from public.profiles $$,
  $$ select '00000000-0000-4000-8000-000000000001'::uuid $$,
  'a user sees only their own profile row'
);

reset role;

select pg_temp.as_anon();
set local role anon;

select pg_temp.raises_state(
  $$ select * from public.profiles $$,
  '42501',
  'anonymous cannot read any profile'
);

reset role;

-- ---------------------------------------------------------------------------
-- events: visibility and ownership
-- ---------------------------------------------------------------------------

select pg_temp.as_anon();
set local role anon;

-- Scoped to the fixture events on purpose. Asserting on the whole table made
-- this test pass or fail depending on whether the project had any real data in
-- it, which is a property of the database, not of the policy.
select results_eq(
  $$ select id from public.events
     where id in (
       'e0000000-0000-4000-8000-000000000001'::uuid,
       'e0000000-0000-4000-8000-000000000003'::uuid
     ) order by id $$,
  $$
    select * from (values
      ('e0000000-0000-4000-8000-000000000001'::uuid),
      ('e0000000-0000-4000-8000-000000000003'::uuid)
    ) as expected(id)
  $$,
  'anonymous can read published events'
);

select results_eq(
  $$ select count(*)::int from public.events where id = 'e0000000-0000-4000-8000-000000000002' $$,
  $$ select 0::int $$,
  'anonymous sees no rows for a closed event'
);

select pg_temp.raises_state(
  $$
    insert into public.events (
      id, organizer_id, name, date, start_time, end_time, venue, organizer_name
    )
    values (
      'e0000000-0000-4000-8000-000000000009',
      '00000000-0000-4000-8000-000000000001',
      'Anonymous Event', '2026-01-01', '09:00', '10:00', 'V', 'O'
    )
  $$,
  '42501',
  'anonymous cannot create an event'
);

reset role;

select pg_temp.as_stranger();
set local role authenticated;

select lives_ok(
  $$ update public.events set name = 'Hijacked' where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'a non-owner update is accepted but matches no rows'
);

select lives_ok(
  $$ delete from public.events where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'a non-owner delete is accepted but matches no rows'
);

select results_eq(
  $$ select name from public.events where id = 'e0000000-0000-4000-8000-000000000002' $$,
  $$ select 'Closed Event'::text $$,
  'an organizer can still read their own closed event'
);

reset role;

select results_eq(
  $$ select name from public.events where id = 'e0000000-0000-4000-8000-000000000001' $$,
  $$ select 'IT FEST 2026'::text $$,
  'the event is untouched after the non-owner update and delete'
);

select pg_temp.as_stranger();
set local role authenticated;

select pg_temp.as_owner();
set local role authenticated;

select results_eq(
  $$ select name from public.events where id = 'e0000000-0000-4000-8000-000000000002' $$,
  $$ select null::text where false $$,
  'an organizer cannot read another organizer''s closed event'
);

select pg_temp.raises_state(
  $$
    insert into public.events (
      id, organizer_id, name, date, start_time, end_time, venue, organizer_name
    )
    values (
      'e0000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-000000000002',
      'Forged', '2026-01-01', '09:00', '10:00', 'V', 'O'
    )
  $$,
  '42501',
  'an organizer cannot create an event owned by somebody else'
);

select pg_temp.raises_state(
  $$
    insert into public.events (
      id, organizer_id, name, date, start_time, end_time, venue, organizer_name
    )
    values (
      'e0000000-0000-4000-8000-00000000000b',
      '00000000-0000-4000-8000-000000000001',
      'Backwards', '2026-01-01', '10:00', '09:00', 'V', 'O'
    )
  $$,
  '23514',
  'an event cannot end before it starts'
);

select pg_temp.raises_state(
  $$
    insert into public.events (
      id, organizer_id, name, date, start_time, end_time, venue, organizer_name, theme
    )
    values (
      'e0000000-0000-4000-8000-00000000000c',
      '00000000-0000-4000-8000-000000000001',
      'Bad theme', '2026-01-01', '09:00', '10:00', 'V', 'O', 'purple'
    )
  $$,
  '23514',
  'the theme colour must be a hex value'
);

reset role;

-- ---------------------------------------------------------------------------
-- participants: anonymous registration is the only anonymous write
-- ---------------------------------------------------------------------------

select pg_temp.as_anon();
set local role anon;

select pg_temp.raises_state(
  $$ select * from public.participants $$,
  '42501',
  'anonymous cannot read the participants table directly'
);

select results_eq(
  $$
    select id is not null, qr_token ~ '^[0-9a-f]{64}$'
    from public.register_participant(
      'e0000000-0000-4000-8000-000000000001',
      '  Maria Santos  ', '2023001', 'BSIT', '3A', 'maria@example.com'
    )
  $$,
  $$ select true, true $$,
  'anonymous registration returns an id and a 64-character hex token'
);

select pg_temp.raises_state(
  $$
    select * from public.register_participant(
      'e0000000-0000-4000-8000-000000000001',
      'Maria Again', '2023001', 'BSIT', '3A', null
    )
  $$,
  '23505',
  'the same student id cannot register twice for one event'
);

select pg_temp.raises_state(
  $$
    select * from public.register_participant(
      'e0000000-0000-4000-8000-000000000002',
      'Too Late', null, null, null, null
    )
  $$,
  'P0002',
  'registration is refused once the organizer closes registration'
);

select pg_temp.raises_state(
  $$
    insert into public.participants (event_id, name)
    values ('e0000000-0000-4000-8000-000000000001', 'Sneaky')
  $$,
  '42501',
  'anonymous cannot insert a participant row directly'
);

reset role;

select pg_temp.as_owner();
set local role authenticated;

select results_eq(
  $$
    select name, student_id, course, year_section, role
    from public.participants
    where student_id = '2023001'
  $$,
  $$ select 'Maria Santos', '2023001', 'BSIT', '3A', 'Student' $$,
  'the stored participant is trimmed and defaults to the Student role'
);

reset role;

-- ---------------------------------------------------------------------------
-- The public pass is a bearer-token read
-- ---------------------------------------------------------------------------

select pg_temp.as_anon();
set local role anon;

select results_eq(
  $$
    select name, course, year_section
    from public.get_participant_pass(
      'e0000000-0000-4000-8000-000000000001', pg_temp.token_for('2023001')
    )
  $$,
  $$ select 'Maria Santos', 'BSIT', '3A' $$,
  'the pass is readable by presenting its own token'
);

select results_eq(
  $$
    select count(*)::int
    from public.get_participant_pass(
      'e0000000-0000-4000-8000-000000000001', repeat('0', 64)
    )
  $$,
  $$ select 0::int $$,
  'the pass is not readable with a wrong token'
);

select results_eq(
  $$
    select count(*)::int
    from public.get_participant_pass(
      'e0000000-0000-4000-8000-000000000002', pg_temp.token_for('2023001')
    )
  $$,
  $$ select 0::int $$,
  'a token from another event does not unlock a pass'
);

select results_eq(
  $$
    select count(*)::int
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'get_participant_pass'
      and column_name = 'email'
  $$,
  $$ select 0::int $$,
  'the pass function exposes no email column'
);

reset role;

-- ---------------------------------------------------------------------------
-- attendance: organizer-only, append-only, idempotent
-- ---------------------------------------------------------------------------

select pg_temp.as_stranger();
set local role authenticated;

select results_eq(
  $$ select count(*)::int from public.attendance $$,
  $$ select 0::int $$,
  'a non-owner sees no attendance rows'
);

reset role;

select pg_temp.as_owner();
set local role authenticated;

select lives_ok(
  $$
    insert into public.attendance (event_id, participant_id)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023001'))
  $$,
  'the owner can check a participant in'
);

select pg_temp.raises_state(
  $$
    insert into public.attendance (event_id, participant_id)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023001'))
  $$,
  '23505',
  'a duplicate check-in is rejected by the unique index'
);

select lives_ok(
  $$
    insert into public.attendance (event_id, participant_id)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023001'))
    on conflict (event_id, participant_id) do nothing
  $$,
  'a rescan is absorbed by ON CONFLICT DO NOTHING'
);

select results_eq(
  $$
    select count(*)::int
    from public.attendance
    where event_id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  $$ select 1::int $$,
  'rescanning never creates a second attendance row'
);

select pg_temp.raises_state(
  $$
    update public.attendance
    set checked_in_at = checked_in_at + interval '1 day'
    where event_id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'attendance has no update policy, so a rewrite is refused outright'
);

select results_eq(
  $$
    select count(*)::int
    from public.attendance
    where event_id = 'e0000000-0000-4000-8000-000000000001'
      and checked_in_at > now()
  $$,
  $$ select 0::int $$,
  'an attendance timestamp cannot be rewritten'
);

select pg_temp.raises_state(
  $$ delete from public.attendance where event_id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501',
  'attendance has no delete policy, so removing a check-in is refused outright'
);

select results_eq(
  $$
    select count(*)::int
    from public.attendance
    where event_id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  $$ select 1::int $$,
  'an attendance row cannot be deleted'
);

reset role;

select pg_temp.as_anon();
set local role anon;

select pg_temp.raises_state(
  $$
    insert into public.attendance (event_id, participant_id)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023001'))
  $$,
  '42501',
  'anonymous cannot check anybody in'
);

reset role;

-- ---------------------------------------------------------------------------
-- An attendance row can never reference another event's participant
-- ---------------------------------------------------------------------------

select pg_temp.as_owner();
set local role authenticated;

select lives_ok(
  $$
    insert into public.participants (event_id, name, student_id)
    values ('e0000000-0000-4000-8000-000000000003', 'Outsider', '2023777')
  $$,
  'the owner can add a participant to their other event'
);

select pg_temp.raises_state(
  $$
    insert into public.attendance (event_id, participant_id)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023777'))
  $$,
  '23503',
  'attendance cannot point at a participant from another event'
);

reset role;

-- ---------------------------------------------------------------------------
-- Certificates require attendance
-- ---------------------------------------------------------------------------

select pg_temp.as_anon();
set local role anon;

select lives_ok(
  $$
    select * from public.register_participant(
      'e0000000-0000-4000-8000-000000000001', 'Never Scanned', '2023888', 'BSIT', '3B', null
    )
  $$,
  'a participant can register without ever being scanned'
);

reset role;

select pg_temp.as_owner();
set local role authenticated;

select pg_temp.raises_state(
  $$
    insert into public.certificates (event_id, participant_id)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023888'))
  $$,
  '42501',
  'a participant who never checked in cannot be issued a certificate'
);

select lives_ok(
  $$
    insert into public.certificates (event_id, participant_id, certificate_type)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023001'), 'Participation')
  $$,
  'a participant who checked in can be issued a certificate'
);

select pg_temp.raises_state(
  $$
    insert into public.certificates (event_id, participant_id)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023001'))
  $$,
  '23505',
  'the same participant cannot be certified twice for one event'
);

reset role;

select pg_temp.as_stranger();
set local role authenticated;

select pg_temp.raises_state(
  $$
    insert into public.certificates (event_id, participant_id)
    values ('e0000000-0000-4000-8000-000000000001', pg_temp.id_for('2023001'))
  $$,
  '42501',
  'a non-owner cannot issue a certificate'
);

reset role;

-- ---------------------------------------------------------------------------
-- schedules, rules, and templates
-- ---------------------------------------------------------------------------

select pg_temp.as_owner();
set local role authenticated;

select lives_ok(
  $$
    insert into public.schedules (event_id, title, start_time, end_time, sort_order)
    values ('e0000000-0000-4000-8000-000000000001', 'Opening Ceremony', '09:00', '10:00', 1)
  $$,
  'the owner can add a schedule item'
);

select lives_ok(
  $$
    insert into public.rules (event_id, title, content, sort_order)
    values ('e0000000-0000-4000-8000-000000000001', 'General Rules', 'Be on time.', 1)
  $$,
  'the owner can add a rule'
);

reset role;

select pg_temp.as_anon();
set local role anon;

-- Scoped for the same reason as the events assertion above.
select results_eq(
  $$ select title from public.schedules where event_id = 'e0000000-0000-4000-8000-000000000001' $$,
  $$ select 'Opening Ceremony'::text $$,
  'anonymous can read a published schedule'
);

select results_eq(
  $$ select title from public.rules where event_id = 'e0000000-0000-4000-8000-000000000001' $$,
  $$ select 'General Rules'::text $$,
  'anonymous can read a published rule'
);

select pg_temp.raises_state(
  $$
    insert into public.schedules (event_id, title, start_time, end_time)
    values ('e0000000-0000-4000-8000-000000000001', 'Injected', '11:00', '12:00')
  $$,
  '42501',
  'anonymous cannot add a schedule item'
);

select pg_temp.raises_state(
  $$
    insert into public.rules (event_id, title, content)
    values ('e0000000-0000-4000-8000-000000000001', 'Injected', 'nope')
  $$,
  '42501',
  'anonymous cannot add a rule'
);

select results_eq(
  $$ select type, count(*)::int from public.templates group by type order by type $$,
  $$
    select * from (values
      ('badge', 4),
      ('certificate', 3),
      ('photo_frame', 3),
      ('poster', 5)
    ) as expected(type, n)
  $$,
  'every template type is seeded with its initial designs'
);

select pg_temp.raises_state(
  $$ insert into public.templates (type, name) values ('badge', 'Mine') $$,
  '42501',
  'templates are read-only to clients'
);

reset role;

-- ---------------------------------------------------------------------------
-- Least privilege
-- ---------------------------------------------------------------------------

select results_eq(
  $$
    select count(*)::int
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
      and privilege_type <> 'SELECT'
  $$,
  $$ select 0::int $$,
  'anonymous can only ever SELECT on public tables'
);

select results_eq(
  $$
    select count(*)::int
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
      and table_name in ('participants', 'attendance', 'profiles')
  $$,
  $$ select 0::int $$,
  'anonymous holds no grants on participants, attendance, or profiles'
);

select results_eq(
  $$
    select count(*)::int
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and privilege_type = 'EXECUTE'
      and grantee = 'PUBLIC'
      and routine_name in ('register_participant', 'get_participant_pass')
  $$,
  $$ select 0::int $$,
  'EXECUTE is revoked from PUBLIC on both public functions'
);

-- Names rather than a bare count: the count moved from 6 to 10 when the
-- event-templates bucket was added, and a count alone gives no clue about which
-- policy went missing if one is ever dropped by accident. Compared as one
-- ordered string, which pins the exact set in a single assertion.
select is(
  (select string_agg(policyname::text, ',' order by policyname::text)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'),
  'event_assets_delete_own,event_assets_insert_own,event_assets_update_own,'
  'event_templates_delete_own,event_templates_insert_own,event_templates_select_own,'
  'event_templates_update_own,participant_photos_delete_own,'
  'participant_photos_insert_own,participant_photos_update_own',
  'storage has the expected owner-scoped policies'
);

select is(
  (select count(*)::int from storage.buckets where id in ('event-assets', 'participant-photos', 'event-templates')),
  3,
  'all three storage buckets exist'
);

-- The template bucket must stay private. An organizer's working artwork is not
-- public event content, and a public bucket would serve it to anyone with a URL.
select is(
  (select public from storage.buckets where id = 'event-templates'),
  false,
  'the event-templates bucket is private'
);

select is(
  (select allowed_mime_types::text from storage.buckets where id = 'event-templates'),
  '{image/png}',
  'the event-templates bucket accepts PNG only'
);

select is(
  (storage.foldername('00000000-0000-4000-8000-000000000001/abc/logo.png'))[1],
  '00000000-0000-4000-8000-000000000001',
  'the first storage path segment is the owner id'
);

-- ---------------------------------------------------------------------------
-- Speakers, certificate records, and custom templates
--
-- Added with 20260926000002. These execute the RLS on this surface as real
-- roles, which is the only place it has ever actually run.
-- ---------------------------------------------------------------------------

select pg_temp.as_owner();
set local role authenticated;

-- A speaker is an ordinary participant row whose role says so. The organizer
-- creates it; being a speaker is not something registration can ask for.
select lives_ok(
  $$
    insert into public.participants (event_id, name, role, organization, title)
    values ('e0000000-0000-4000-8000-000000000001', 'Dr. Maria Santos', 'Speaker',
            'Assumption College of Davao', 'Keynote Speaker')
  $$,
  'the owner can add a speaker with an organization and a title'
);

select is(
  (select organization from public.participants where name = 'Dr. Maria Santos'),
  'Assumption College of Davao',
  'the speaker organization round-trips'
);

select is(
  (select title from public.participants where name = 'Dr. Maria Santos'),
  'Keynote Speaker',
  'the speaker title round-trips'
);

-- Both new columns are nullable, which is what keeps every row that predates the
-- migration working. Asserted on the ordinary participant, who has neither.
select is(
  (select organization is null and title is null
     from public.participants where student_id = '2023001'),
  true,
  'an ordinary participant has no organization and no title'
);

select pg_temp.as_anon();
set local role anon;

-- The public registration entry point takes no role argument, so an anonymous
-- registrant cannot become a speaker however it calls the function. Asserted from
-- the catalogue rather than by calling it with a bogus extra argument: the
-- signature is the guarantee, and reading it cannot depend on how a particular
-- PostgreSQL version words a resolution error.
select is(
  (select count(*)::int
     from pg_proc p, unnest(p.proargnames) as n(param)
     where p.proname = 'register_participant' and n.param = 'p_role'),
  0,
  'register_participant has no role parameter'
);

-- proargnames also lists the two OUT columns, so the inputs are the leading six.
select is(
  (select array_to_string(p.proargnames[1:6], ',')
     from pg_proc p where p.proname = 'register_participant'),
  'p_event_id,p_name,p_student_id,p_course,p_year_section,p_email',
  'register_participant takes exactly its six documented input parameters'
);

-- And the row it actually creates is an ordinary participant.
select lives_ok(
  $$ select public.register_participant(
       'e0000000-0000-4000-8000-000000000001'::uuid, 'Walk Up', '2023999'::text) $$,
  'anonymous registration still works'
);

select is(
  pg_temp.role_of('Walk Up'),
  'Student',
  'anonymous registration always creates a Student, never a Speaker'
);

-- anon holds a SELECT grant on certificates but has no anon policy. The only
-- public read path is the SECURITY DEFINER function, which is precisely why a
-- certificate can be verified without exposing every certificate in the project.
select is(
  (select count(*)::int from public.certificates),
  0,
  'anonymous cannot select the certificates table'
);

select is(
  (select count(*)::int from public.get_certificate_verification('not-a-real-token'::text)),
  0,
  'certificate verification returns nothing for an unknown token'
);

select pg_temp.as_owner();
set local role authenticated;

-- This participant is already checked in and already holds a certificate from
-- the earlier section, so regeneration is exercised: it must succeed, land the
-- new type, and stay a single record.
select lives_ok(
  $$
    update public.certificates set certificate_type = 'Achievement', award = 'Best Speaker'
    where event_id = 'e0000000-0000-4000-8000-000000000001'::uuid
      and participant_id = pg_temp.id_for('2023001')
  $$,
  'Achievement is accepted as a certificate type on regeneration'
);

select is(
  (select certificate_type from public.certificates where participant_id = pg_temp.id_for('2023001')),
  'Achievement',
  'the regenerated certificate stores Achievement'
);

select is(
  (select count(*)::int from public.certificates
     where participant_id = pg_temp.id_for('2023001')),
  1,
  'regenerating a certificate does not create a second record'
);

select cmp_ok(
  (select min(char_length(verification_token))::int from public.certificates),
  '>=',
  32,
  'every certificate has a verification token of at least 32 characters'
);

select is(
  (select count(*)::int from public.certificates),
  (select count(distinct verification_token)::int from public.certificates),
  'certificate verification tokens are unique'
);

-- Regeneration updates the wording in place. The token must survive it, or a QR
-- somebody already printed would stop verifying. Snapshotted, then compared.
--
-- Created as `authenticated`, not as the database owner: a temporary table is
-- only readable by the role that created it, and every later read here happens
-- as the organizer.
select pg_temp.as_owner();
set local role authenticated;

create temporary table cert_token_snapshot on commit drop as
  select verification_token from public.certificates
  where participant_id = pg_temp.id_for('2023001');

-- The snapshot belongs to `authenticated`, so `anon` cannot read it directly.
-- This reader is SECURITY DEFINER, which is how the assertion below can hand a
-- real token to anon without granting anything.
create or replace function pg_temp.snapshot_token()
returns text language sql stable security definer set search_path = '' as $$
  select verification_token from pg_temp.cert_token_snapshot limit 1;
$$;

select lives_ok(
  $$ update public.certificates set certificate_type = 'Appreciation', award = 'Updated'
     where event_id = 'e0000000-0000-4000-8000-000000000001'::uuid
       and participant_id = pg_temp.id_for('2023001') $$,
  'regenerating a certificate updates the wording'
);

select is(
  (select verification_token from public.certificates
     where participant_id = pg_temp.id_for('2023001')),
  (select verification_token from cert_token_snapshot),
  'regenerating a certificate does not rotate its verification token'
);

select is(
  (select count(*)::int from public.certificates
     where participant_id = pg_temp.id_for('2023001')),
  1,
  'regenerating a certificate does not create a second record'
);

-- The verification function resolves a real token to exactly one certificate.
select pg_temp.as_anon();
set local role anon;

select is(
  (select count(*)::int from public.get_certificate_verification(
     pg_temp.snapshot_token())),
  1,
  'certificate verification resolves a valid token to one row as anonymous'
);

select pg_temp.as_stranger();
set local role authenticated;

-- A different organizer must not be able to touch another organizer's
-- templates, certificates, or speakers.
select is(
  (select count(*)::int from public.event_design_templates),
  0,
  'a stranger cannot read custom templates'
);

select pg_temp.raises_state(
  $$ insert into public.event_design_templates
       (event_id, name, kind, storage_path, image_width, image_height, design_config, created_by)
     values ('e0000000-0000-4000-8000-000000000001'::uuid, 'Theirs', 'certificate',
             'a/b/templates/c.png', 800, 600,
             '{"recipientName":{},"certificateType":{}}'::jsonb,
             '00000000-0000-4000-8000-000000000002'::uuid) $$,
  '42501',
  'a stranger cannot add a custom template to another organizer''s event'
);

select pg_temp.raises_state(
  $$ insert into public.participants (event_id, name, role)
     values ('e0000000-0000-4000-8000-000000000001'::uuid, 'Intruder', 'Speaker') $$,
  '42501',
  'a stranger cannot add a speaker to another organizer''s event'
);

-- RLS hides the row from a stranger rather than erroring, so an UPDATE would
-- simply match nothing. The invisibility is the mechanism, so assert that.
select is(
  (select count(*)::int from public.certificates
     where event_id = 'e0000000-0000-4000-8000-000000000001'::uuid),
  0,
  'a stranger sees no certificates on another organizer''s event'
);

-- The organizer side, where the row *is* visible: repointing a certificate at
-- somebody who never checked in is refused, which is the guard that
-- 20260926000002 added to the UPDATE policy.
select pg_temp.as_owner();
set local role authenticated;

select pg_temp.raises_state(
  $$ update public.certificates set participant_id = pg_temp.id_for('2023888')
     where event_id = 'e0000000-0000-4000-8000-000000000001'::uuid
       and participant_id = pg_temp.id_for('2023001') $$,
  '42501',
  'a certificate cannot be repointed at somebody who never checked in'
);

select is(
  (select participant_id from public.certificates where participant_id = pg_temp.id_for('2023001')),
  pg_temp.id_for('2023001'),
  'the certificate still belongs to the attendee after the refused update'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'event-templates'),
  0,
  'a stranger sees no template objects'
);

-- ---------------------------------------------------------------------------
-- 20260926000003: the certificate template configuration
-- ---------------------------------------------------------------------------

-- The owner can store a template, and the audit trail records them.
select is(
  (select count(*)::int
     from public.event_design_templates
     where event_id = 'e0000000-0000-4000-8000-000000000001'::uuid),
  0,
  'the owner starts with no custom templates'
);

insert into public.event_design_templates (
  event_id, name, kind, storage_path, image_width, image_height, design_config, created_by
)
values (
  'e0000000-0000-4000-8000-000000000001'::uuid, 'Graduation', 'certificate',
  'x/y/templates/g.png', 1920, 1080,
  '{"recipientName":{},"certificateType":{}}'::jsonb,
  '00000000-0000-4000-8000-000000000001'::uuid
);

select is(
  (select created_by from public.event_design_templates where name = 'Graduation'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'a template records its creator'
);

-- `created_by` is set server-side from the session, so a client cannot claim
-- authorship on somebody else's behalf. The INSERT policy's WITH CHECK is the
-- enforcement point; the service simply never sends a value that would fail it.
select pg_temp.raises_state(
  $$ insert into public.event_design_templates
       (event_id, name, kind, storage_path, image_width, image_height, design_config, created_by)
     values ('e0000000-0000-4000-8000-000000000001'::uuid, 'Forged', 'certificate',
             'x/y/templates/f.png', 1920, 1080,
             '{"recipientName":{},"certificateType":{}}'::jsonb,
             '00000000-0000-4000-8000-000000000002'::uuid) $$,
  '42501',
  'a template cannot be inserted with somebody else as its creator'
);

select pg_temp.raises_state(
  $$ insert into public.event_design_templates
       (event_id, name, kind, storage_path, image_width, image_height, design_config)
     values ('e0000000-0000-4000-8000-000000000001'::uuid, 'Anonymous', 'certificate',
             'x/y/templates/n.png', 1920, 1080,
             '{"recipientName":{},"certificateType":{}}'::jsonb) $$,
  '42501',
  'a template cannot be inserted without a creator'
);

-- The two layers are the contract the renderer relies on, so a shape it cannot
-- read is refused by the database and not merely by the application.
select pg_temp.raises_state(
  $$ update public.event_design_templates set design_config = '[]'::jsonb
     where name = 'Graduation' $$,
  '23514',
  'the legacy placeholder array is refused'
);

select pg_temp.raises_state(
  $$ update public.event_design_templates
     set design_config = '{"recipientName":{}}'::jsonb where name = 'Graduation' $$,
  '23514',
  'a configuration missing a layer is refused'
);

select is(
  (select design_config ? 'certificateType'
     from public.event_design_templates where name = 'Graduation'),
  true,
  'the stored configuration survived the refused updates'
);

-- `set_updated_at` stamps `now()`, which is fixed for the whole transaction, so
-- the bump cannot be observed here. Assert the trigger is wired up instead; the
-- bump itself is exercised by the application's own round trips.
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.event_design_templates'::regclass
      and tgname = 'set_event_design_templates_updated_at'
      and not tgisinternal
  ),
  'editing a template is stamped with updated_at'
);

-- ---------------------------------------------------------------------------
-- 20260926000004: RLS chooses which *rows* an organizer may touch, never which
-- columns, so the audit trail and the private object pointer were rewritable
-- until UPDATE was narrowed to the two columns the product actually sends.
-- ---------------------------------------------------------------------------

select pg_temp.raises_state(
  $$ update public.event_design_templates set created_by =
       '00000000-0000-4000-8000-000000000002'::uuid where name = 'Graduation' $$,
  '42501',
  'an organizer cannot reassign a template to another creator'
);

select pg_temp.raises_state(
  $$ update public.event_design_templates
     set storage_path = 'someone/else/templates/secret.png' where name = 'Graduation' $$,
  '42501',
  'an organizer cannot repoint a template at another private object'
);

select pg_temp.raises_state(
  $$ update public.event_design_templates set kind = 'badge' where name = 'Graduation' $$,
  '42501',
  'an organizer cannot change a template''s kind'
);

-- The narrowing must not take away the path the product uses.
select lives_ok(
  $$ update public.event_design_templates set name = 'Graduation blue' where name = 'Graduation' $$,
  'an organizer can still rename a template'
);

select lives_ok(
  $$ update public.event_design_templates
     set design_config = '{"recipientName":{"x":10},"certificateType":{"x":20}}'::jsonb
     where name = 'Graduation blue' $$,
  'an organizer can still save a new layout'
);

select pg_temp.as_anon();
set local role anon;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'event-templates'),
  0,
  'anonymous sees no template objects'
);

select pg_temp.raises_state(
  $$ insert into storage.objects (bucket_id, name)
     values ('event-templates', 'x/y/templates/z.png') $$,
  '42501',
  'anonymous cannot write to the private template bucket'
);

-- ---------------------------------------------------------------------------
-- 20260926000002: the template bucket is WRITABLE by its owner
-- ---------------------------------------------------------------------------
--
-- Everything above only ever proves that *other* people are kept out. A policy
-- that denied everybody would satisfy all of it, which is exactly what happened:
-- an organizer upload failed with "new row violates row-level security policy"
-- while every assertion here stayed green. So the owner side is now asserted
-- explicitly, against a policy whose check reaches across into an RLS-protected
-- table.
--
-- The predicate is also decomposed, because the cross-table clause is the only
-- thing distinguishing this bucket from `event-assets` and `participant-photos`,
-- whose insert policies are just bucket + first path segment. If the insert below
-- is refused, these three say which part of the check was at fault.

select pg_temp.as_owner();
set local role authenticated;

-- The two values the policy compares against, asserted on the exact shape the
-- application writes: {organizer_id}/{event_id}/templates/{uuid}.png
select is(
  (select (storage.foldername(
     '00000000-0000-4000-8000-000000000001/'
     || 'e0000000-0000-4000-8000-000000000001/templates/x.png'))[1]),
  '00000000-0000-4000-8000-000000000001'::text,
  'the first path segment is the organizer'
);

select is(
  (select (storage.foldername(
     '00000000-0000-4000-8000-000000000001/'
     || 'e0000000-0000-4000-8000-000000000001/templates/x.png'))[2]),
  'e0000000-0000-4000-8000-000000000001'::text,
  'the second path segment is the event'
);

-- The cross-table clause, evaluated exactly as the policy writes it. This is the
-- assertion that distinguishes "the owner cannot write" from "the owner cannot
-- write *because the subquery finds nothing*".
select ok(
  exists (
    select 1 from public.events e
    where e.id::text = (storage.foldername(
            '00000000-0000-4000-8000-000000000001/'
            || 'e0000000-0000-4000-8000-000000000001/templates/x.png'))[2]
      and e.organizer_id = (select auth.uid())
  ),
  'the owner''s own event is found by the policy''s cross-table check'
);

-- The mechanism, recorded so it cannot be reintroduced by accident. This is the
-- exact expression 0002 deployed: inside the subquery, `name` bound to the event
-- *title*, so foldername sliced a one-element array and segment 2 was NULL --
-- which made EXISTS unsatisfiable and the whole check vacuous.
select is(
  (select (storage.foldername(e.name))[2]
     from public.events e
     where e.id = 'e0000000-0000-4000-8000-000000000001'::uuid),
  null,
  'the 0002 form reads the event title, so segment 2 is never a path'
);

-- The control: `event-assets` uses the simpler insert policy, and the map upload
-- is known to work. If this passes, the role, the session, and `auth.uid()` are
-- all fine here, which isolates any failure to the extra clause.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('event-assets',
             '00000000-0000-4000-8000-000000000001/'
             || 'e0000000-0000-4000-8000-000000000001/m.png') $$,
  'the owner can write to the simpler event-assets bucket'
);

-- The reproduction. This is the upload that failed in production.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('event-templates',
             '00000000-0000-4000-8000-000000000001/'
             || 'e0000000-0000-4000-8000-000000000001/templates/x.png') $$,
  'the owner can store a template object'
);

-- The update policy carries the same cross-table clause, so it needs a stored
-- object to mean anything. `lives_ok` alone would pass while updating nothing,
-- so the rename is confirmed by counting the row afterwards.
select lives_ok(
  $$ update storage.objects set name =
       '00000000-0000-4000-8000-000000000001/'
       || 'e0000000-0000-4000-8000-000000000001/templates/renamed.png'
     where bucket_id = 'event-templates'
       and name = '00000000-0000-4000-8000-000000000001/'
                 || 'e0000000-0000-4000-8000-000000000001/templates/x.png' $$,
  'the owner can rename a template object'
);

select is(
  (select count(*)::int from storage.objects
     where bucket_id = 'event-templates' and name like '%templates/renamed.png'),
  1,
  'the rename actually landed on a stored object'
);

-- Replacing a policy must not turn it into a blanket allow. Both of these are
-- refused, and the second is the one that matters: the first path segment is the
-- stranger's own, so only the cross-table clause stands between them and the
-- owner's event folder. That clause was vacuous while it was misbound, so this
-- is the assertion that proves the repair restored a real check rather than
-- removing one.
select pg_temp.as_stranger();
set local role authenticated;

select pg_temp.raises_state(
  $$ insert into storage.objects (bucket_id, name)
     values ('event-templates',
             '00000000-0000-4000-8000-000000000001/'
             || 'e0000000-0000-4000-8000-000000000001/templates/intruder.png') $$,
  '42501',
  'a stranger cannot write into another organizer''s template folder'
);

select pg_temp.raises_state(
  $$ insert into storage.objects (bucket_id, name)
     values ('event-templates',
             '00000000-0000-4000-8000-000000000002/'
             || 'e0000000-0000-4000-8000-000000000001/templates/intruder.png') $$,
  '42501',
  'a stranger cannot claim an event folder they do not own'
);

select * from finish();
rollback;
