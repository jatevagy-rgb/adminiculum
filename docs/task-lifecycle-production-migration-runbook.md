# Task Lifecycle Production Migration Runbook

Date: 2026-07-19
Migration: `20260718120000_add_task_submission_workflow`
Execution status: **EXECUTED ONCE AND VERIFIED ON 2026-07-19**

## Execution Closeout

The separately approved production ticket executed this runbook once. The exact reviewed SQL committed in 236 ms, physical schema proof passed, and one truthful `_prisma_migrations` record was added. `prisma migrate deploy`, historical replay, reset, and destructive rollback were not used. See `docs/task-lifecycle-production-migration-execution.md` and `docs/task-lifecycle-production-post-migration-proof.md`.

This historical runbook does not authorize another apply. The migration is already present in production and must not be rerun.

## Principle

This runbook defines a later operator procedure. It does not authorize a production write, migration metadata write, deployment, restart, or Azure change. The repository's historical migration chain is not replayable from empty, so `prisma migrate deploy` must not be used for this release.

## Required Approvals And Inputs

- Explicit human approval naming the production database and this migration only.
- Approved maintenance window and responsible operator.
- Confirmed PITR/backup posture and acceptable recovery point.
- Final official release commit and reviewed migration SQL SHA-256.
- Separately reviewed one-shot SQL executor that cannot run unrelated migrations.
- Approved migration metadata recording method after SQL success.
- Proven backend and frontend artifact manifests from the same final release commit.

## Pre-Apply Checks

1. Confirm production target identity without printing credentials.
2. Confirm current migration head remains `20260701120000_add_outlook_communication_provider_fields`.
3. Confirm candidate migration is absent from `_prisma_migrations`.
4. Confirm all five candidate enums, four tables, `time_entries.taskId`, 17 indexes, and 16 FKs are absent.
5. Confirm required baseline tables are present.
6. Confirm no blocking locks or abnormal active-session pressure.
7. Confirm backup/PITR readiness and record the operator-approved recovery point.
8. Verify migration SQL checksum and exact source commit.
9. Verify no other pending migration will be executed.
10. Confirm old backend remains available as rollback artifact.

## Apply Method

**HISTORICAL METHOD ONLY; DO NOT RUN AGAIN.**

The approved operator ticket executed only the reviewed contents of `Backend/prisma/migrations/20260718120000_add_task_submission_workflow/migration.sql` through the controlled one-shot PostgreSQL mechanism proven on the production-head clone. It did not invoke `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, or any command that evaluates unrelated pending migrations.

The executor was configured to stop on the first SQL error. `20260718120000_add_task_submission_workflow` was recorded in `_prisma_migrations` only after the candidate SQL succeeded and post-apply object verification passed. The executable command remains omitted because it contained operational connection handling and must not be reused.

## Expected Apply Result

- Five enum types created.
- Four lifecycle tables created.
- Nullable `time_entries.taskId` added.
- 17 indexes and 16 foreign keys created.
- Existing rows remain unchanged.
- Migration duration recorded; clone reference was 147 ms.

Escalate if execution exceeds the operator-approved threshold or waits on a lock. Do not improvise a timeout or retry against production.

## Failure Stop Conditions

- Target identity cannot be proven.
- Migration head changed.
- Candidate objects exist partially or unexpectedly.
- SQL checksum differs.
- Blocking locks or elevated session pressure appear.
- Any destructive or unrelated SQL is selected.
- Any SQL statement errors.
- Migration metadata and physical objects disagree.

On any stop condition, do not deploy backend or frontend.

## Post-Apply Schema Proof

Using read-only metadata queries, verify:

- all five enums and exact values;
- all four tables and expected columns/defaults/nullability;
- nullable `time_entries.taskId`;
- 17 indexes, including the partial active-draft unique index;
- 11 checks and 16 `RESTRICT`/`CASCADE` foreign keys;
- migration metadata contains the candidate exactly once;
- no unrelated migration was recorded or applied.

## Safe Deployment Order

1. Confirm backup and migration approval.
2. Apply only the candidate SQL.
3. Verify physical schema and migration metadata.
4. Deploy backend artifact from the final official release commit.
5. Smoke backend health, authentication, legacy reads, task reads, and lifecycle authorization.
6. Deploy frontend artifact from the same official release commit.
7. Run authenticated production acceptance without fake or client content.

Never deploy the new backend against the old database.

## Post-Deploy Acceptance

- `/health` returns `200`.
- Existing protected routes remain auth-first.
- Task and review routes return safe DTOs.
- Client Portal remains disabled.
- Dashboard, Tasks, Review, Time Entries, Cases, Communications, Documents, Intake, and Agenda load.
- A separately approved non-client test account may perform the minimal lifecycle acceptance defined by the deployment ticket.
- No raw errors, CORS errors, duplicate mutations, or auth loops appear.

## Final Operator Report

Record target identity, approval, checksums, migration start/end, output summary, metadata proof, deployment IDs, smoke results, rollback decision, and confirmation that no unrelated migration/config/feature flag changed.
