# Task Lifecycle Production Migration Audit

Date: 2026-07-19
Migration: `20260718120000_add_task_submission_workflow`
Apply status: not applied to production

## Executive Summary

The migration SQL is additive and compatible with the current production schema head proven by read-only metadata inspection. It creates five enum types, four tables, one nullable column on `time_entries`, 17 indexes, 11 check constraints, and 16 conservative foreign keys. Destructive statement count is zero.

The repository migration chain does not replay from an empty database because an older migration assumes baseline tables that the checked-in no-op baseline does not create. Therefore `prisma migrate deploy` is not approved for production. A separately approved operation must execute only the reviewed candidate SQL against the proven production head and record migration metadata only after successful SQL execution.

## SQL Inventory

### Enums

- `TaskSubmissionStatus`
- `ReviewAttentionLevel`
- `TaskReviewDecisionType`
- `TaskSubmissionDocumentRole`
- `ExternalActionType`

### Existing Table Alteration

- Adds nullable `time_entries.taskId TEXT`.
- Adds an index and `RESTRICT`/`CASCADE` foreign key to `tasks.id`.
- No existing row is updated or backfilled.

### New Tables

- `task_submissions`
- `task_submission_documents`
- `task_review_decisions`
- `task_submission_time_entries`

### Constraints And Indexes

- 17 indexes, including one partial unique index enforcing one active draft per task.
- Unique constraints cover revision numbers, review decisions, idempotency keys, supersession, document roles, and linked time entries.
- 11 checks enforce positive revisions, no self-supersession, no self-review, required transition timestamps, zero-time integrity, external-action integrity, and mandatory return corrections.
- 16 foreign keys use `ON DELETE RESTRICT ON UPDATE CASCADE`; no cascading delete is introduced.

## Additive Safety Review

| Risk | Result |
| --- | --- |
| `DROP` | None |
| `TRUNCATE` | None |
| `DELETE` | None |
| `UPDATE` backfill | None |
| Existing enum replacement | None |
| Existing column rename/drop | None |
| Unsafe new `NOT NULL` on populated table | None |
| Broad data rewrite | None expected |
| Unexpected cascade delete | None |
| Production data inference | None |

Destructive statement count: **0**.

## Lock And Runtime Assessment

- Enum and new-table creation takes catalog locks but does not rewrite existing business tables.
- `ALTER TABLE time_entries ADD COLUMN taskId TEXT` is nullable and has no default, so PostgreSQL should not rewrite existing rows.
- Index creation on `time_entries.taskId` scans the existing table and can briefly affect concurrent DDL; use a controlled maintenance window.
- Adding the `time_entries.taskId` foreign key validates existing null values safely; no backfill is required.
- Clone execution completed in 147 ms. Production duration may differ with table size and concurrent activity.

## Migration Chain Finding

Full empty-chain replay failed at `20260212180000_add_workload_tracking` with PostgreSQL `42P01` because relation `clients` was absent. The preceding checked-in `20260211153100_baseline` migration is a no-op and does not bootstrap the historical baseline. Prisma reported `P3018`.

This is a repository migration-history defect, not a defect in the task lifecycle migration. It remains operationally relevant because blanket `prisma migrate deploy` would evaluate the pending repository chain rather than only this candidate.

## Production-Head Proof

The actual production migration head is `20260701120000_add_outlook_communication_provider_fields`. A disposable schema representing that head accepted this migration, preserved representative old rows, satisfied constraint tests, and produced an empty Prisma database-to-schema diff.

## Decision

- Migration SQL: independently passed.
- Production apply: not authorized.
- `prisma migrate deploy`: prohibited for this release.
- Separate one-shot migration approval: conditionally supportable after the runbook conditions are met.

Classification: `TASK_LIFECYCLE_RELEASE_INTEGRATED_READY_FOR_PRODUCTION_MIGRATION_APPROVAL`
