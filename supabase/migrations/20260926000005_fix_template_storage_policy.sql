-- Repair the column reference in the event-templates storage policies.
--
-- 20260926000002 wrote, inside a subquery over public.events:
--
--     where e.id::text = (storage.foldername(name))[2]
--
-- There the bare `name` is ambiguous. Both `storage.objects.name` and
-- `public.events.name` are in scope, and PostgreSQL resolves an unqualified
-- column reference to the *innermost* scope, so the predicate silently bound to
-- `e.name` — the event's display title — rather than to the object's path.
--
-- The deployed policy therefore read `(storage.foldername(e.name))[2]`, and the
-- chain to a total lockout is:
--
--   * `e.name` is a title such as 'IT Fest 2026', not a path.
--   * `storage.foldername('IT Fest 2026')` splits on '/' into a single element
--     and slices to [1:0], which is an empty array, so index [2] is NULL.
--   * `e.id::text = NULL` is NULL, never true, so EXISTS never matched.
--   * WITH CHECK became TRUE AND TRUE AND NULL, and a NULL check fails.
--
-- Every write was therefore refused with "new row violates row-level security
-- policy" — for the owning organizer as well as for everybody else. The custom
-- certificate template upload has never succeeded for anyone, which is why the
-- existing suite missed it: every assertion on this bucket only ever proved
-- that *other* people were kept out, and a policy denying everybody passes all
-- of them.
--
-- The fix qualifies the reference. The check itself is unchanged in strength: it
-- still requires the first path segment to be the caller and the second to be an
-- event that caller owns, which is the intent 0002 documented. Only the object
-- the path is read from changes.
--
-- `event-assets` and `participant-photos` are deliberately untouched. Neither
-- has such a subquery, so both already resolved `name` to storage.objects and
-- both work.
--
-- The unqualified `name` in the outer `USING`/`WITH CHECK` conditions is left as
-- written: at the top level of a policy on storage.objects there is no inner
-- scope, so it is unambiguous. Anything that moves such a reference *inside* a
-- subquery must qualify it.
--
-- Repair only. No bucket, object, table, row, or grant is created or removed, and
-- no data is touched.

drop policy if exists event_templates_insert_own on storage.objects;

create policy event_templates_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(storage.objects.name))[2]
        and e.organizer_id = (select auth.uid())
    )
  );

drop policy if exists event_templates_update_own on storage.objects;

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
      where e.id::text = (storage.foldername(storage.objects.name))[2]
        and e.organizer_id = (select auth.uid())
    )
  );
