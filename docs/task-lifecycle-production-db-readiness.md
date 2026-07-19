# Task Lifecycle Production Database Readiness

Date: 2026-07-19
Inspection mode: read-only metadata only
Production database writes: none

## Target Identity

- PostgreSQL server: `adminiculum.postgres.database.azure.com`
- Database: `adminiculum`
- Resource group: `Adminiculum-RG`
- Region: Austria East
- PostgreSQL version: 15.18
- Server state at inspection: Ready

No client content, document text, communication body, legal note, or business row was queried.

## Migration Metadata

- Current finished production migration head: `20260701120000_add_outlook_communication_provider_fields`.
- Candidate `20260718120000_add_task_submission_workflow`: absent.
- Candidate tables, enums, indexes, constraints, and `time_entries.taskId`: absent, so no name collision was detected.
- Required baseline tables used by the candidate migration are present.

## Operational Metadata

- Active sessions observed: 8.
- Non-granted locks observed: 0.
- Backup retention: 7 days.
- Geo-redundant backup: disabled.
- High availability: disabled.
- Public network access: enabled.

These settings were read only. No Azure resource, firewall rule, app setting, SKU, scale, or server configuration was changed.

## Readiness Assessment

The database shape is compatible with the reviewed additive SQL. The absence of high availability and geo-redundant backup raises rollback sensitivity: a later operator must explicitly confirm acceptable PITR/backup posture and maintenance timing before any write.

Because the checked-in full migration chain is not replayable from empty, database readiness does not authorize `prisma migrate deploy`. The only supportable next action is a separately approved, migration-specific operator ticket using the reviewed SQL and the runbook in `docs/task-lifecycle-production-migration-runbook.md`.

## Stop Conditions

Stop before apply if any of the following changes:

- production migration head differs from `20260701120000_add_outlook_communication_provider_fields`;
- any candidate object already exists unexpectedly;
- blocking locks or abnormal session pressure are present;
- backup/PITR posture cannot be accepted by the operator;
- artifact or source checksum does not match the official release commit;
- the execution method would run unrelated pending migrations.

Classification: `TASK_LIFECYCLE_RELEASE_INTEGRATED_READY_FOR_PRODUCTION_MIGRATION_APPROVAL`
