# Production-Like Clone Baseline Schema Snapshot

Classification target: `production_like_clone_baseline_schema_snapshot_blocked_no_runtime_change_no_schema_change_no_db_change`

This document records a blocked read-only execution attempt for the production-like clone baseline schema snapshot. No clone connection was available in the local shell/session, so no database connection was opened and no schema metadata was queried.

## 1. Executive summary

The production-like clone baseline schema snapshot was **blocked before connection**.

Reason:

- `CLONE_DATABASE_URL` was not set in the local shell/session.
- `DATABASE_URL` was not set in the local shell/session.
- No connection string was available that could be confidently classified as an isolated non-production clone.

Per the execution safety rules, the task stopped before any DB query. Production and Azure were not touched.

Impact:

- No clone schema snapshot was captured.
- No Prisma migration metadata was captured from a clone.
- `CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1` remain blocked.

## 2. Clone identity and safety verification

Sanitized local environment check:

| Variable | Result | Action |
| --- | --- | --- |
| `CLONE_DATABASE_URL` | not set | No DB connection attempted |
| `DATABASE_URL` | not set | No DB connection attempted |

Clone identity could not be verified because no clone connection was supplied.

Safety confirmations:

- production DB connection: no;
- Azure action: no;
- clone DB connection: no;
- connection string printed: no;
- app runtime pointed at clone: no;
- external callbacks/webhooks/Graph calls: no;
- env files changed or committed: no.

## 3. Commands executed

Repository/status checks:

```powershell
git status --short
git log -1 --oneline
git branch --show-current
```

Sanitized environment availability check:

```powershell
$names = @('CLONE_DATABASE_URL','DATABASE_URL')
foreach ($name in $names) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Output ("{0}: not set" -f $name)
    continue
  }
  # If set, parse and print only sanitized host/database classification.
}
```

Observed result:

```text
CLONE_DATABASE_URL: not set
DATABASE_URL: not set
```

No `psql`, Prisma DB, Azure CLI, or migration command was run against a database.

## 4. Prisma migration metadata summary

Not captured.

Reason:

- no confirmed non-production clone connection was available;
- `_prisma_migrations` was not queried;
- `prisma migrate status` was not run against any database.

Items still requiring clone snapshot:

- presence/status of `20260211153100_baseline`;
- presence/status of `20260212180000_add_workload_tracking`;
- whether `20260515190000_add_lawyer_handoff_package` exists in clone metadata;
- whether `20260622150000_add_lawyer_handoff_packages_foundation` exists in clone metadata;
- failed/rolled-back migration status;
- repo-vs-clone migration mismatch list.

## 5. Repo vs clone migration comparison

Not performed.

Reason:

- clone migration metadata was unavailable.

Known repo-side context remains:

- active repo has no-op baseline at `Backend/prisma/migrations/20260211153100_baseline/migration.sql`;
- empty DB replay previously failed at `20260212180000_add_workload_tracking`;
- repo/history evidence is partially recoverable only;
- executable local bootstrap SQL remains unsafe without clone/historical DDL evidence.

## 6. Baseline-critical object snapshot

Not captured.

Objects still requiring read-only clone metadata:

- `clients`;
- `users`;
- `cases`;
- `documents`;
- `tasks`;
- `contract_templates`;
- `contract_generations`;
- `communications`;
- `communication_attachments`;
- workload/time tracking tables;
- handoff package tables/enums;
- document review/session tables;
- automation tables;
- early-migration FK/index targets;
- Client Portal and Connector future-adjacent object namespace collision checks.

## 7. Tables/columns/enums/indexes/constraints summary

Not captured.

Reason:

- no clone connection was available;
- no `information_schema` or `pg_catalog` queries were run.

Still needed in a future read-only execution:

- table inventory;
- column/type/nullability/default inventory;
- enum type/value inventory;
- primary key inventory;
- foreign key inventory;
- unique/check constraint inventory;
- index inventory.

## 8. Handoff package migration/object findings

Not captured from clone.

Questions still open:

- Does clone have the old `20260515190000_add_lawyer_handoff_package` migration row?
- Does clone have the newer `20260622150000_add_lawyer_handoff_packages_foundation` migration row?
- Are handoff package objects absent, present once, or duplicated?
- Do handoff enums exist in clone?

## 9. Drift and mismatch findings

No new drift findings were captured because clone metadata was unavailable.

Existing docs remain the source of current drift context:

- `docs/PRODUCTION_MIGRATION_RECONCILIATION_RUNBOOK.md`
- `docs/baseline-object-inventory-local-bootstrap.md`
- `docs/historical-baseline-evidence-review-local-bootstrap.md`
- `docs/production-like-clone-baseline-schema-snapshot-plan.md`

## 10. Clone suitability for future additive migration proof

Suitability classification: **unknown / blocked**.

Reason:

- clone identity was not available;
- clone schema was not inspected;
- clone migration metadata was not inspected;
- no read-only proof exists for this execution attempt.

A clone can only be accepted as a future additive migration proof target after:

- target is confirmed non-production;
- connection string is supplied via local shell/session only;
- schema metadata is captured read-only;
- migration metadata is understood;
- no failed migrations or blocking drift are found;
- no sensitive data is exported.

## 11. Impact on CP-SCHEMA-1 / CONNECTOR-SCHEMA-1

`CP-SCHEMA-1` remains blocked.

`CONNECTOR-SCHEMA-1` remains blocked.

Reason:

- no clone evidence was captured;
- no exact core baseline DDL is available;
- local-only executable bootstrap SQL remains unsafe;
- no production-like clone proof exists for future additive migrations.

## 12. Risks and limitations

| Risk | Severity | Status | Mitigation |
| --- | --- | --- | --- |
| Accidentally connecting to production | Critical | Avoided | No DB connection was available or attempted |
| Printing secrets | Critical | Avoided | No connection string was printed |
| Exporting business/client data | Critical | Avoided | No DB query was run |
| Proceeding without clone proof | High | Avoided | Execution stopped before connection |
| CP/Connector work falsely considered unblocked | High | Avoided | This document records blocked state |

Limitation:

- This document is a blocked execution record, not a schema snapshot.

## 13. Recommended next prompt

Recommended next prompt:

`Adminiculum — production-like clone baseline schema snapshot read-only execution with clone connection`

That prompt should provide or confirm:

- a `CLONE_DATABASE_URL` supplied only in the local shell/session, not committed;
- clone host/database classification as non-production;
- authorization to run read-only schema metadata queries;
- no Azure/production mutation;
- no Prisma migrate deploy/dev/db push;
- no business data export.

If clone credentials cannot be provided, the safe fallback remains:

`Adminiculum — archived baseline sidecar SQL comparison docs-only`
