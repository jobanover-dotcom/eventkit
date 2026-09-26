# API Overview

EventKit is a server-rendered web application. It does not publish a public HTTP
API for third parties.

## Entry points

| Kind           | Location                                   | Purpose                                                                             |
| -------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Server Actions | `src/features/*/actions/*.action.ts`       | All mutations. Untrusted: validate, authenticate, authorize, then call one service. |
| Route Handler  | `GET /api/health`                          | Liveness probe. No auth, no data.                                                   |
| Route Handler  | `POST /api/uploads`                        | Authenticated organizer file upload to Supabase Storage.                            |
| Route Handler  | `GET /api/events/[eventId]/attendance.csv` | Authenticated organizer CSV export.                                                 |

Server Actions are public endpoints even when their call sites are internal.
They return a serialized `ActionResult<T>`; see `docs/api/errors.md` for the
error contract.

## Conventions

- Every protected action re-verifies the authenticated user with `getUser()` and
  separately checks ownership of the event. Row Level Security is the backstop.
- Actions return small DTOs containing only fields the caller may receive. Whole
  database rows are never passed into Client Components.
- Reads happen in Server Components through feature queries. Reads are
  uncached and dynamic where they touch user-scoped or mutable event data.
- Mutations call `revalidatePath` for the narrowest affected route.

## Endpoints

See `docs/api/endpoints.md` for the request and response shape of each handler.
