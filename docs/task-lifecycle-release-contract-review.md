# Task Lifecycle Release Contract Review

Date: 2026-07-19

## Route Contract Alignment

Frontend route paths, HTTP methods, request bodies, response DTO fields, `Idempotency-Key`, and `If-Match` usage match the backend task lifecycle routes. Error-code and readiness-code mappings are explicit; unknown next actions remain inert.

The frontend consumes persisted lifecycle state. It does not invent submission, reviewer, time, document, approval, return, or external-completion state.

## State Contract

| Flow | Authoritative behavior |
| --- | --- |
| Draft | Editable only by the eligible worker while status is `DRAFT` |
| Submit | Requires a reviewer, requested attention, output evidence, and time or explicit zero-time confirmation |
| Return | Creates an immutable decision with mandatory corrections |
| Revise | Creates the next revision; prior revision remains immutable |
| Approve ordinary/zero-time | Records approval and closes the task |
| Approve external action | Records approval but leaves task waiting for explicit external completion |
| External completion | Records metadata only, then closes the task |

## External-Action Truthfulness

The contract records an external-action type, reference/note, and completion metadata. It does not send email, submit to a court or authority, obtain signatures, call Outlook/Graph, or claim that an external transmission occurred automatically.

## Safe Projection

The contract excludes raw Prisma relations and sensitive internal fields. In particular, it does not return document bodies, storage paths, SharePoint IDs, communication bodies, raw audit payloads, or raw idempotency keys.

## Revision And Reviewer Behavior

- Revision history is ordered and immutable.
- Reviewer eligibility is backend-authoritative.
- Self-review is denied.
- `reviewVersion` is the authoritative optimistic concurrency token in the body.
- Stale decisions fail safely.

## Decision

No release-blocking frontend/backend contract drift was found.

Classification: `TASK_LIFECYCLE_RELEASE_INTEGRATED_READY_FOR_PRODUCTION_MIGRATION_APPROVAL`
