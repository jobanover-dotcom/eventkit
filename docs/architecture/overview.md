# Architecture Overview

## Runtime shape

- Frontend: Next.js 16 (App Router, React 19, Server Components by default)
- Styling: Tailwind CSS v4 with shadcn/ui primitives owned in `src/components/ui`
- Backend/data: Supabase (Postgres, Auth, Storage) reached through Server Actions
- Platform: web, deployable to Vercel
- Architecture profile: medium
- Authentication: Supabase Auth, email + password, PKCE

## Dependency direction

```text
app routing → feature entry points/UI → application operations → data boundary
shared UI   → no feature imports
```

- `src/app` owns URLs, layouts, metadata, and composition.
- Server Actions are untrusted entry points. They validate input, authenticate,
  authorize, call one service, revalidate, and return a small `ActionResult`.
- Services hold policy and coordination and never import React or route modules.
- Repositories are the only place that talks to Supabase tables.
- `src/lib` holds shared infrastructure: Supabase clients, auth route helpers,
  error contract, structured logger.

## Trust boundaries

- **Anonymous**: event landing pages, registration, participant pass pages.
- **Organizer**: everything under `/events/[eventId]/dashboard` and its sections,
  including the Design module. Re-verified in the organizer layout, in every
  Server Action, and by RLS. The Design pages additionally match the event by
  `organizer_id` before rendering.
- **Service role**: offline demo seed only. Never used in request handling.

## Session handling

`src/proxy.ts` refreshes Supabase auth cookies and makes an optimistic redirect
decision for organizer routes. It is not authorization: every protected operation
re-verifies the principal and the resource, and RLS is the final backstop.

## Feature notes

- [Info module](./info-module.md) — public schedule, map & venue, and rules
  pages, plus owner-only add forms.
- [Attendance module](./attendance-module.md) — public registration, QR passes,
  camera check-in, the attendance sheet, and CSV export.
- [Design module](./design-module.md) — template-based badges, certificates,
  posters, and photo frames rendered on a canvas and exported to PNG or PDF.

## Verification boundary

The application is healthy when `npm run lint`, `npm run typecheck`,
`npm run test`, and `npm run build` all pass, and the end-to-end journey passes
under `npm run test:e2e`. Documentation explains those executable patterns; it
does not override working code and tests.
