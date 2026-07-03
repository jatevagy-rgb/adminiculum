# Production Schema Snapshot Comparison Operator Runbook

Classification target: `production_schema_snapshot_comparison_runbook_documented_no_db_change_no_runtime_change`

This runbook prepares the next evidence-gathering step before any Prisma baseline/reset decision. It is Phase 1 preparation only: this agent did not connect to a database, touch Azure, run Prisma migration commands, deploy, edit schema/migration files, or enable Client Portal runtime.

## 1. Executive summary

Production-compatible Prisma baseline/reset work is blocked until the team has a current, SELECT-only snapshot of production schema from a fresh PITR clone and a comparison against `Backend/prisma/schema.prisma`.

The purpose of this runbook is to let an operator create a fresh clone, run a read-only schema metadata capture, compare the actual database shape to the Prisma schema/repo migrations, document results, and delete the clone. This is evidence gathering only. It must not mutate production, the clone, app runtime, or Client Portal behavior.

## 2. Safety scope

Required scope:

- fresh PITR clone only;
- SELECT-only queries;
- temporary read-only database user;
- no production DB mutation;
- no App Service connection to clone;
- clone deleted after verification unless explicitly retained for a documented reason;
- no Client Portal enablement;
- no business/client row export;
- no connection strings, passwords, or tokens printed into docs or chat.

The snapshot script is `docs/sql/production-schema-snapshot-readonly.sql` and is intended for operator execution against the fresh clone only.

## 3. Fresh clone creation instructions

Example clone parameters:

- clone name: `adminiculum-schema-snapshot-YYYYMMDD`;
- source server: `adminiculum`;
- database: `adminiculum`;
- resource group: `Adminiculum-RG`;
- location: `Austria East`.

Example Azure CLI shape for the operator to adapt:

```powershell
$cloneName = "adminiculum-schema-snapshot-YYYYMMDD"
$resourceGroup = "Adminiculum-RG"
$sourceServer = "adminiculum"
$location = "austriaeast"

az postgres flexible-server restore `
  --resource-group $resourceGroup `
  --name $cloneName `
  --source-server $sourceServer `
  --restore-time "<UTC PITR timestamp>" `
  --location $location
```

Operator must confirm after creation:

```text
Clone confirmation:
- Clone created/selected: yes
- Clone name: adminiculum-schema-snapshot-YYYYMMDD
- Source: PITR from production server adminiculum
- Database: adminiculum
- Production DB targeted: no
- App runtime pointed to clone: no
- Read-only user used: yes
- Secrets committed: no
- Permission to run SELECT-only metadata snapshot: yes
```

## 4. Read-only user setup instructions

Use a new temporary read-only user for the fresh clone. Do not reuse an old snapshot user.

Conceptual SQL for an operator/admin to run on the clone only:

```sql
-- Run only on the fresh clone, never on production.
CREATE USER adm_schema_snapshot_ro WITH PASSWORD '<temporary strong password>';
GRANT CONNECT ON DATABASE adminiculum TO adm_schema_snapshot_ro;
GRANT USAGE ON SCHEMA public TO adm_schema_snapshot_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO adm_schema_snapshot_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO adm_schema_snapshot_ro;
```

The snapshot execution itself must use this read-only user. The password must not be committed, pasted into docs, or printed in terminal transcripts shared back into the repo.

## 5. SELECT-only snapshot script

Script path:

`docs/sql/production-schema-snapshot-readonly.sql`

The script captures schema metadata only:

- server/database identity metadata without secrets;
- PostgreSQL version;
- public tables;
- public columns;
- public enum types and enum values;
- indexes;
- constraints;
- foreign keys;
- sequences;
- `_prisma_migrations` metadata only:
  - `migration_name`;
  - `finished_at`;
  - `rolled_back_at`;
  - `applied_steps_count`;
  - `started_at`.

The script does not export table row data, client names, case titles, document text, user emails, or other business content.

Example execution shape:

```powershell
# Local/session only. Do not print the value.
$env:SCHEMA_SNAPSHOT_DATABASE_URL = "<clone read-only connection string>"

psql $env:SCHEMA_SNAPSHOT_DATABASE_URL `
  --set=ON_ERROR_STOP=1 `
  --file docs/sql/production-schema-snapshot-readonly.sql `
  --output docs/production-schema-snapshot-raw-output.txt

Remove-Item Env:\SCHEMA_SNAPSHOT_DATABASE_URL -ErrorAction SilentlyContinue
```

Do not commit raw output if it contains anything sensitive. Prefer a sanitized summarized results document.

## 6. Destructive statement guard

Before running the script, prove it contains no mutating DDL/DML statements:

```powershell
Select-String -Path docs/sql/production-schema-snapshot-readonly.sql `
  -Pattern '\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b' `
  -CaseSensitive:$false
```

Expected result:

- no SQL command matches;
- comment/runbook text does not matter if scanning the SQL file only, but the SQL file should avoid these words in comments too.

If any match appears, stop and review before execution.

## 7. Prisma schema extraction/comparison plan

Compare three sources:

1. actual DB snapshot from the fresh clone;
2. current `Backend/prisma/schema.prisma`;
3. repo migration folders under `Backend/prisma/migrations`.

The comparison should identify:

- Prisma models absent from actual DB;
- actual DB tables absent from `schema.prisma`;
- columns in `schema.prisma` absent from actual DB;
- DB columns absent from `schema.prisma`;
- enum differences;
- index differences;
- constraint and FK differences;
- migration history differences.

Suggested non-mutating comparison approach:

- parse the snapshot output into sanitized tables/lists;
- extract Prisma model/table mappings from `schema.prisma` manually or with read-only local scripts;
- compare migration folders by name to `_prisma_migrations` metadata;
- do not use `prisma migrate deploy`, `resolve`, `dev`, or `db push`;
- use `prisma validate` only locally against repo schema.

## 8. Output handling

Sanitized output requirements:

- no connection strings;
- no passwords;
- no access tokens;
- no client names;
- no user emails;
- no document text;
- no case titles;
- no table row exports;
- no raw business data.

Acceptable output:

- table names;
- column names/types/nullability/defaults;
- enum names/values;
- index definitions;
- constraint/FK names and definitions;
- migration names and timestamps;
- counts of objects, not business rows.

Do not commit `docs/production-schema-snapshot-raw-output.txt` unless it has been reviewed and sanitized. The preferred committed artifact is a summarized markdown results file.

## 9. Documentation template for results

Future results doc path:

`docs/production-schema-snapshot-comparison-results.md`

Suggested sections:

1. Executive summary.
2. Clone identity.
3. Safety confirmation.
4. Snapshot summary.
5. Prisma schema vs actual DB summary.
6. High-risk mismatches.
7. Migration history differences.
8. Baseline/reset implications.
9. Whether production can be treated as source of truth.
10. Whether `schema.prisma` must be changed.
11. Whether missing historical features must be added.
12. Go/no-go for baseline/reset implementation.
13. Go/no-go for CP-SCHEMA-1 resume.
14. Clone deletion and cleanup proof.
15. Final classification.

## 10. Clone deletion instructions

Delete the clone after evidence capture unless an explicit retention reason exists.

```powershell
$cloneName = "adminiculum-schema-snapshot-YYYYMMDD"
$resourceGroup = "Adminiculum-RG"

az postgres flexible-server delete `
  --resource-group $resourceGroup `
  --name $cloneName `
  --yes

az postgres flexible-server list `
  --resource-group $resourceGroup `
  --query "[].{name:name,state:state,version:version}" `
  --output table
```

Post-delete expected state should show production server `adminiculum` and no stale schema snapshot clone unless a retention decision is documented.

## 11. Security cleanup

After snapshot execution:

```powershell
Remove-Item Env:\SCHEMA_SNAPSHOT_DATABASE_URL -ErrorAction SilentlyContinue
[bool]$env:SCHEMA_SNAPSHOT_DATABASE_URL
```

Expected boolean result: `False`.

If the clone is retained temporarily, revoke/drop the temporary read-only user when no longer needed. If the clone is deleted, the temporary user disappears with it.

## 12. Non-actions

Explicit non-actions:

- no `prisma migrate deploy`;
- no `prisma migrate resolve`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no production DB mutation;
- no clone DDL/DML during snapshot execution;
- no Azure App Service change;
- no runtime deploy;
- no schema or migration edits;
- no Client Portal enablement;
- no public route implementation;
- no business/client row export.

## 13. Proposed next operator prompt

Copy/paste prompt for the next operator-run phase:

```text
Adminiculum — operator fresh clone SELECT-only production schema snapshot

Goal:
Create a fresh PITR clone from current production, run the repo-prepared SELECT-only schema snapshot script against the clone with a temporary read-only user, compare the sanitized metadata to Backend/prisma/schema.prisma, document results, and delete the clone.

Repo:
C:\Users\hubay\Documents\Adminiculum
Branch:
hotfix/runtime-shape-20260308

Prepared files:
- docs/production-schema-snapshot-comparison-operator-runbook.md
- docs/sql/production-schema-snapshot-readonly.sql

Strict rules:
- do not mutate production;
- do not point App Service runtime at clone;
- use a fresh clone named adminiculum-schema-snapshot-YYYYMMDD;
- use temporary read-only DB user only;
- run SELECT-only metadata script only;
- do not run prisma migrate deploy/resolve/dev/db push;
- do not export business row data;
- do not print or commit secrets;
- delete clone after verification unless retention is explicitly approved.

Deliver:
- sanitized results doc at docs/production-schema-snapshot-comparison-results.md;
- clone deletion proof;
- go/no-go for baseline/reset implementation;
- go/no-go for CP-SCHEMA-1 resume.

Expected classification:
production_schema_snapshot_comparison_completed_select_only_no_runtime_change
```

## 14. Final classification

`production_schema_snapshot_comparison_runbook_documented_no_db_change_no_runtime_change`
