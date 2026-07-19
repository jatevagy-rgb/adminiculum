# Task Lifecycle Release Security Review

Date: 2026-07-19
Reviewed head: `a2553b56f29ffd2d841cc835611ba5a396f4661e`

## Authorization Result

- Every lifecycle route authenticates before identifier validation, lookup, or mutation.
- Unauthorized task/submission access uses hidden-resource `404` behavior.
- Cross-case document and time-entry references are rejected without leaking existence.
- `CLIENT` and external actors are excluded from internal worker/reviewer capabilities.
- Reviewer candidates are constrained by the task/case authorization model.
- Submitters cannot review their own submission; privileged roles, including admin, do not bypass self-review prohibition.
- Collaborator and preparer/reviewer permissions remain separate.
- Approval and external completion require the correct persisted state.

## DTO And Privacy Result

- Route responses use explicit lifecycle DTOs rather than raw Prisma rows.
- DTOs do not expose document content, `workspaceText`, storage paths, SharePoint identifiers, communication bodies, raw provider payloads, password hashes, or raw idempotency keys.
- Audit and notification text is content-minimal and does not copy review notes or requested corrections.
- Client Portal routes and external client visibility are unchanged.

## Adversarial Coverage

- Unauthenticated requests return `401` before resource behavior.
- Wrong user and wrong case access are hidden.
- Self-review is denied, including privileged self-review.
- Duplicate and cross-operation idempotency-key reuse does not disclose unrelated resource existence.
- Cross-case document/time references are denied.
- Stale review versions fail rather than silently overwriting a decision.

## CORS Result

- Allowed request headers add only `Idempotency-Key` and `If-Match` to the existing allowlist.
- Origins, credentials, and methods are unchanged.
- No wildcard origin or wildcard header policy was introduced.
- Preflight performs no write and does not replace authentication.
- No `ETag` response exposure is required because `reviewVersion` is included in the response body.

## Security Decision

No release-blocking authorization, DTO, CORS, or privacy gap was found in the approved scope. Production remains gated by migration approval and operational controls, not by an identified security defect.

Classification: `TASK_LIFECYCLE_RELEASE_INTEGRATED_READY_FOR_PRODUCTION_MIGRATION_APPROVAL`
