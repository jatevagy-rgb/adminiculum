# Production-Like Clone Baseline Schema Snapshot

Classification target: `production_like_clone_baseline_schema_snapshot_blocked_no_runtime_change_no_schema_change_no_db_change`

This document records blocked read-only execution attempts for the production-like clone baseline schema snapshot. No clone connection was available in the local shell/session, so no database connection was opened and no schema metadata was queried.

## 1. Executive summary

The production-like clone baseline schema snapshot is **blocked before connection**.

Reason:

- `CLONE_DATABASE_URL` was not set in the local shell/session.
- No connection string was available that could be confidently classified as an isolated non-production clone.

Per the execution safety rules, the task stopped before any DB query. Production and Azure were not touched.

Impact:

- No clone schema snapshot was captured.
- No Prisma migration metadata was captured from a clone.
- `CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1` remain blocked.

Latest execution attempt:

- branch: `hotfix/runtime-shape-20260308`;
- latest commit at start: `a51f9fe docs: CP-SCHEMA-1 baseline/proof unblocking preflight`;
- **two independent stop-condition triggers**, both before any DB connection:
  1. the operator confirmation in the task brief still contained **placeholders**
     (`<non-secret clone name>`, unresolved `Read-only user: yes/no`) rather than a
     concrete filled non-secret clone name/classification;
  2. a sanitized local shell check found **`CLONE_DATABASE_URL` not set**;
- per the hard stop condition, the task stopped before any DB query â€” **no connection
  was opened**;
- earlier attempts recorded the same blocked state (this is a repeated blocked
  execution, not a regression);
- `CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1` remain **NO-GO** per
  `docs/client-portal-v1-cp-schema1-baseline-proof-unblocking-preflight.md`.

## 1a. Operator note â€” existing clone candidate discovered (read-only Azure listing)

**Date context:** recorded at commit `8df1594` (branch `hotfix/runtime-shape-20260308`).

A **read-only** Azure resource listing (`az postgres flexible-server list`, no
mutation) observed **two** PostgreSQL flexible servers in resource group
`Adminiculum-RG`:

| Server (non-secret name) | State | Version | Apparent role |
| --- | --- | --- | --- |
| `adminiculum` | Ready | 15 | production DB |
| `adminiculum-bp3-rc1b-clone` | Ready | 15 | **appears to be an existing clone by name** |

This means a **clone candidate may already exist**, so a brand-new PITR/clone
creation is likely **not** required â€” but this does **not** unblock the snapshot.

Strictly what this discovery is and is not:
- **Is:** a read-only observation of resource names + state.
- **Is not:** a confirmation that `adminiculum-bp3-rc1b-clone` is isolated,
  non-production, or safe to query. The name is suggestive, not authoritative.

Confirmed facts for this discovery:
- clone created by this task: **no** (an existing candidate was merely observed);
- DB connection made: **no**;
- secrets retrieved or printed: **no** (only non-secret server names);
- production/Azure resource modified: **no** (read-only `list` only);
- `CLONE_DATABASE_URL` set: **no**;
- read-only connection string available: **no**.

Outstanding requirements before any snapshot (unchanged):
1. **Operator/DBA must confirm** `adminiculum-bp3-rc1b-clone` is an isolated,
   **non-production** clone with no live app runtime pointed at it.
2. A **read-only connection string** for that clone must be supplied via a secure
   channel and set into `CLONE_DATABASE_URL` **in the local shell only** (never
   committed, never a `.env` file, never pasted into chat).
3. The operator confirmation block must be filled **without placeholders** (using
   the real clone name `adminiculum-bp3-rc1b-clone`).

Until 1â€“3 are satisfied, **snapshot execution remains blocked**; **CP-SCHEMA-1**
and **CONNECTOR-SCHEMA-1** remain **NO-GO**.

## 2. Clone identity and safety verification

Sanitized local environment check:

| Variable | Result | Action |
| --- | --- | --- |
| `CLONE_DATABASE_URL` | not set | No DB connection attempted |

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

Sanitized environment availability checks:

```powershell
$names = @('CLONE_DATABASE_URL')
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

`Adminiculum â€” production-like clone baseline schema snapshot read-only execution with clone connection`

That prompt should provide or confirm:

- operator/DBA confirmation that the observed candidate `adminiculum-bp3-rc1b-clone`
  is an isolated **non-production** clone (or selection of another confirmed clone);
- a **read-only** `CLONE_DATABASE_URL` for that clone supplied only in the local
  shell/session, not committed;
- clone host/database classification as non-production;
- authorization to run read-only schema metadata queries;
- no Azure/production mutation;
- no Prisma migrate deploy/dev/db push;
- no business data export.

Note: because an existing clone candidate (`adminiculum-bp3-rc1b-clone`) was
observed, new PITR/clone creation is likely unnecessary â€” the missing pieces are
operator confirmation + a read-only connection string, not clone existence.

If clone credentials cannot be provided, the safe fallback remains:

`Adminiculum â€” archived baseline sidecar SQL comparison docs-only`

---

## Manual production-like clone snapshot findings â€” 2026-07-02

### Execution mode

The production-like clone metadata snapshot was executed manually by the operator through Azure Cloud Shell / psql using the read-only `adm_snapshot_ro` user.

This section records sanitized metadata findings only.

No business/client row data was exported.
No secrets, connection strings, passwords, tokens, or environment variable values are recorded.
No DDL/DML, Prisma migrate, Prisma db push, deployment, app runtime, or production DB access was performed by the documentation agent.

### Clone identity

- Clone candidate used: `adminiculum-bp3-rc1b-clone`
- Database: `adminiculum`
- Source classification: PITR / production-like clone
- Production DB targeted: no
- Manual DB connection used by operator: yes, read-only metadata inspection
- DB mutation performed: no

### `_prisma_migrations` metadata

The clone `_prisma_migrations` table contained 6 rows:

| Migration | Status observed |
|---|---|
| `20260211153100_baseline` | finished |
| `20260212180000_add_workload_tracking` | one rolled-back row, followed by a later finished row |
| `20260302142000_add_kb_learning_escalation` | rolled back |
| `20260622150000_add_lawyer_handoff_packages_foundation` | finished |
| `20260628190000_add_communication_baseline` | finished |

Detailed operator-observed facts:

- `20260211153100_baseline`
  - started: `2026-02-24 15:14:12.293962+00`
  - finished: `2026-02-24 15:14:12.339309+00`
  - rolled back: no
  - applied steps: `1`

- `20260212180000_add_workload_tracking`
  - first row started: `2026-02-24 15:14:12.360124+00`
  - first row rolled back: `2026-02-24 15:15:00.350313+00`
  - later row started/finished: `2026-02-24 15:15:00.374758+00`
  - later row rolled back: no

- `20260302142000_add_kb_learning_escalation`
  - started: `2026-03-14 14:56:58.460657+00`
  - rolled back: `2026-03-14 15:57:26.076529+00`
  - finished: no

- `20260622150000_add_lawyer_handoff_packages_foundation`
  - started/finished: `2026-06-23 10:02:30.63146+00`
  - rolled back: no

- `20260628190000_add_communication_baseline`
  - started/finished: `2026-06-29 07:13:35.077457+00`
  - rolled back: no
  - applied steps: `1`

### Repo-vs-clone migration note

The clone did not show `20260515190000_add_lawyer_handoff_package` in `_prisma_migrations`.

The repo is known to contain `20260622150000_add_lawyer_handoff_packages_foundation`.

The observed handoff table is:

- `lawyer_handoff_packages`

No duplicate handoff package table was observed in the manual metadata checks.

### Baseline-critical objects observed

The clone contains the baseline-critical objects that were missing from empty-DB replay:

- `_prisma_migrations`
- `clients`
- `users`
- `cases`
- `tasks`
- `documents`
- `communications`

This is important because clean empty-DB migration replay is invalid: the no-op baseline does not create baseline objects, while later migrations expect objects such as `clients`.

The clone therefore demonstrates a production-like schema state that cannot be reproduced by replaying the current repo migrations from an empty database.

### Other notable tables observed

Manual metadata inspection also observed, among others:

- `communication_attachments`
- `lawyer_handoff_packages`
- `time_entries`
- `timeline_events`
- `workload_records`
- `client_workgroups`
- `matters`
- `document_versions`
- `notifications`
- `departments`
- `comments`
- `anonymous_documents`
- `automation_suggestions`
- `automation_execution_logs`
- `automation_execution_step_logs`
- `automation_trigger_events`
- `client_redaction_profiles`
- `contract_generations`
- `contract_templates`
- `system_settings`
- `task_assignment_history`
- `user_automation_preferences`
- `user_automation_suppressions`

### Review/session objects

Manual pattern-based table checks did not observe a dedicated review/session/document-review table.

This does not prove such functionality is absent at application level; it only records that no matching table was observed in the manual metadata query.

### Workload/time objects

The following workload/time-related objects were observed:

- `time_entries`
- `timeline_events`
- `workload_records`

### Foreign keys

The initial `information_schema` foreign-key query returned 0 rows, but a later `pg_constraint`-based foreign-key query returned 47 foreign keys.

Therefore, the clone does have DB-level foreign-key constraints. The `pg_constraint` result is the controlling evidence for FK presence.

Important FK examples observed:

- `cases.clientId` â†’ `clients.id`
- `cases.assignedLawyerId` â†’ `users.id`
- `cases.createdById` â†’ `users.id`
- `documents.caseId` â†’ `cases.id`
- `documents.clientId` â†’ `clients.id`
- `document_versions.documentId` â†’ `documents.id`
- `lawyer_handoff_packages.caseId` â†’ `cases.id`
- `matters.clientId` â†’ `clients.id`
- `tasks.caseId` â†’ `cases.id`
- `tasks.matterId` â†’ `matters.id`
- `tasks.sourceCommunicationId` â†’ `communications.id`
- `time_entries.matterId` â†’ `matters.id`
- `time_entries.userId` â†’ `users.id`
- `timeline_events.caseId` â†’ `cases.id`
- `workload_records.workgroupId` â†’ `client_workgroups.id`

### Indexes

Manual metadata inspection found 71 public indexes.

Important examples observed:

- `clients_pkey`
- `users_pkey`
- `users_email_key`
- `cases_pkey`
- `cases_caseNumber_key`
- `tasks_pkey`
- `documents_pkey`
- `documents_spItemId_key`
- `communications_pkey`
- `communications_caseId_createdAt_idx`
- `communications_clientId_createdAt_idx`
- `lawyer_handoff_packages_pkey`
- `lawyer_handoff_packages_caseId_status_idx`
- `time_entries_pkey`
- `time_entries_matterId_workDate_idx`
- `workload_records_pkey`
- `workload_records_workgroupId_period_key`

### Enums

The manual enum query returned 195 rows.

Only a summary is recorded here. The enum set includes internal application enums, including `UserRole` values such as `CLIENT`.

Important interpretation: the presence of internal `UserRole.CLIENT` does not satisfy the Client Portal v1 security architecture. The Client Portal design still requires separate `ClientPortalUser`, `ClientPortalMembership`, tenant isolation, publication artifacts, grants, and `/me`-scoped APIs.

### Interpretation

The clone contains the baseline objects that are missing from empty-DB replay.

This explains why the no-op baseline can coexist with later migrations in the production-like state.

The empty-DB replay remains invalid as proof.
The drifted local DB remains invalid as proof.
The production-like clone is likely suitable for future additive migration proof.

### CP-SCHEMA-1 / CONNECTOR-SCHEMA-1 impact

CP-SCHEMA-1 should move from hard NO-GO to conditional implementation-preflight readiness.

This does not mean production-ready. It means the clone evidence is sufficient to prepare the next implementation preflight for an additive, inert, default-off CP-SCHEMA-1 candidate.

CONNECTOR-SCHEMA-1 remains conditional on the same baseline proof chain.

Before any actual schema implementation:

- repo-vs-clone migration comparison must be documented clearly;
- rolled-back migration rows must be acknowledged;
- CP-SCHEMA-1 scope must remain additive/inert/default-off;
- no existing data may become client-visible;
- no production migration may be run from this manual snapshot alone.

### Current conclusion

Clone suitability: likely suitable for future additive migration proof.

CP-SCHEMA-1 status: conditional / implementation-preflight ready, not production-ready.

CONNECTOR-SCHEMA-1 status: conditional / implementation-preflight ready, not production-ready.
