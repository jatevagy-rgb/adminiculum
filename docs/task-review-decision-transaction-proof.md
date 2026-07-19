# Task Review Decision Transaction Proof

Date: 2026-07-18
Database: disposable localhost PostgreSQL only

## Transaction Boundaries

Return, revise, approve, and external completion use serializable Prisma transactions with bounded retries for Prisma `P2034` conflicts and raw-query `P2010` errors carrying PostgreSQL `40001`. Mutations lock the task and referenced submission before state checks.

Return atomically creates one decision, changes submission/task state, writes one content-minimal timeline receipt, and writes one generic submitter notification. Approval does the same and, for ordinary tasks, also closes the task and writes one task-completed event. External approval deliberately does not close the task; external completion records metadata and closes it in one later transaction.

## Rollback Evidence

Real PostgreSQL hooks forced failures after all planned writes for:

- return decision;
- ordinary approval/task close.

In both cases the submission, task, decision, timeline, and notification state remained unchanged after rollback.

## Proven Counts

The successful synthetic lifecycle finished with:

- 7 submissions;
- 3 immutable decisions;
- 8 timeline events;
- 5 notifications;
- 2 task-submission time links.

The DB-to-current-schema diff was empty after applying the schema-equivalent baseline and the unchanged approved migration `20260718120000_add_task_submission_workflow`.
