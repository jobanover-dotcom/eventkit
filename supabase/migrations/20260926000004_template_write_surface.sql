-- Narrow the write surface of event_design_templates.
--
-- 20260926000003 gave the table an audit trail (`created_by`) and the INSERT
-- policy checks that it matches the session, but it left `authenticated` with a
-- table-level UPDATE grant. RLS decides *which rows* an organizer may touch; it
-- says nothing about *which columns*, so an organizer could rewrite any column of
-- their own template row. Three of those are load-bearing:
--
--   * `created_by` — the audit trail 0003 was written to protect. Reassigning it
--     made a template look like somebody else's work, which is the one claim the
--     column exists to make trustworthy.
--   * `storage_path` — the pointer to a private object. Repointing it at another
--     organizer's template path turns the application's own signing call into a
--     read of somebody else's artwork. The `event-templates` bucket policies
--     refuse to serve such a path today, so this is not currently an
--     exfiltration, but the row was lying and only one policy was holding the
--     line.
--   * `event_id` / `kind` / the image dimensions — the row's identity and the
--     bounds the renderer trusts.
--
-- Column-level UPDATE privileges are the right tool rather than a trigger:
--
--   * They express intent declaratively, so the permitted surface is readable in
--     the catalog rather than inferred from a function body.
--   * They leave `ON DELETE SET NULL` on the `created_by` foreign key working. A
--     BEFORE UPDATE trigger that rejected a changed `created_by` would also fire
--     for the foreign key's own internal UPDATE when an account is deleted, and
--     deleting a user who owns a template would start failing.
--
-- The application writes exactly `name` and `design_config`
-- (updateCertificateTemplateDesign), so nothing the product needs is withdrawn.
-- `service_role` keeps full access, and `updated_at` is written by the trigger
-- rather than the statement, so it needs no grant of its own.
--
-- Tightening only. No row is read, written, or deleted.

revoke update on public.event_design_templates from authenticated;

grant update (name, design_config) on public.event_design_templates to authenticated;

comment on column public.event_design_templates.created_by is
  'The organizer who uploaded the template, set from the session on insert and immutable afterwards. Null if that account was later deleted.';
