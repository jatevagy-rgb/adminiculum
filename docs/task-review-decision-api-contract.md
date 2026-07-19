# Task Review Decision API Contract

Date: 2026-07-18

All routes are authenticated and task/submission UUID-scoped.

## Review Detail

`GET /api/v1/tasks/:taskId/submissions/:submissionId/review`

Returns an explicit DTO with safe task, case, client, matter, submission, output metadata, time summaries, revision history, immutable decisions, permitted actions, and `nextActionCode`. It sets an ETag equal to the returned `reviewVersion`.

It never returns document body/content, `workspaceText`, storage paths, provider payloads, tokens, passwords, or raw Prisma rows.

## Return

`POST /api/v1/tasks/:taskId/submissions/:submissionId/return`

Required headers: `Idempotency-Key`, `If-Match`.

Body: `note`, `requestedCorrections`, explicit boolean `requiresFullReview`, optional `correctionDeadline`. Unknown fields are rejected. Return text is bounded and stored only in the immutable decision row.

## Revise

`POST /api/v1/tasks/:taskId/submissions/:submissionId/revise`

Required header: `Idempotency-Key`. Body must be empty. The latest revision must be `RETURNED`; only the original current worker may create revision `n+1`.

## Approve

`POST /api/v1/tasks/:taskId/submissions/:submissionId/approve`

Required headers: `Idempotency-Key`, `If-Match`. Body accepts only an optional bounded `note`.

## External Completion

`POST /api/v1/tasks/:taskId/submissions/:submissionId/external-completion`

Required header: `Idempotency-Key`. Body accepts only `actionType` and optional `completedAt`. Provider references, payloads, bodies, attachments, and secrets are rejected and not persisted.

## Error Contract

Expected bounded errors include `TASK_SUBMISSION_NOT_FOUND`, `REVIEW_FORBIDDEN`, `SELF_REVIEW_NOT_ALLOWED`, `REVIEW_ALREADY_DECIDED`, `SUBMISSION_NOT_REVIEWABLE`, `RETURN_NOTE_REQUIRED`, `REQUESTED_CORRECTIONS_REQUIRED`, `REVIEW_DETAIL_REQUIRED`, `REVIEW_VERSION_STALE`, and `IDEMPOTENCY_KEY_REUSED`. Unexpected errors return a generic response without stack or database details.
