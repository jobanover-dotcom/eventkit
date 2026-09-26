# Environment Variables

Copy `.env.example` to `.env.local`. Real environment files are gitignored and
must never be committed.

| Variable                               | Visibility    |  Required | Purpose                                                                  |
| -------------------------------------- | ------------- | --------: | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | client/public |       yes | Supabase project URL. Baked into the browser bundle.                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client/public |       yes | Supabase publishable/anon key. RLS is the only thing protecting data.    |
| `SUPABASE_SERVICE_ROLE_KEY`            | server-only   | seed only | Bypasses RLS entirely. Read exclusively by the offline demo seed script. |

## Rules

- Anything with a `NEXT_PUBLIC_` prefix is **public**. It is compiled into client
  JavaScript and is readable by anyone who loads the page. Never place a secret
  behind that prefix, and never import `src/config/server-env.ts` from a Client
  Component — `server-only` turns that into a build error.
- `SUPABASE_SERVICE_ROLE_KEY` grants full database access with no RLS. It must
  not appear in any request path, log, or client bundle. If it is ever exposed,
  rotate it in Supabase → Project Settings → API Keys.
- `src/config/env.ts` parses the public values with Zod on first use and raises
  `CONFIG_MISSING` with a setup message if they are absent, rather than failing
  an opaque production build.
- `src/config/server-env.ts` owns the service-role key and is marked
  `server-only`.

## Key types: publishable vs legacy

Supabase is deprecating the `anon` and `service_role` JWT keys at the end of
2026 in favour of the `sb_publishable_...` and `sb_secret_...` keys. A project
usually has both, listed together under **Settings → API Keys**.

Either format works with `@supabase/ssr`, so nothing here depends on the
migration. Two things to know when reading the dashboard:

- A publishable key looks like `sb_publishable_...`. The legacy `anon` key is a
  JWT beginning `eyJ...` and containing `"role":"anon"`. Both are valid; they are
  not interchangeable in the sense that you cannot tell which one you copied by
  format alone, so take whichever the **Publishable key** field shows.
- Only a `sb_secret_...` key — or `service_role` — bypasses RLS. A publishable key
  never does, which is why it is safe behind a `NEXT_PUBLIC_` prefix.

## The two database tools

`src/config/env.ts` covers what the **application** needs. `scripts/lib/env.ts`
covers what the **command-line tools** need, and reads `.env.local` itself
without overwriting variables already present in the environment, so CI can pass
real secrets.

`SUPABASE_DB_URL` is only read by files under `scripts/`. The scripts strip
`sslmode` from the URL before connecting, because the Supabase pooler presents a
chain that Node does not trust by default; set `SUPABASE_DB_SSL_VERIFY=true` to
require full verification instead.

## Validation

`npm run typecheck` does not read these values. A missing public value surfaces
at runtime as a `CONFIG_MISSING` failure, which is intentional: the health
endpoint and the marketing landing page keep working without a database.
