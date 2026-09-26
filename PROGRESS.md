# PROGRESS.md

## Status

🟢 Phase 1 complete (auth, event creation, event dashboard) · Phase 2 next

---

## Completed

### Phase 0 — foundation

- Approved dependencies installed; `next-safe-action`, `jszip`, `nuqs`, and
  `@tanstack/react-query` deliberately omitted (see `CONTEXT.md`).
- shadcn/ui initialized; 12 primitives in `src/components/ui`. `cn`
  reimplemented as `clsx` + `tailwind-merge`. Button touch targets enlarged for
  phone use (`h-10` default, `h-11` large).
- Event-oriented design tokens and dark block in `src/app/globals.css`; offline
  fonts via `@fontsource-variable/*`, mirrored in `src/config/fonts.ts`.
- `src/config/env.ts` (public, Zod) and `src/config/server-env.ts`
  (service role, `server-only`).
- `src/proxy.ts` — session refresh via `getClaims()` plus an optimistic
  organizer-route redirect with same-origin `next` validation.
- Scaffold bugs fixed: `Permissions-Policy: camera=()` would have killed the QR
  scanner (now `camera=(self)`); Next 16 uses `src/proxy.ts`, not `middleware.ts`;
  `output: 'standalone'` dropped for Vercel.
- Error contract (`errors.ts`, `action-result.ts`, `action-error.ts`,
  `logger.ts`) with the registry in `docs/api/errors.md`.
- Landing page and 404, responsive to 390 px.

### Phase 1a — database

- `supabase/migrations/20260926000001_create_eventkit.sql`: 8 tables, RLS on all
  of them, `SECURITY DEFINER` registration and pass functions, 2 storage
  buckets with 6 owner-scoped policies, 15 seeded templates.
- **Applied to the hosted project** and recorded in
  `supabase_migrations.schema_migrations`.
- `supabase/tests/eventkit_rls.test.sql`: 55 pgTAP assertions.
- `src/types/database.types.ts` generated from the live schema.

### Phase 1b — Docker-free hosted workflow

The local Supabase stack needs Docker, and `supabase db push` /
`gen types --local` / `test db` all need either Docker or a personal access
token. Replaced with scripts that talk to Postgres over the session pooler:

| Command                 | Replaces                     | Notes                                                                                                  |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run db-push`       | `supabase db push`           | Applies pending migrations, one transaction each, records history like the CLI. `--dry-run` supported. |
| `npm run db-types`      | `supabase gen types --local` | Introspects the live project.                                                                          |
| `npm run db-test`       | `supabase test db`           | Installs `pgtap` once, runs every test file in a rolled-back transaction.                              |
| `make local-start` etc. | —                            | Optional Docker stack, kept but out of the default path.                                               |

### Phase 1c — application

- **Auth**: `/login` (sign in + sign up), `/auth/callback` (PKCE),
  `signOutAction`, `getCurrentOrganizer` / `requireOrganizer`.
- **Route groups**: `(marketing)` for `/` and `/login`, `(organizer)` for
  `/dashboard`, `/events/new`, `/events/[eventId]/dashboard`. Each group owns its
  chrome so no page renders two headers.
- **Event creation**: zod schema (trims, rejects inverted times and impossible
  dates), `eventRepository`, `eventService`, `createEventAction`, `EventForm`
  with a theme picker and a registration toggle.
- **Event dashboard** (§7): `EventHeader`, `AttendanceStats` (Participants /
  Checked in / Not checked in), and Design / Attendance / Info tile groups.
- **Dashboard**: organizer's event list, with an empty state.

## In Progress

<!-- Current work -->

## Up Next

- **Phase 2**: registration, QR display and download, participant pass page,
  check-in scanner with a manual-code fallback, attendance dashboard with
  search, status filter, and CSV export.
- **Phase 3**: schedule, rules, map upload, public event page sections.
- **Phase 4**: design studio — 4 canvas renderers, template selector, PNG/PDF.
- **Phase 5**: `npm run seed:demo`, polish, final testing.

## Blocked

- **Email confirmation must be turned off** in Supabase → Authentication → Email
  before self sign-up works. Until then the login form shows "check your email"
  and the organizer cannot get in. The live e2e suite works around this by
  creating pre-confirmed accounts through the admin API.

## Decisions Made

- See the decision table in `CONTEXT.md`.
- **Prisma was considered and rejected.** It would add a second, competing
  migration history beside `supabase_migrations.schema_migrations`, and Prisma's
  schema language cannot express any of the 31 RLS policies, the
  `SECURITY DEFINER` functions, the `auth.users` trigger, or the storage
  policies — all of which would remain hand-written SQL that Prisma does not
  manage.
- The hosted project is the default database target; Docker is optional.
- Real pgTAP on the hosted project is stricter than a hand-rolled harness: its
  3-argument `throws_ok` compares the full error _message_, which varies by
  PostgreSQL version. The suite therefore uses a `pg_temp.raises_state` helper
  that asserts the SQLSTATE only.
- The participant pass URL is a bearer secret (accepted limitation, documented).
- No rate limiting on anonymous registration (documented gap).
