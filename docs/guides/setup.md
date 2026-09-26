# Local Setup Guide

EventKit targets a **hosted Supabase project**. Every database task — applying
migrations, generating types, running the RLS test suite — works over a plain
Postgres connection, so **Docker and a Supabase personal access token are not
required**. The local stack is available as an optional extra.

## Prerequisites

- Node.js 24.20.0
- npm
- A Supabase project (free tier is fine)

## 1. Environment

```bash
cp .env.example .env.local
```

| Variable                               | Where to get it                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project Settings → API Keys → Project URL                                                                                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key                                                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`            | Project Settings → API Keys → Secret key (`service_role`). Server-only.                                                         |
| `SUPABASE_DB_URL`                      | Project Settings → Database → Connection string → **Session pooler**. Keep the `postgres.<project-ref>` username and port 5432. |

There is no longer a separate **Settings → API** page; keys, both new and legacy,
live under **Settings → API Keys**. The Connect dialog at the top of the project
shows the URL and publishable key ready to paste.

`SUPABASE_DB_URL` is only read by the scripts in `scripts/`. It is never bundled
into the browser. It does contain the database password, so treat `.env.local`
as a secret file — it is gitignored.

## 2. Install and run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, click **Create event**, and you will be sent to
`/login`. Create an account there.

### Email confirmation

Supabase projects have **Confirm email** switched on by default. Until it is
turned off, a new organizer account receives no session and cannot log in.

Project Settings → Authentication → Sign In / Providers → Email → set
**Confirm email** to off.

The login form handles both cases: with confirmation off it goes straight to the
dashboard, and with it on it tells the organizer to check their email.

## 3. Apply the schema

```bash
npm run db-push-dry   # list what would be applied
npm run db-push       # apply it
```

Migrations are applied in filename order, each inside its own transaction, and
recorded in `supabase_migrations.schema_migrations` exactly as
`supabase db push` would — so the Supabase CLI keeps treating that table as
authoritative if you later link the project with a personal access token.

## 4. Generate database types

```bash
npm run db-types
```

Introspects the live project and rewrites `src/types/database.types.ts`. Run it
after every schema change, and commit the result.

## 5. Validate

```bash
npm run check     # format, lint, typecheck, unit tests
npm run build
npm run db-test   # pgTAP RLS suite against the hosted project
```

`npm run db-test` installs the `pgtap` extension on first run and then executes
every `supabase/tests/*.sql` file, each in its own rolled-back transaction. It
writes nothing permanent, but it does create and delete rows for its fixtures.

## 6. Optional: the live end-to-end flow

```bash
E2E_LIVE=1 npx playwright test e2e/live-flow.spec.ts
```

Signs up real accounts, creates a real event through the browser, and verifies a
second organizer cannot open it. The accounts are deleted afterwards, so the
project is left as it was found.

## Optional: the local Supabase stack

Only if you want an isolated database. Requires a Docker-compatible runtime.

```bash
npm run supabase:start     # or: make local-start
npm run supabase:reset     # or: make local-reset
npm run supabase:test      # the same pgTAP files against the local database
```

`supabase:push`, `supabase:types`, and `supabase:test` are the hosted-project
commands. They replace `supabase db push`, `supabase gen types --local`, and
`supabase test db`, all of which need Docker or a personal access token.

## Troubleshooting

| Symptom                                            | Cause                                                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL is not set`                       | The variable is missing from `.env.local`.                                                                                                          |
| `self-signed certificate in certificate chain`     | A tool used your URL verbatim. The bundled scripts strip `sslmode` for this reason; set `SUPABASE_DB_SSL_VERIFY=true` to enforce full verification. |
| `permission denied for schema anon`                | The URL username must be `postgres.<project-ref>`, not `<project-ref>`.                                                                             |
| `relation "supabase_migrations..." does not exist` | Expected on a project that has never had a migration pushed.                                                                                        |
| Sign-up succeeds but nothing happens               | Email confirmation is still on. See step 2.                                                                                                         |
| Ports 5432/6543 refused                            | The direct host `db.<ref>.supabase.co` is IPv6-only on some projects; the pooler hosts are IPv4 and are what `SUPABASE_DB_URL` should use.          |
