# Task Lifecycle Production Migration Execution

Date: 2026-07-19
Runtime source: `4647c080f7c070713ff9ec1f82e4140e3f622c77`
Migration: `20260718120000_add_task_submission_workflow`

## Authorization And Target

The human-approved one-shot production operation targeted only `adminiculum.postgres.database.azure.com/adminiculum`. The full Prisma migration chain was not run. No connection string, password, token, or business row content was recorded.

## Backup And Readiness Gate

- Azure Database for PostgreSQL Flexible Server status: `Ready`, PostgreSQL `15.18`, Austria East.
- Automatic backup retention: 7 days.
- Latest verified full backup before apply: `2026-07-19T00:55:42.999746Z`.
- Earliest verified restore point: `2026-07-13T00:53:46.772174Z`.
- PITR restore can be initiated by the current Azure subscription owner into a new Flexible Server if separately approved.
- No backup resource, server, slot, or other paid resource was created.

## Pre-Apply Proof

- Migration head: `20260701120000_add_outlook_communication_provider_fields`.
- Candidate migration record: absent.
- Candidate tables, enums, and `time_entries.taskId`: absent.
- Unfinished migration records: 0.
- Active connections: 8.
- Long-running transactions: 0.
- Ungranted locks: 0.
- Existing safe row counts checked for compatibility: tasks 6, time entries 0, lawyer handoff packages 2; no row content was queried.

## Exact SQL

- Source: `Backend/prisma/migrations/20260718120000_add_task_submission_workflow/migration.sql`.
- Controlled execution copy: `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-prod-4647c08-20260719T162339Z\20260718120000_add_task_submission_workflow.sql`.
- SHA-256: `f353be8a19783f4742d4d352dabcf98cbcea8d1baa180047c3cfacf2e83f007e`.
- Size: 10,319 bytes; 157 lines; 43 SQL statements.
- Inventory: 5 enums, 4 tables, nullable `time_entries.taskId`, 17 indexes, 11 checks, 16 foreign keys.
- Destructive statements, backfills, `TaskStatus` changes, `UPDATE`, `DELETE`, `DROP`, and `TRUNCATE`: 0.

## Execution

The exact reviewed SQL was sent once through the proven Kudu-hosted one-shot Node/PostgreSQL executor. A hard host/database guard was applied. The executor ran one transaction (`BEGIN`, exact SQL, `COMMIT`) and did not inspect or execute surrounding migrations.

- Start: `2026-07-19T16:26:50.148Z`.
- End: `2026-07-19T16:26:50.384Z`.
- Duration: 236 ms.
- Exit status: 0.
- Transaction: committed.
- Retry count: 0.

## Migration History Recording

Only after physical schema proof, one narrow `_prisma_migrations` record was inserted using the reviewed production-runbook method.

- Name: `20260718120000_add_task_submission_workflow`.
- Checksum: exact SQL SHA-256 above.
- Finished: `2026-07-19T16:27:54.196872Z`.
- `rolled_back_at`: null.
- `applied_steps_count`: 1.
- Successful matching records: exactly 1.
- Unfinished migrations after recording: 0.

No `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, reset, or other migration was run.
