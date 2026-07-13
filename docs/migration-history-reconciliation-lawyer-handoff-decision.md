# Migration History Reconciliation Decision — Lawyer Handoff Package Foundation

Classification target: `migration_history_reconciliation_decision_documented_no_runtime_change_no_db_change`

Decision date: 2026-07-01

This document records the migration-history reconciliation decision for the lawyer handoff package foundation before future Client Portal CP-SCHEMA-1 migration work. It does not edit `Backend/prisma/schema.prisma`, create or edit Prisma migration SQL, create Client Portal tables, run a mutating Prisma command, mutate a database, change runtime behavior, enable client portal, or deploy.

## 1. Executive summary

Recommended decision: keep the current repo migration chain as the working source of truth for future migration generation, treat the current local `localhost/adminiculum` database as drifted/disposable for migration-history purposes, and use a clean local/shadow/clone database for future CP-SCHEMA-1 generation and testing.

Do not restore `20260515190000_add_lawyer_handoff_package` into the active repo migration chain without a separate, explicit historical-migration rewrite decision. The old 202605 migration and the current `20260622150000_add_lawyer_handoff_packages_foundation` migration both create the same handoff package enum/table foundation. Restoring the old SQL alongside the current 202606 migration would make a clean database path likely fail on duplicate enum/table creation.

Do not create fake placeholder SQL. Do not run `prisma migrate resolve`. Do not edit the 202606 migration as part of Client Portal work.

CP-SCHEMA-1 remains blocked until the future migration work is pointed at a clean database target whose `_prisma_migrations` history matches the current repo chain, or until a separate migration-history reconciliation task deliberately changes the repo/database history plan.

## 2. Known blocker

The previous Client Portal migration-history hygiene preflight found:

- an empty untracked local folder named `Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package` caused `prisma migrate status` to fail with `P3015`;
- removing that empty local folder cleared the `P3015` symptom;
- `prisma migrate status` then exposed a deeper mismatch:
  - local DB has `20260515190000_add_lawyer_handoff_package` recorded in `_prisma_migrations`;
  - current repo does not contain that migration;
  - current repo contains `20260622150000_add_lawyer_handoff_packages_foundation`, which creates the same foundation objects.

This is not a Client Portal schema issue. It is a migration-history hygiene issue that must be kept separate from CP-SCHEMA-1.

## 3. Evidence inspected

Read-only evidence inspected:

- `Backend/prisma/migrations`
- `Backend/prisma/schema.prisma`
- `Backend/prisma/migrations/20260622150000_add_lawyer_handoff_packages_foundation/migration.sql`
- recovered historical SQL from `778105e:Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package/migration.sql`
- `docs/client-portal-v1-db-drift-readiness-audit.md`
- `docs/client-portal-v1-migration-history-hygiene-preflight.md`
- `docs/migration-reconciliation/RC2C_HANDOFF_FOUNDATION_DRAFT.md`
- `docs/PRODUCTION_MIGRATION_RECONCILIATION_RUNBOOK.md`
- git history for the 202605 and 202606 handoff migration paths
- local `_prisma_migrations` metadata and local PostgreSQL catalog metadata via read-only SQL

Relevant git history:

- `778105e feat: add lawyer handoff package workflow`
  - added `Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package/migration.sql`;
  - modified `Backend/prisma/schema.prisma`.
- `a5d54f0 feat(db): add handoff package foundation migration`
  - deleted `Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package/migration.sql`;
  - added `Backend/prisma/migrations/20260622150000_add_lawyer_handoff_packages_foundation/migration.sql`.

Current active migration chain:

- does not include `20260515190000_add_lawyer_handoff_package`;
- includes `20260622150000_add_lawyer_handoff_packages_foundation`;
- latest active migration is `20260701120000_add_outlook_communication_provider_fields`.

## 4. Handoff migration comparison

The recovered 202605 SQL created:

- enum `LawyerHandoffPackageType` with `STANDARD`, `FINAL_APPROVAL`;
- enum `LawyerHandoffStatus` with `DRAFT`, `PREPARED`, `SUBMITTED`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `ARCHIVED`;
- enum `LawyerHandoffDecision` with `APPROVED`, `REJECTED_NEEDS_REVISION`, `REJECTED_BLOCKING`;
- table `lawyer_handoff_packages`;
- primary key `lawyer_handoff_packages_pkey`;
- foreign key `lawyer_handoff_packages_caseId_fkey` to `cases(id)` with `ON DELETE CASCADE`;
- indexes:
  - `lawyer_handoff_packages_caseId_status_idx`;
  - `lawyer_handoff_packages_sourceDocumentId_idx`;
  - `lawyer_handoff_packages_legalAnalysisId_idx`;
- `updatedAt` default and a PostgreSQL trigger/function to keep `updatedAt` current.

The active 202606 SQL creates:

- the same three enum names and values;
- the same `lawyer_handoff_packages` table name;
- the same primary key name;
- the same core columns;
- the same three index names;
- the same foreign key name to `cases(id)`, with `ON DELETE CASCADE ON UPDATE CASCADE`;
- no trigger/function; relies on Prisma/runtime `@updatedAt` behavior and an application-provided `updatedAt` value.

The current Prisma schema defines:

- `LawyerHandoffPackageType`;
- `LawyerHandoffStatus`;
- `LawyerHandoffDecision`;
- model `LawyerHandoffPackage`;
- table mapping `@@map("lawyer_handoff_packages")`;
- indexes on `[caseId, status]`, `[sourceDocumentId]`, and `[legalAnalysisId]`;
- relation `case` with `onDelete: Cascade`.

Comparison conclusion:

- The 202605 migration and the active 202606 migration represent the same foundation intent.
- The 202606 migration appears to supersede the 202605 migration for the current repo chain.
- Restoring the 202605 SQL beside the 202606 migration would create duplicate-object risk for clean databases.
- Editing the 202606 migration to become conditional/idempotent would be historical migration editing and is not justified as part of Client Portal work.

## 5. Local DB read-only findings

DB connection used:

- source: `Backend/.env`;
- observed target: local `localhost/adminiculum`;
- production DB: not used.

Read-only `_prisma_migrations` findings:

- `20260515190000_add_lawyer_handoff_package` exists, finished successfully, not rolled back.
- `20260622150000_add_lawyer_handoff_packages_foundation` is absent locally.

Read-only local object findings:

- table `lawyer_handoff_packages` exists;
- enum types `LawyerHandoffPackageType`, `LawyerHandoffStatus`, and `LawyerHandoffDecision` exist with the expected values;
- table columns match the old 202605 shape, including `updatedAt` default `CURRENT_TIMESTAMP`;
- indexes exist:
  - `lawyer_handoff_packages_caseId_status_idx`;
  - `lawyer_handoff_packages_sourceDocumentId_idx`;
  - `lawyer_handoff_packages_legalAnalysisId_idx`;
- FK exists as `FOREIGN KEY ("caseId") REFERENCES cases(id) ON DELETE CASCADE`.

Read-only status command:

- `cd Backend && npx.cmd prisma migrate status` is non-mutating and safe against local DB.
- It no longer fails with `P3015`.
- It still reports migration-history mismatch:
  - unapplied repo migrations:
    - `20260622150000_add_lawyer_handoff_packages_foundation`;
    - `20260628190000_add_communication_baseline`;
    - `20260701120000_add_outlook_communication_provider_fields`;
  - database migration not found locally:
    - `20260515190000_add_lawyer_handoff_package`.

No DB writes were performed.

## 6. Decision options

### Option A — Restore old migration folder to repo

Assessment: reject for now.

Pros:

- Would match the current local DB `_prisma_migrations` row.
- Exact historical SQL is recoverable from git.

Cons:

- Active repo already has `20260622150000_add_lawyer_handoff_packages_foundation`.
- Both migrations create the same enums/table/indexes/constraint names.
- A clean DB applying both would likely fail on duplicate object creation.
- Making this safe would require editing/removing a historical migration, which is broader than this decision task.

### Option B — Keep repo as source of truth and abandon/recreate mismatched local DB

Assessment: recommended.

Pros:

- Avoids rewriting migration history.
- Avoids adding fake or duplicate historical SQL.
- Keeps Client Portal schema work separate from lawyer handoff migration reconciliation.
- Lets future CP-SCHEMA-1 use a clean database whose migration history matches the current active repo chain.

Cons:

- The current local `localhost/adminiculum` DB remains unsuitable for migration-generation proof.
- Developer convenience may require creating a new local database or resetting a disposable local database in a separate explicit task.

### Option C — Use a separate clean shadow/dev database for CP-SCHEMA-1 generation/testing

Assessment: recommended together with Option B.

Pros:

- Keeps current local DB untouched.
- Avoids production/clone risk.
- Provides a clean Prisma migration target.
- Makes CP-SCHEMA-1 validation independent of old local handoff history.

Cons:

- Requires a separate setup task.
- Still requires clone/staging read-only proof before any real migration apply.

### Option D — Prisma migrate resolve / mark local history

Assessment: reject for this task; possible only as a future local-only repair with explicit approval.

Pros:

- Could alter local `_prisma_migrations` metadata to make local status cleaner.

Cons:

- It writes database metadata.
- It can hide real drift if used casually.
- It should not be used against production or shared DBs.
- It is unnecessary if the local DB is treated as disposable for migration work.

### Option E — Create fake placeholder migration.sql

Assessment: reject.

Reasons:

- It would make Prisma tooling quiet without representing the applied SQL.
- It would lie about migration history.
- It would make fresh DB, local DB, clone, and production reasoning worse.
- It would increase future drift risk around `lawyer_handoff_packages`.

### Option F — Edit later 202606 migration to account for old migration

Assessment: reject for this Client Portal preflight.

Pros:

- Could theoretically make a migration chain tolerate either object state.

Cons:

- Historical migration editing is high risk.
- It changes fresh-DB behavior.
- It could conflict with the documented RC2C handoff foundation path.
- It is not needed to produce a safe Client Portal migration if a clean DB is used.

## 7. Recommended decision

Recommended path:

1. Do not modify active repo migration history now.
2. Do not restore `20260515190000_add_lawyer_handoff_package`.
3. Do not create fake placeholder SQL.
4. Treat current local `localhost/adminiculum` as drifted/disposable for migration-generation purposes.
5. Use a clean local/shadow database for future CP-SCHEMA-1 generation and initial validation.
6. Before any CP-SCHEMA-1 apply, run read-only clone/staging introspection against the intended target.
7. If lawyer handoff package migration history must be reconciled for production/new-environment bootstrapping, handle it as a separate dedicated task, not bundled with Client Portal.

Production impact:

- This task did not inspect production.
- Historical `docs/PRODUCTION_MIGRATION_RECONCILIATION_RUNBOOK.md` recorded a PITR clone where `lawyer_handoff_packages` was absent at that time.
- Current production state is not inferred here.
- Future production/clone action must start with read-only introspection.

## 8. Why fake placeholder SQL is rejected

Adding an empty or no-op `migration.sql` under `20260515190000_add_lawyer_handoff_package` would be tempting because it might satisfy Prisma's file-existence expectations. It is still rejected because:

- the historical migration was not empty;
- local DB has actual handoff objects that correspond to that historical SQL;
- a fake file would conceal the fact that local DB and repo history disagree;
- it would create false confidence before CP-SCHEMA-1;
- it would make later production/clone reconciliation harder.

Migration history is evidence. If the evidence is uncomfortable, the safe move is to document and isolate it, not forge a quieter version.

## 9. Impact on future Client Portal CP-SCHEMA-1

CP-SCHEMA-1 is not unblocked for generation against the current local DB.

CP-SCHEMA-1 can proceed only after:

- a clean local/shadow DB is available and confirmed to match current repo migrations; or
- a dedicated reconciliation task changes the migration-history plan and validates it.

The Client Portal migration itself should remain:

- additive;
- inert;
- default-off;
- separate from lawyer handoff package reconciliation;
- free of runtime route changes;
- free of visibility changes to cases, documents, communications, tasks, time entries, reviews, AI outputs, or SharePoint metadata.

## 10. Required next action

Required next action before CP-SCHEMA-1:

- create/use a clean local or shadow database whose `_prisma_migrations` history matches the current repo migration chain, then run `prisma migrate status` and schema validation against that target; or
- explicitly approve a separate migration-history reconciliation implementation for lawyer handoff package history.

Do not use the current local `localhost/adminiculum` DB as the migration-generation proof target.

## 11. Remaining risks

| Risk | Severity | Evidence | Mitigation |
| --- | --- | --- | --- |
| Local DB migration history differs from repo | High | Local has `20260515190000_add_lawyer_handoff_package`; repo does not | Treat local DB as disposable for migration work |
| Restoring 202605 creates duplicate clean-DB path | High | 202605 and 202606 both create handoff enums/table | Do not restore without a dedicated history rewrite decision |
| Production/clone state may differ | High | This task did not query production; older PITR clone docs said handoff table absent | Run read-only introspection before any real apply |
| CP-SCHEMA-1 accidentally bundled with handoff reconciliation | High | Both are migration concerns but unrelated product surfaces | Keep CP-SCHEMA-1 separate and clean |
| `migrate resolve` hides drift | Medium | It mutates DB metadata without changing objects | Avoid except explicit local-only repair |
| Fresh environment bootstrap risk | Medium | Current repo chain includes 202606 handoff migration only | Validate from clean DB before future migration generation |

## 12. Validation

Validation run for this decision task:

- `git diff --check` — passed.
- `cd Backend && npx.cmd prisma validate` — passed.
- `cd Backend && npx.cmd prisma migrate status` — safe/read-only against local DB; still reports the documented mismatch.
- `cd Backend && npx.cmd tsc --noEmit` — passed.
- `cd Backend && npm.cmd test -- --runInBand` — passed: 8 suites, 92 tests.

No build, deployment, Prisma migration apply, or database write is required for this docs-only decision.

## 13. Recommended next prompt

Recommended next prompt:

`Adminiculum — CLIENTPORTAL1F clean local migration target preflight for CP-SCHEMA-1`

Suggested scope:

- no production access;
- no Client Portal schema creation yet;
- create or select a clean local/shadow database only if explicitly approved;
- prove `prisma migrate status` can run against a database matching current repo history;
- then return to CP-SCHEMA-1 migration drafting.

Final classification:

`migration_history_reconciliation_decision_documented_no_runtime_change_no_db_change`

## WORKFLOW-CORE-TASKS-HANDOFF-1 note

The Case Workbench reads lawyer handoff packages as metadata-only work items when the handoff foundation is enabled. Recipient-specific offer/accept/return semantics remain out of scope because the current production-compatible package schema does not include a recipient field.
