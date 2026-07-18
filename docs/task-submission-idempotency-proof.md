# Task Submission Idempotency Proof

Date: 2026-07-18

## Contract

`POST /api/v1/tasks/:taskId/submissions/:submissionId/submit` requires a non-empty `Idempotency-Key` of at most 128 characters.

The globally unique persisted key belongs to exactly one task submission:

- first valid request performs the transaction and returns `idempotentReplay: false`;
- identical retry for the same task/submission returns the same submitted revision and `idempotentReplay: true`;
- the key reused for another submission returns `409 IDEMPOTENCY_KEY_REUSED`;
- a different key against an already submitted revision returns state conflict.

## Duplicate Prevention

The key is checked inside the same serializable, row-locking transaction as state changes, after task visibility and assignee-submit authorization. An unrelated authenticated actor cannot use a known key to bypass the hidden-resource boundary. A valid retry returns before task, audit, or notification mutation. The database unique constraint is an additional final guard.

Real PostgreSQL assertions proved one submission revision, one timeline event, one notification, one queue item, and one frozen time relation after an initial request plus identical retry.

## Failure Behavior

If any transaction step fails, the key remains null, the draft remains `DRAFT`, task remains `IN_PROGRESS`, and audit/notification rows remain absent. The caller may safely retry with the same key after correcting the failure.
