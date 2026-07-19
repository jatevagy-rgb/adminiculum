# Task Lifecycle CORS Security Review

Date: 2026-07-19

## Security Result

The change permits only the request headers required by the existing idempotency and optimistic-concurrency contracts. CORS remains transport permission, not authentication or authorization.

## Confirmed Invariants

- Production origin matching is unchanged and allowlist-based.
- No wildcard origin was added.
- Allowed headers remain explicit; no echo-all or wildcard behavior was introduced.
- Credentials remain enabled exactly as before.
- Methods are unchanged.
- No response header was exposed.
- Preflight executes no task, submission, audit, timeline, or notification write.
- Unauthenticated mutations remain `401`.
- Unrelated actors remain denied/hidden by the existing route authorization.
- No reverse proxy or frontend proxy overrides the Express policy in this repository.

## ETag Boundary

`If-Match` is an allowed request header. The frontend uses the response body's `reviewVersion`, not the browser-visible `ETag` response header, so exposing `ETag` is unnecessary and would broaden the response-header contract without benefit.

## Scope Exclusions

No auth, Prisma, migration, package, lockfile, OpenAPI, Azure, Client Portal, Outlook/Graph, AI, feature-flag, or environment-file change is included.

Classification: `TASK_LIFECYCLE_BROWSER_CLOSEOUT_READY_FOR_RELEASE_INTEGRATION`
