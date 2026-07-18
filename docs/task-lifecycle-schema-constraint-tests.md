# Task Lifecycle Schema Constraint Tests

Date: 2026-07-18
Test file: `Backend/tests/taskLifecycleSchema.integration.test.ts`

## Database Safety Guard

The suite runs only when `TASK_LIFECYCLE_TEST_DATABASE_URL` is present. Before connecting it rejects:

- non-loopback hosts;
- database names outside `adminiculum_task_lifecycle_schema_*`.

Without the explicit environment variable the suite is skipped. It cannot silently use `DATABASE_URL` or a shared database.

## Covered Contract

All 18 required schema cases passed:

1. sequential revisions and supersedes relation;
2. duplicate revision rejection;
3. duplicate idempotency key rejection;
4. second active draft rejection;
5. multiple documents per submission;
6. duplicate document-role rejection;
7. multiple time entries per submission;
8. duplicate/cross-revision time link rejection;
9. persisted reviewer relation;
10. persisted immutable decision relation;
11. one final decision per revision;
12. task deletion restriction;
13. document deletion restriction;
14. pre-migration time entry remains valid with null `taskId`;
15. task-linked time entry persists;
16. pre-migration `LawyerHandoffPackage` remains readable;
17. pre-migration task remains valid;
18. no sensitive/integration content columns exist in the new aggregate.

PostgreSQL 18 reports explicit referential `RESTRICT` violations as SQLSTATE `23001`; the tests assert that exact behavior.

## Stale Dashboard Test Correction

The inherited static dashboard test still expected the removed KPI-card implementation and the former separate client-communication panel.

Removed stale assertions included:

- `value: number | null`;
- `value === null ? "Most nem elérhető"`;
- `<SummaryCard label="Nyitott ügyek"`;
- `Ügyfélhez sorolt kommunikáció`.

The corrected test now verifies the accepted `a607f6e` contract:

- `const caseCount = availability.cases`;
- compact `<section aria-label="Nyitott ügyek összefoglaló">`;
- truthful `caseCount === null` fallback;
- absence of duplicate `SummaryCard` KPIs;
- the consolidated communication section's client-filter copy.

No dashboard runtime code was changed to satisfy the test.

## Validation Result

- Focused schema suite: 18/18 passed.
- Corrected dashboard static suite: 7/7 passed.
- Full backend suite with disposable DB: 46 suites, 460 tests, all passed.

Classification: `TASK_LIFECYCLE_SCHEMA_CANDIDATE_READY_FOR_RUNTIME_IMPLEMENTATION`
