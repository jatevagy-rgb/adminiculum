# Task Lifecycle CORS Header Hardening

Date: 2026-07-19
Branch: `codex/task-lifecycle-cors-browser-closeout-1`
Base: `6dbc02002cfa2280ac1b5b13800f6ca90a4e50ca`

## Result

The authoritative Express `cors` middleware now permits the two request headers already required by the authenticated task lifecycle client: `Idempotency-Key` and `If-Match`.

## Exact Contract Change

Before:

`Authorization`, `Content-Type`, `X-Requested-With`, `Accept`, `Origin`

After:

`Authorization`, `Content-Type`, `X-Requested-With`, `Accept`, `Origin`, `Idempotency-Key`, `If-Match`

The policy remains an explicit allowlist. No wildcard header or wildcard origin was introduced.

## Preserved Policy

- Origin callback behavior is unchanged.
- Production origins still come only from the existing production allowlist.
- Development origin behavior is unchanged.
- `credentials: true` is unchanged.
- Methods remain `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.
- No response headers are newly exposed.
- Authentication and route authorization are unchanged.

## ETag Audit

The frontend sends `If-Match` from the typed review payload's persisted `reviewVersion`; it does not call `response.headers.get("ETag")`. The browser therefore does not need `Access-Control-Expose-Headers: ETag`, and no exposed-header change was made.

## Implementation

`Backend/src/config/cors.ts` owns the reusable runtime options. `Backend/src/index.ts` applies those options through the same Express `cors` middleware that served the previous inline policy.

Classification: `TASK_LIFECYCLE_BROWSER_CLOSEOUT_READY_FOR_RELEASE_INTEGRATION`
