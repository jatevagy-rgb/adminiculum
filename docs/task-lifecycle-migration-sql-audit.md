# Task Lifecycle Migration SQL Audit

Date: 2026-07-18
Migration: `20260718120000_add_task_submission_workflow`
Status: reviewed candidate; applied only to a disposable localhost database

## Source

- Schema-before commit: `d81a476194f94550ed8c05261a5b69ebca5f22de`.
- Generation method: Prisma datamodel-to-datamodel diff with no database connection.
- Candidate file: `Backend/prisma/migrations/20260718120000_add_task_submission_workflow/migration.sql`.
- Candidate SHA-256: `9E28C2E8966BCF6389E68FCA3EF0E0438BA30C4CF78003D5FE98829B56FA85AE`.

## Object Summary

| Category | Count | Objects |
| --- | ---: | --- |
| Created enums | 5 | Submission status, attention, review decision, document role, external action |
| Created tables | 4 | `task_submissions`, `task_submission_documents`, `task_review_decisions`, `task_submission_time_entries` |
| Altered existing tables | 1 | Nullable `time_entries.taskId` only |
| Created indexes | 17 | Includes Prisma indexes and one raw partial unique index |
| Added foreign keys | 16 | All `ON DELETE RESTRICT`, `ON UPDATE CASCADE` |
| Added check constraints | 11 | Revision, state, actor, zero-time, external-action, correction guards |

## Raw SQL Additions

Prisma cannot represent a partial unique index. The migration therefore adds:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "task_submissions_one_active_draft_per_task_key"
    ON "task_submissions"("taskId")
    WHERE "status" = 'DRAFT';
```

Additional check constraints enforce:

- positive revision numbers;
- no self-superseding revision;
- no submitter/assigned-reviewer equality when submitted;
- mandatory submit actor/time/attention after draft;
- returned/approved/superseded timestamps;
- consistent zero-time confirmation actor/time;
- consistent external-action type and completion actor/time;
- non-empty correction request for a returned review decision.

Cross-row rules such as reviewer versus submitter at decision time, document/version ownership, and task/matter equality remain future service-level transaction checks. No trigger was introduced.

## Index Review

The candidate provides:

- unique `(taskId, revisionNumber)`;
- nullable global unique `idempotencyKey`;
- one active `DRAFT` per task;
- reviewer and submitter review-queue indexes;
- task/status and task/created-time indexes;
- unique submission/document/role links;
- one final decision per submission;
- unique time entry across submission links;
- nullable `time_entries.taskId` lookup.

## Delete And Update Behavior

- No new foreign key uses `ON DELETE CASCADE`.
- New legal-history references use `RESTRICT`.
- Key updates use `CASCADE` consistently.
- Existing delete behavior outside the new relations is unchanged.

## Destructive Statement Audit

| Pattern | Count |
| --- | ---: |
| `DROP TABLE` | 0 |
| `DROP COLUMN` | 0 |
| `DELETE` | 0 |
| `TRUNCATE` | 0 |
| broad `UPDATE` | 0 |
| `TaskStatus` alteration | 0 |
| backfill | 0 |

Destructive statement count: **0**.

## Review Result

The SQL is additive and limited to the approved task-lifecycle schema slice. It is not authorized for production apply by this document.

Classification: `TASK_LIFECYCLE_SCHEMA_CANDIDATE_READY_FOR_RUNTIME_IMPLEMENTATION`
