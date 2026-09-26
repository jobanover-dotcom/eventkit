# Deployment Guide

> How to deploy to production.

EventKit deploys as a standard Next.js application. The only host-specific
requirement is the Supabase project the deployment points at.

## Prerequisites

- Node.js 24.20.0 (matches the version pinned in `.github/workflows/ci-frontend.yml`)
- A Supabase project with the schema applied and email confirmation disabled
  — see [Local Setup Guide](./setup.md) steps 2 and 3

## Required environment variables

Set these in the host's environment settings, for every environment you intend to
use (Production, Preview, Development):

| Variable                               | Visibility    | Required | Source                                        |
| -------------------------------------- | ------------- | -------: | --------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | client/public |      yes | Project Settings → API Keys → Project URL     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client/public |      yes | Project Settings → API Keys → Publishable key |

Nothing else is needed. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are read
only by the scripts in `scripts/` and by the offline seed — **do not add them to
the deployment environment.** See
[Environment Variables](./env-variables.md) for the full rules.

## On Vercel

1. Open the project on [vercel.com/dashboard](https://vercel.com/dashboard). If
   you belong to more than one team, pick the right one from the team switcher
   first.
2. **Settings** in the left sidebar.
3. **Environment Variables**.
4. Add the two keys, then tick **Production**, **Preview**, and **Development**.
5. Save, then redeploy — see below.

A variable that is not ticked for an environment is simply absent for that
environment's builds, which reproduces the failure below with no warning. Vercel
does not validate a variable name, so a typo in `NEXT_PUBLIC_` is silent too.

**Importing `.env.local` is a trap here.** Settings → Environment Variables
accepts an `.env` upload, which is convenient, but that file also holds
`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL`. Delete both immediately after
importing. Alternatively, the Supabase integration under **Settings →
Integrations** populates the two public values for you.

Do not bother marking these Secret. Vercel's Config/Secret choice only governs
dashboard display, and a `NEXT_PUBLIC_` value is compiled into public JavaScript
regardless. RLS is the actual protection.

Both values are public by design. The publishable key is protected by Row Level
Security, which is the only thing standing between an anonymous browser and your
data. Never substitute the `service_role` key here: it bypasses RLS entirely, and
any `NEXT_PUBLIC_` value is readable by anyone who loads the page.

## Redeploy after changing a `NEXT_PUBLIC_` variable

`NEXT_PUBLIC_*` values are **inlined into the bundle at build time**, not read
from the environment at request time. You can confirm this in a local build — the
Supabase URL appears as a literal string in the output under `.next/`, with no
`process.env` lookup left at runtime. Adding the variables to an already deployed
project therefore changes nothing until a new build runs.

Vercel's own wording: _"the change takes effect on your next deployment, not on the
deployment that's already live."_

On Vercel: **Deployments** → the latest deployment → `⋯` → **Redeploy**. If the
redeploy still fails, untick **Use project's Ignore Build Step** on that dialog —
otherwise a cached build can be reused, which reuses the old bundle. Pushing an
empty commit forces an unambiguous clean build.

## Verifying a deployment

```bash
curl -i https://<your-domain>/api/health   # expect 200 and {"status":"ok"}
curl -i https://<your-domain>/             # expect 200 and the landing page
```

`/api/health` returns `{"status":"ok"}` without touching Supabase, so it isolates
configuration problems from database problems. If `/api/health` returns 500, the
problem is the environment configuration, not the schema.

## Failure behavior

The Next Proxy in `src/proxy.ts` runs on every request, so it treats a missing
configuration differently by environment:

- **Production** — a missing `NEXT_PUBLIC_*` value throws and the request fails
  loudly. A broken deployment should be obvious, not silently present every
  visitor as logged out.
- **Preview and local development** — the proxy logs
  `supabase.config_missing` and passes the request through without a session. The
  marketing pages and the health endpoint still render, and organizer routes
  redirect to `/login`.

If you see a 500 across every route, check the environment variables and confirm
a redeploy happened.

## Troubleshooting

| Symptom                                           | Cause                                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 500 on every route, including `/api/health`       | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is missing or malformed. Check the value is a full URL, not a bare ref. |
| 500 that survives adding the variables            | The deployment was not rebuilt. Redeploy — the old bundle has the values baked out.                                                          |
| `/` renders, organizer pages redirect to `/login` | Expected when Supabase is unconfigured outside production, or when the visitor has no session.                                               |
| `relation "public.events" does not exist`         | Migrations were never applied to the deployed project. Run `npm run supabase:push`.                                                          |
| Sign-up succeeds but nothing happens              | Email confirmation is still enabled. See [Local Setup Guide](./setup.md) step 2.                                                             |
| `Invalid API key` or 401 from Supabase            | The wrong key is set. It must be the **publishable** key, not `service_role`.                                                                |
| Build log warns about `install-scripts`           | Benign. npm 11 gates the postinstall of `core-js`, `esbuild`, and `unrs-resolver`; none are needed by `next build`.                          |
