-- Public read of an organizer's custom photo frames.
--
-- A visitor making a photo frame needs the organizer's own frames. They are in
-- `event_design_templates`, and `anon` can reach neither that table nor the
-- private `event-templates` bucket:
--
--   * `event_design_templates` was granted to `authenticated` only, and its sole
--     select policy is `organizer_id = auth.uid()`.
--   * the bucket is `public = false` and its sole select policy is
--     `(storage.foldername(name))[1] = auth.uid()`.
--
-- `events` is the counter-example: it grants `select` to `anon` and has
-- `events_select_visible`. So the public event page works today and public
-- template reads do not. The fix follows the pattern this schema already uses
-- twice for exactly this situation -- `get_certificate_verification` and
-- `get_participant_pass` -- rather than widening a table grant: two
-- `security definer` functions that carry their own authorization.
--
-- Deliberately NOT done here:
--   * no `anon` grant on `event_design_templates`. Granting one would publish
--     every template in the project, because the existing policy restricts by
--     organizer and an `anon` policy would have to be added to the table too.
--   * no change to any existing policy, and no new bucket.
--
-- One disclosure is accepted, and it is worth stating plainly: the artwork path
-- is `{organizer_id}/{event_id}/templates/{uuid}.png`, so returning it tells a
-- caller the owning organizer's user id -- but only for a published event that
-- actually has a custom photo frame. It is an identifier, not a credential:
-- every policy in this schema keys off `auth.uid()` from the verified session,
-- never off a client-supplied id, so knowing somebody else's uuid grants
-- nothing. The path cannot be avoided instead, because Supabase mints signed
-- URLs through the Storage API rather than from SQL (`storage.create_signed_url`
-- does not exist as a callable function), so the object name has to reach the
-- application to sign it.

-- ---------------------------------------------------------------------------
-- Template metadata for a public page
-- ---------------------------------------------------------------------------

-- Mirrors `get_certificate_verification`: a caller who cannot see the event
-- learns nothing, and a caller who can see it learns only what the page needs to
-- draw a frame. `design_config` is excluded because a frame's photo area is
-- derived from the artwork, not read from the column.
create or replace function public.get_public_photo_frame_templates(p_event_id uuid)
returns table (
  template_id uuid,
  template_name text,
  image_width integer,
  image_height integer,
  artwork_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.name,
    t.image_width,
    t.image_height,
    t.storage_path
  from public.event_design_templates t
  join public.events e on e.id = t.event_id
  where t.event_id = p_event_id
    and t.kind = 'photo_frame'
    and (e.registration_open or e.organizer_id = (select auth.uid()))
  order by t.created_at desc;
$$;

comment on function public.get_public_photo_frame_templates(uuid) is
  'Custom photo frames of a publicly visible event, for the public photo-frame page. Security definer because anon cannot read event_design_templates.';

revoke all on function public.get_public_photo_frame_templates(uuid) from public;
grant execute on function public.get_public_photo_frame_templates(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Artwork bytes for a public page
-- ---------------------------------------------------------------------------

-- Whether one object in the bucket may be read by a caller who is not the
-- organizer. Exists as a function because a storage policy that inlined the
-- lookup would evaluate `event_design_templates` under the caller's own RLS --
-- and `anon` has no select on it, so the check would be false for every visitor
-- and the artwork would never load. `security definer` is what makes the policy
-- able to ask the question at all.
create or replace function public.is_public_photo_frame_artwork(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_design_templates t
    join public.events e on e.id = t.event_id
    where t.storage_path = p_path
      and t.kind = 'photo_frame'
      and (e.registration_open or e.organizer_id = (select auth.uid()))
  );
$$;

comment on function public.is_public_photo_frame_artwork(text) is
  'True when a stored template artwork is a photo frame of a publicly visible event. Gate for the anon read of the event-templates bucket.';

revoke all on function public.is_public_photo_frame_artwork(text) from public;
grant execute on function public.is_public_photo_frame_artwork(text) to anon, authenticated;

-- Scoped by kind on purpose. The bucket holds certificate artwork alongside
-- photo-frame artwork, and this path is the same path segment for both, so a
-- policy that only asked "is the event visible?" would publish every custom
-- certificate background in the project. Asking the helper keeps it to frames.
--
-- Grants read only. Insert, update, and delete stay organizer-only, and
-- `event_templates_select_own` is untouched, so an organizer's own access does
-- not change.
create policy event_templates_select_public_frame
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'event-templates'
    and public.is_public_photo_frame_artwork(name)
  );
