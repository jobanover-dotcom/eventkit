-- Return `updated_at` from the public photo-frame read.
--
-- The public page keys its decoded-template cache on `id:updatedAt`, the same way
-- the organizer's studio does, so that a re-save re-decodes the artwork and shows
-- the new name. Without the column the key could only be built from ids, and a
-- renamed frame would keep its old name until a full reload.
--
-- `event_design_templates` has a `set_updated_at` before-update trigger (0003), so
-- this is reliable for the rename case and needs no further change.
--
-- Postgres will not widen a function's return type in place, so the drop comes
-- first. Both statements share this migration's transaction, so the function is
-- never absent from the committed database.

drop function if exists public.get_public_photo_frame_templates(uuid);

create or replace function public.get_public_photo_frame_templates(p_event_id uuid)
returns table (
  template_id uuid,
  template_name text,
  image_width integer,
  image_height integer,
  artwork_path text,
  updated_at timestamptz
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
    t.storage_path,
    t.updated_at
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
