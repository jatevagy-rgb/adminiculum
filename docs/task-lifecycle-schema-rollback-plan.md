# Task Lifecycle Schema Rollback Plan

Date: 2026-07-18
Status: application rollback defined; no destructive down migration

## Before Migration Apply

The safest rollback is to abandon or revise the candidate before apply. No existing schema or data changes until the migration runs.

## After Additive Apply, Before Runtime Activation

- Deploy or retain the old application runtime.
- Old runtime ignores the four new tables and five new enums.
- Old runtime tolerates nullable `time_entries.taskId`.
- Existing task, time-entry, document, and legacy handoff reads remain valid.
- Do not drop candidate objects merely to make migration history look unchanged.

## After Runtime Usage

Once submissions or decisions exist, dropping the tables would destroy legal workflow history. Application rollback must disable or revert runtime usage while preserving additive schema and data.

There is intentionally no destructive down migration.

## Future Production Preconditions

Before any future production migration:

1. prove the exact production-compatible baseline on a fresh clone;
2. review pending/historical Prisma migration divergence;
3. take an approved backup/PITR checkpoint;
4. record exact schema and `_prisma_migrations` state;
5. apply backend-compatible schema before activating runtime reads/writes;
6. keep feature activation separately reversible;
7. verify old-runtime compatibility and authenticated authorization guards.

## Recovery Posture

- Failed pre-commit/apply: transaction rollback leaves no candidate objects.
- Successful apply but failed application deploy: restore old application artifact; preserve schema.
- Runtime defect after data creation: disable/revert new runtime entry points; preserve submissions.
- Constraint defect: stop writes and create a separately reviewed additive corrective migration.

## Prohibited Rollback Actions

- no production `DROP TABLE`;
- no enum recreation/replacement;
- no deletion or inferred backfill;
- no automatic conversion to `LawyerHandoffPackage`;
- no migration-history manipulation without a separate operator plan.

Classification: `TASK_LIFECYCLE_SCHEMA_CANDIDATE_READY_FOR_RUNTIME_IMPLEMENTATION`
