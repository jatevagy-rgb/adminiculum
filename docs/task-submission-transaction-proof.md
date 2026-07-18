# Task Submission Transaction Proof

Date: 2026-07-18
Database: localhost disposable PostgreSQL only

## Transaction Boundaries

Draft creation and every relation mutation run in serializable Prisma transactions with bounded retries for `P2034`. Draft creation locks the owning task before checking the partial unique draft constraint and allocating the next revision.

Submit locks the task and submission, then atomically:

1. rechecks task/submission authorization and assignee ownership;
2. resolves idempotency only after the hidden-resource boundary;
3. validates reviewer, output, time/zero-time, and task transition;
4. changes submission to `SUBMITTED`;
5. changes task to `IN_REVIEW` through the existing transition contract;
6. creates one content-minimal `REVIEW_REQUESTED` timeline event;
7. creates one minimal reviewer notification.

## Real PostgreSQL Evidence

`taskSubmission.integration.test.ts` passed 13/13 tests against `adminiculum_task_submission_backend_20260718_05` after applying a schema-equivalent pre-candidate baseline and `20260718120000_add_task_submission_workflow`.

Proven cases include:

- concurrent draft creation yields exactly one draft;
- revision 2 correctly supersedes a returned revision 1;
- valid submit updates task/submission/audit/notification together;
- non-assignee submit is denied and an unrelated actor cannot replay a known idempotency key;
- a forced failure after all writes rolls back every write;
- submitted draft/document/time mutations return conflict;
- queue visibility appears exactly once.

Sanitized final database counts after the synthetic lifecycle were:

- submissions: 5 total synthetic revisions;
- successful submission audit events: 2;
- successful submission notifications: 2;
- candidate migration metadata rows: 1.

The forced rollback task contributed no audit or notification row.

## Schema Proof And Cleanup

- Prisma migration status: up to date for the two-step disposable chain.
- Database-to-current-schema diff: empty.
- No production/shared database connection was used.
- The disposable database and temporary migration directory were deleted.
