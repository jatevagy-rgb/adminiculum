# Task Lifecycle Production-Like Clone Proof

Date: 2026-07-19
Environment: disposable local PostgreSQL
Production content used: none

## Proof Design

A disposable database was assembled from the production-head-compatible baseline with synthetic representative rows for users, clients, cases, tasks, time entries without `taskId`, documents, handoff packages, notifications, timeline/audit records, and relevant communication/task relationships.

The candidate migration was then executed once and verified. The disposable database was dropped after testing.

## Result

| Check | Result |
| --- | --- |
| Candidate apply | Passed |
| Duration | 147 ms |
| New enum types | 5 |
| New tables | 4 |
| Nullable `time_entries.taskId` | Present and nullable |
| Existing synthetic rows | Readable after apply |
| Existing handoff package | Readable and unchanged |
| Unique constraints | Enforced |
| Foreign-key restrictions | Enforced |
| Partial one-draft index | Enforced |
| Prisma DB-to-schema diff | Empty |
| Old runtime `/health` on new schema | `200` |
| New runtime `/health` on new schema | `200` |
| New unauth lifecycle route | `401` |
| Disposable database cleanup | Completed |

## Historical Chain Separation

The full repository chain was also tested independently and failed before reaching this migration because the historical no-op baseline did not create `clients`. That defect does not invalidate the production-head-to-candidate proof, but it prohibits using blanket migration-chain execution in production.

## Compatibility Matrix

| Database | Backend | Frontend | Safe? | Reason |
| --- | --- | --- | --- | --- |
| Old | Old | Old | Yes | Current production state |
| New | Old | Old | Yes | Migration is additive; old runtime ignores new objects |
| New | New | Old | Yes | Old frontend does not invoke lifecycle routes |
| New | New | New | Yes | Intended final state |
| Old | New | Any | No | New backend requires new lifecycle tables/enums |

## Limitations

- The clone contains synthetic data, not production content.
- Local execution duration is not a production duration guarantee.
- Production lock and backup conditions must be rechecked immediately before a separately approved apply.
- No production migration or deployment was performed.

Classification: `TASK_LIFECYCLE_RELEASE_INTEGRATED_READY_FOR_PRODUCTION_MIGRATION_APPROVAL`
