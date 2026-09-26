# Error Code Registry

Every failure returned to a client is an `ActionResult` carrying one of these
codes. Clients route on `code`; `message` is human-facing text and may change.

Defined in `src/lib/errors.ts`, converted once in `src/lib/action-error.ts`.

| Code                | Meaning                                                                                        | Typical status | Retry               | Client handling                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------- | ------------------- | ------------------------------------------------------------------------ |
| `VALIDATION_FAILED` | Input failed Zod parsing or a business rule. `fieldErrors` maps field name to messages.        | 400            | No — fix input      | Show messages next to the offending fields; preserve entered values.     |
| `UNAUTHENTICATED`   | No valid Supabase session.                                                                     | 401            | After sign-in       | Send the organizer to `/login?next=<current path>`.                      |
| `FORBIDDEN`         | Authenticated, but not permitted to touch this resource — including another organizer's event. | 403            | No                  | Show a refusal. Do not reveal whether the resource exists.               |
| `NOT_FOUND`         | The requested resource does not exist or is not visible to the caller.                         | 404            | No                  | Render the not-found state.                                              |
| `CONFLICT`          | The write lost a race or violates a uniqueness rule.                                           | 409            | After refresh       | Refresh and explain the conflict.                                        |
| `INVALID_QR`        | Scanned or submitted token matched no participant.                                             | 400            | With a new scan     | Offer another scan; never echo the token.                                |
| `WRONG_EVENT`       | Token is valid but belongs to a different event than the one being checked in.                 | 400            | With a new scan     | Tell the operator to open the correct event.                             |
| `UPLOAD_REJECTED`   | File failed size, type, or storage-policy validation.                                          | 400            | With a smaller file | Explain the limit and accepted types.                                    |
| `CONFIG_MISSING`    | A required environment value is absent.                                                        | 500            | No                  | Show a setup message. The missing variable is named in server logs only. |
| `INTERNAL_ERROR`    | Anything unexpected. The original message is logged, never returned.                           | 500            | Yes, later          | Generic apology. Report a correlation id if one is shown.                |

## Redaction rules

`toActionResult` is the only conversion point. Unrecognized errors are logged
through `src/lib/logger.ts` with a PII-safe context and replaced with
`INTERNAL_ERROR` plus a fixed message. Stack traces, SQL text, filesystem paths,
internal hostnames, credentials, and session data never cross the boundary.

`logger` drops any context key named `authorization`, `cookie`, `token`,
`secret`, `password`, or `key`, so a careless call site cannot leak one.
