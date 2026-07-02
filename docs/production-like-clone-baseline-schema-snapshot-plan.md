# Production-Like Clone Baseline Schema Snapshot Plan

Classification target: `production_like_clone_baseline_schema_snapshot_plan_documented_no_runtime_change_no_schema_change_no_db_change`

This is a docs-only plan for a future production-like clone baseline schema snapshot. It does not connect to production, create an Azure clone, connect to any database, mutate a database, edit `Backend/prisma/schema.prisma`, create migrations, edit migration SQL, run `prisma migrate`, run `prisma db push`, deploy, change runtime code, or handle secrets.

## 1. Executive summary

Future `CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1` work remains blocked because the current Prisma migration chain cannot replay from an empty database and repo/history evidence is only partially recoverable.

Recommended evidence path:

- Use an isolated production-like PITR clone for read-only schema snapshot and later approved migration proof.
- Do not connect to production directly.
- Do not use the drifted local `localhost/adminiculum` database as proof.
- Do not create executable local bootstrap SQL until clone evidence resolves core baseline shape questions.
- Capture schema metadata only: migration history, tables, columns, enums, indexes, constraints, and FKs.
- Export no business/client rows and no secrets.

The clone snapshot does not replace migration review. It supplies deploy-facing evidence about the real database shape and migration metadata so future additive migrations can be designed and tested safely.

## 2. Current blocker and why clone evidence is needed

Current blocker:

- `20260211153100_baseline` is intentionally no-op.
- `20260212180000_add_workload_tracking` expects `clients` to already exist.
- Empty DB replay fails because the no-op baseline does not create `clients`.
- Repo/history evidence is B/D hybrid: partially recoverable, but incomplete.
- Executable local-only bootstrap SQL remains unsafe.

Why repo/history is insufficient:

- Old schema snapshots already contain post-baseline objects.
- The recovered `add_contract_tables.sql` sidecar is partial and not the checksummed Prisma baseline migration.
- Exact DDL for core baseline tables remains unresolved: `clients`, `users`, `cases`, `documents`, `tasks`.
- Physical ID types and enum/text shapes remain unresolved.
- Current `schema.prisma` is current end-state, not historical baseline.

Why clone evidence is needed:

- A production-like clone should contain the real baseline state represented by the no-op baseline.
- It should contain the actual `_prisma_migrations` metadata and current production-like drift.
- It can reveal whether repo migrations and current schema align enough for future additive migration proof.
- It can prove clone-target compatibility before any production migration planning.

## 3. Safety and non-goals

This task is planning only.

Non-goals:

- no production DB connection;
- no Azure portal/CLI action;
- no clone creation;
- no DB connection;
- no DB mutation;
- no schema edit;
- no migration creation or edit;
- no `prisma migrate`;
- no `prisma db push`;
- no DB reset;
- no deploy;
- no runtime code changes;
- no API/frontend/auth/client portal changes;
- no secrets.

Future snapshot tasks must also avoid:

- printing connection strings;
- committing `.env` files;
- exporting business/client data rows;
- using production directly;
- starting application runtime against the clone unless a separate approved plan exists.

## 4. Clone target options

| Option | Description | Pros | Risks | Recommendation |
| --- | --- | --- | --- | --- |
| A — Azure PostgreSQL PITR clone | Point-in-time clone from production-like source | Closest to production state; best for deploy-facing proof; includes real migration metadata | Requires operational setup and strict target guards | Recommended |
| B — Existing staging database | Pre-existing non-production DB | Easy if already maintained | May be stale, drifted, or missing production migration history | Use only after verification |
| C — Schema-only export from production-like source | Sanitized metadata snapshot | Safer for offline analysis; can be committed if sanitized | May lose `_prisma_migrations` details or index/FK nuance if incomplete | Good supplement, not sole proof |
| D — Local drifted DB | Existing `localhost/adminiculum` | Convenient | Known drift; false confidence | Reject as proof |
| E — Empty clean DB | Empty local database | Useful after bootstrap exists | Cannot replay current chain today | Reject as full proof until bootstrap issue is solved |

Recommendation:

- Use Option A: isolated PITR/production-like clone.
- Use Option C only as a sanitized evidence artifact derived from a verified clone.
- Never use production directly.

## 5. Mandatory clone safety requirements

Clone requirements:

- clone is clearly named as non-production;
- clone identity is verified before any query;
- clone is isolated from production app traffic;
- no production App Service points at clone;
- clone credentials are separate and temporary where possible;
- clone connection string is never committed;
- clone access is handled via local shell/session variables only;
- firewall/network access is restricted;
- no application runtime is started against clone in snapshot phase;
- no emails, webhooks, Graph calls, or external callbacks can be sent from clone usage;
- first phase is read-only schema inspection only.

Command safety:

- prohibit `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `DROP`, `CREATE`, `GRANT`, `REVOKE`, `VACUUM FULL`;
- prohibit `prisma migrate deploy`;
- prohibit `prisma migrate dev`;
- prohibit `prisma db push`;
- prohibit reset commands;
- allow metadata-only `SELECT` queries and `prisma validate`;
- allow `prisma migrate status` only when pointed at a verified non-production clone and no migration apply is triggered.

## 6. Read-only schema snapshot scope

### A) Prisma migration metadata

Capture from `_prisma_migrations`:

- migration name;
- checksum;
- started timestamp;
- finished timestamp;
- rolled-back timestamp;
- applied step count;
- failed logs presence, if any;
- whether `20260211153100_baseline` exists;
- whether `20260212180000_add_workload_tracking` exists;
- whether `20260515190000_add_lawyer_handoff_package` exists;
- whether `20260622150000_add_lawyer_handoff_packages_foundation` exists;
- whether communication migrations exist;
- whether any migration names exist in clone but not repo;
- whether repo migrations are missing from clone.

### B) Database objects

Capture:

- schemas;
- tables;
- columns;
- column physical types;
- nullability;
- defaults;
- primary keys;
- foreign keys;
- unique constraints;
- check constraints;
- indexes;
- enum types and values;
- sequences/default functions where relevant.

### C) Baseline-critical objects

Inspect at minimum:

- `clients`;
- `users`;
- `cases`;
- `tasks`;
- `documents`;
- `contract_templates`;
- `contract_generations`;
- `communications`;
- `communication_attachments`;
- workload/time tracking tables;
- handoff package tables/enums;
- document review/session tables;
- automation tables;
- tables and enums referenced by early migrations;
- any object relevant to future Client Portal and Connector migrations.

### D) Drift indicators

Identify:

- clone objects not represented in `schema.prisma`;
- `schema.prisma` models not found in clone;
- clone migrations not present in repo;
- repo migrations not applied to clone;
- failed or rolled-back migrations;
- enum value drift;
- shared table column drift;
- FK/index drift;
- local-only feature foundation tables absent from clone;
- clone-only tables that must be preserved.

## 7. Future read-only command plan

These are example commands for a future explicitly approved clone snapshot task. They must not be run in this docs task.

Use placeholders only:

- `<CLONE_DATABASE_URL>`
- `<CLONE_HOST>`
- `<CLONE_DB>`
- `<LOCAL_OUTPUT_DIR>`

### Shell setup

```powershell
# Future task only. Do not commit this value.
$env:DATABASE_URL = "<CLONE_DATABASE_URL>"
```

### Identity checks

```powershell
# Future task only. Read-only identity checks.
psql "<CLONE_DATABASE_URL>" -c "select current_database() as db, inet_server_addr() as server_addr, current_user as user_name;"
psql "<CLONE_DATABASE_URL>" -c "select current_setting('server_version') as postgres_version;"
```

Expected operator checks:

- database equals expected `<CLONE_DB>`;
- host/server identity matches expected `<CLONE_HOST>`;
- target name is not production;
- user is a read-only or least-privilege inspection user if available.

### Prisma non-mutating checks

```powershell
cd Backend
npx.cmd prisma validate
npx.cmd prisma migrate status
```

`prisma migrate status` is allowed only after target verification and only because it inspects migration metadata; it must not be combined with deploy/dev/reset commands.

### Read-only catalog queries

```sql
-- Migration metadata
select migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count,
       case when logs is null or logs = '' then false else true end as has_logs
from "_prisma_migrations"
order by started_at, migration_name;

-- Tables
select table_schema, table_name
from information_schema.tables
where table_schema not in ('pg_catalog', 'information_schema')
order by table_schema, table_name;

-- Columns
select table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema not in ('pg_catalog', 'information_schema')
order by table_schema, table_name, ordinal_position;

-- Enum values
select n.nspname as schema_name, t.typname as enum_name, e.enumlabel as enum_value, e.enumsortorder
from pg_type t
join pg_enum e on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
order by n.nspname, t.typname, e.enumsortorder;

-- Indexes
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname not in ('pg_catalog', 'information_schema')
order by schemaname, tablename, indexname;

-- Foreign keys
select
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
order by tc.table_schema, tc.table_name, tc.constraint_name, kcu.column_name;
```

No business data row queries should be run.

## 8. Snapshot artifact plan

Future safe artifacts:

- `docs/production-like-clone-baseline-schema-snapshot.md`
- sanitized table inventory;
- sanitized column/type inventory;
- sanitized enum inventory;
- sanitized FK/index inventory;
- sanitized `_prisma_migrations` name/checksum/status inventory;
- comparison tables against repo migration folders and `schema.prisma`.

Temporary outputs:

- write raw query output only under `<LOCAL_OUTPUT_DIR>`;
- prefer ignored/local temp folders;
- inspect and sanitize before committing anything;
- never commit connection strings;
- never commit business/client rows;
- never commit credentials, host passwords, tokens, or app settings.

Snapshot content should be metadata-only.

## 9. Evidence comparison plan

Compare clone snapshot against:

- `Backend/prisma/schema.prisma`;
- `Backend/prisma/migrations`;
- `docs/baseline-object-inventory-local-bootstrap.md`;
- `docs/historical-baseline-evidence-review-local-bootstrap.md`;
- `docs/migration-history-reconciliation-lawyer-handoff-decision.md`;
- `docs/PRODUCTION_MIGRATION_RECONCILIATION_RUNBOOK.md` if still applicable.

Comparison questions:

- Does clone have the baseline objects missing from empty DB replay?
- What are the physical ID types for `clients`, `users`, `cases`, `documents`, and `tasks`?
- Does clone migration metadata explain why the no-op baseline works in production-like state?
- Does clone have migration rows absent from the repo?
- Does the repo have migrations not applied to clone?
- Does clone contain `20260515190000_add_lawyer_handoff_package`?
- Does clone contain `20260622150000_add_lawyer_handoff_packages_foundation`?
- Are handoff objects absent, duplicated, or present once?
- Are communication objects present and aligned with current migration history?
- Which current Prisma models are absent from clone?
- Which clone tables/enums are absent from Prisma?
- Is clone suitable for future additive migration proof?

## 10. Future migration proof flow using clone

Phase 1 — docs-only plan:

- current task;
- no DB or Azure access.

Phase 2 — create/use isolated clone:

- explicit ops task only;
- verify target is non-production;
- restrict access.

Phase 3 — read-only schema snapshot:

- schema metadata only;
- no writes.

Phase 4 — compare clone to repo:

- identify baseline objects;
- identify drift;
- decide if clone can be migration proof target.

Phase 5 — approved candidate migration proof:

- only after explicit approval;
- apply future additive migration candidate to clone only;
- no production apply.

Phase 6 — backend validation:

- run `prisma validate`;
- run backend typecheck/tests;
- route smoke only if an app runtime is intentionally deployed/pointed to a safe environment.

Phase 7 — production planning:

- separate production preflight;
- separate approval;
- no direct `CP-SCHEMA-1` or `CONNECTOR-SCHEMA-1` production apply without clone proof.

## 11. Clone acceptance criteria

Accept clone as migration proof target only if:

- clone is isolated and confirmed non-production;
- clone has no production application traffic;
- clone credentials are handled outside committed files;
- clone has expected production-like schema;
- clone has `_prisma_migrations`;
- clone has no unresolved failed migrations;
- clone has baseline objects needed by early migrations;
- clone migration metadata is understood;
- clone drift is documented and not blocking the candidate migration;
- clone does not show duplicate or conflicting handoff migration objects;
- no sensitive data is exported to committed docs;
- no runtime app is using clone;
- candidate migration is additive and reviewed before apply.

If criteria fail:

- classify clone as evidence-only;
- do not use as migration proof target;
- create a separate drift reconciliation plan.

## 12. Risk register

| Risk | Severity | Mitigation | Blocking status |
| --- | --- | --- | --- |
| Accidentally connecting to production | Critical | Require target identity checks, explicit clone name, no production host, peer review before commands | Blocking |
| Printing secrets | Critical | Use placeholders in docs; never commit `.env`; redact outputs | Blocking |
| Exporting business/client data | Critical | Schema metadata only; no row dumps | Blocking |
| Clone not actually production-like | High | Verify source/restore point and migration metadata | Blocking for proof |
| Clone stale | Medium/high | Record restore point and compare against current production deploy/migration timeline | Blocking if outdated |
| Clone migration metadata differs from repo | High | Document mismatch; classify evidence-only until reconciled | Blocking |
| Running mutating command by mistake | Critical | Prohibit migrate deploy/dev/db push/reset and DDL/DML commands | Blocking |
| Application sends external notifications from clone | Critical | Do not run app runtime against clone in snapshot phase | Blocking |
| Connection strings committed to docs | Critical | Placeholder-only docs; sanitize artifacts before commit | Blocking |
| Clone proof gives false confidence if production changes later | High | Time-bound proof; repeat preflight before production apply | Blocking for stale proof |
| Future migration works on clone but fails on production due to drift | High | Repeat production preflight and compare `_prisma_migrations` immediately before production apply | Blocking |

## 13. Blocking issues

Still blocking future schema work:

- no production-like clone snapshot has been captured in the current chain;
- no exact core baseline DDL is available for `clients`, `users`, `cases`, `documents`, and `tasks`;
- local bootstrap SQL remains unsafe;
- no disposable DB bootstrap proof has passed;
- no clone proof exists for `CP-SCHEMA-1` or `CONNECTOR-SCHEMA-1`;
- future candidate migrations are not created and not approved.

This plan does not unblock `CP-SCHEMA-1` or `CONNECTOR-SCHEMA-1`; it defines the safe evidence path that can.

## 14. Recommended next prompt

Recommended next prompt:

`Adminiculum — production-like clone baseline schema snapshot read-only execution`

That future prompt must:

- explicitly approve clone access;
- verify target is non-production before any query;
- use placeholders/local shell variables for secrets;
- run read-only schema metadata queries only;
- produce a sanitized snapshot doc;
- avoid migrations, DB writes, app runtime, production access, and deploy.

If clone access is not available, use:

`Adminiculum — archived baseline sidecar SQL comparison docs-only`

That fallback should remain repo/history-only and still avoid executable bootstrap SQL.
